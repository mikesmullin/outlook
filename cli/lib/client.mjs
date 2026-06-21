import { Client } from '@microsoft/microsoft-graph-client';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

class AzureCliAuthProvider {
    constructor() {
        this.tokenCachePath = path.join(PROJECT_ROOT, '.tokens.yaml');
        this.cachedToken = null;
        this.tokenExpiry = null;
    }

    async loadCachedToken() {
        try {
            const data = await fs.readFile(this.tokenCachePath, 'utf8');
            const tokens = yaml.load(data);

            if (tokens?.email?.access_token && tokens?.email?.expires_at) {
                const expiryTime = new Date(tokens.email.expires_at);
                const now = new Date();

                const bufferTime = 5 * 60 * 1000; 
                if (expiryTime > new Date(now.getTime() + bufferTime)) {
                    this.cachedToken = tokens.email.access_token;
                    this.tokenExpiry = expiryTime;
                    return this.cachedToken;
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Warning: Could not load token cache: ${error.message}`);
            }
        }
        return null;
    }

    async saveCachedToken(token) {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                const expiryTime = new Date(payload.exp * 1000);

                let existingTokens = {};
                try {
                    const data = await fs.readFile(this.tokenCachePath, 'utf8');
                    existingTokens = yaml.load(data) || {};
                } catch (error) {
                }

                existingTokens.email = {
                    access_token: token,
                    expires_at: expiryTime.toISOString(),
                    cached_at: new Date().toISOString()
                };

                await fs.writeFile(this.tokenCachePath, yaml.dump(existingTokens, { indent: 2 }));

                this.cachedToken = token;
                this.tokenExpiry = expiryTime;
            }
        } catch (error) {
            console.error(`Warning: Could not cache token: ${error.message}`);
        }
    }

    async fetchFreshToken() {
        try {
            const scriptPath = path.join(__dirname, 'get-token.ps1');
            const { stdout } = await execAsync(`pwsh "${scriptPath}"`);
            const tokenMatch = stdout.match(/TOKEN=([A-Za-z0-9-_.]+)/);
            if (tokenMatch) {
                const token = tokenMatch[1];
                await this.saveCachedToken(token);
                return token;
            }
            throw new Error('Access token not found in script output');
        } catch (error) {
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    async getAccessToken() {
        const cachedToken = await this.loadCachedToken();
        if (cachedToken) {
            return cachedToken;
        }
        return await this.fetchFreshToken();
    }

    async invalidateToken() {
        this.cachedToken = null;
        this.tokenExpiry = null;

        try {
            const data = await fs.readFile(this.tokenCachePath, 'utf8');
            const tokens = yaml.load(data) || {};
            if (tokens.email) {
                delete tokens.email;
                await fs.writeFile(this.tokenCachePath, yaml.dump(tokens, { indent: 2 }));
            }
        } catch (error) {
        }

        return await this.fetchFreshToken();
    }
}

/**
 * Graph `Prefer` header value that asks for immutable item IDs. Immutable IDs
 * survive a `move` (mutable Graph IDs change on move), so the local id-map never
 * goes stale across folder moves.
 */
export const IMMUTABLE_ID_PREFER = 'IdType="ImmutableId"';

/**
 * Start a Graph request for a *message* endpoint with the immutable-ID header
 * applied. Centralizes the `Prefer: IdType="ImmutableId"` header so every message
 * read/mutation returns and accepts stable IDs.
 * @param {object} client - Microsoft Graph client
 * @param {string} apiPath - Graph API path (e.g. `/me/messages/{id}`)
 * @returns {object} a GraphRequest with the Prefer header set
 */
export function msgApi(client, apiPath) {
    return client.api(apiPath).header('Prefer', IMMUTABLE_ID_PREFER);
}

/**
 * Resolve a mailbox folder by display name (breadth-first across the folder
 * tree). Shared by commands that target a folder by name (move, search).
 * @param {object} client - Microsoft Graph client
 * @param {string} targetName - Folder display name (case-insensitive)
 * @returns {Promise<object|null>} the folder object, or null if not found
 */
export async function findFolderByName(client, targetName) {
    const normalizedTarget = targetName.trim().toLowerCase();

    async function getRoot() {
        const res = await client
            .api('/me/mailFolders')
            .select('id,displayName,childFolderCount')
            .top(200)
            .get();
        return res.value || [];
    }

    async function getChildren(folderId) {
        const res = await client
            .api(`/me/mailFolders/${folderId}/childFolders`)
            .select('id,displayName,childFolderCount')
            .top(200)
            .get();
        return res.value || [];
    }

    const queue = await getRoot();
    while (queue.length > 0) {
        const folder = queue.shift();
        if ((folder.displayName || '').trim().toLowerCase() === normalizedTarget) {
            return folder;
        }
        if (folder.childFolderCount && folder.childFolderCount > 0) {
            queue.push(...(await getChildren(folder.id)));
        }
    }
    return null;
}

/**
 * Translate Graph message ids to immutable ids in one batch call. Some endpoints
 * (notably `$search`) ignore the `Prefer: IdType="ImmutableId"` header and return
 * mutable ids; this converts them so every command shares one stable id space.
 * @param {object} client - Microsoft Graph client
 * @param {string[]} ids - source (rest) ids
 * @returns {Promise<string[]>} immutable ids, in the same order as input
 */
export async function toImmutableIds(client, ids) {
    if (!ids || ids.length === 0) return [];
    const res = await client.api('/me/translateExchangeIds').post({
        inputIds: ids,
        sourceIdType: 'restId',
        targetIdType: 'restImmutableEntryId',
    });
    const map = new Map((res.value || []).map((r) => [r.sourceId, r.targetId]));
    // Fall back to the original id if translation didn't return one.
    return ids.map((id) => map.get(id) || id);
}

export async function getGraphClient() {
    const authProvider = new AzureCliAuthProvider();
    const accessToken = await authProvider.getAccessToken();

    const client = Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });

    return {
        client,
        handleAuthError: async (error, retryFunction) => {
            const isAuthError = error.code === 'InvalidAuthenticationToken' ||
                error.code === 'Unauthorized' ||
                error.status === 401 ||
                error.statusCode === 401 ||
                (error.message && error.message.includes('401')) ||
                (error.message && error.message.includes('Unauthorized')) ||
                (error.message && error.message.includes('authentication'));

            if (isAuthError) {
                const freshToken = await authProvider.invalidateToken();
                const newClient = Client.init({
                    authProvider: (done) => {
                        done(null, freshToken);
                    }
                });
                return await retryFunction(newClient);
            }
            throw error;
        }
    };
}
