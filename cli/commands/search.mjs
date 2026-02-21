import { getGraphClient } from '../lib/client.mjs';
import { loadEmail, saveEmail } from '../lib/storage.mjs';
import { createHash } from 'crypto';
import {
    palette,
    paint,
    truncate,
    formatRelativeDate,
    formatSenderShort,
    getShortId,
} from '../lib/utils.mjs';

function hashOutlookId(id) {
    return createHash('sha1').update(id).digest('hex');
}

async function findFolderByName(client, targetName) {
    const normalizedTarget = targetName.trim().toLowerCase();

    async function getRootFolders() {
        const response = await client
            .api('/me/mailFolders')
            .select('id,displayName,childFolderCount')
            .top(200)
            .get();
        return response.value || [];
    }

    async function getChildFolders(folderId) {
        const response = await client
            .api(`/me/mailFolders/${folderId}/childFolders`)
            .select('id,displayName,childFolderCount')
            .top(200)
            .get();
        return response.value || [];
    }

    const queue = await getRootFolders();
    while (queue.length > 0) {
        const folder = queue.shift();
        if ((folder.displayName || '').trim().toLowerCase() === normalizedTarget) {
            return folder;
        }
        if (folder.childFolderCount > 0) {
            queue.push(...(await getChildFolders(folder.id)));
        }
    }
    return null;
}

export default async function searchCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email search <query> [options]

Search emails via Microsoft Graph API (online search, all folders by default).
Results are fetched from Outlook — not the local cache.

Arguments:
  <query>          KQL search string (e.g., "SSL classicteam", "subject:SSL from:sshamansky")

Options:
  --folder <name>  Limit search to a specific folder (e.g., Inbox, Processed)
  -l, --limit <n>  Max results to return (default: 10)
  --since <date>   Only show emails after this date (YYYY-MM-DD)
  --store          Pull matching emails into local cache (like pull)
  --help           Show this help

Examples:
  outlook-email search "SSL classicteam"
  outlook-email search "subject:SSL from:sshamansky" --folder Inbox
  outlook-email search "BranchPolice" --limit 5 --since 2026-01-01
  outlook-email search "classicteam certificate" --store
`);
        return;
    }

    // First non-flag arg is the query
    const queryArg = args[0];
    if (queryArg.startsWith('--')) {
        console.error('Error: first argument must be a search query string.');
        process.exit(1);
    }

    let folderFilter = null;
    let limit = 10;
    let sinceDate = null;
    let store = false;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--folder') {
            folderFilter = args[++i];
        } else if (args[i] === '-l' || args[i] === '--limit') {
            limit = parseInt(args[++i], 10);
            if (isNaN(limit) || limit <= 0) throw new Error('--limit must be a positive number');
        } else if (args[i] === '--since') {
            const raw = args[++i];
            if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) {
                sinceDate = new Date(raw + 'T00:00:00Z');
            } else {
                throw new Error(`Invalid --since format: "${raw}". Use YYYY-MM-DD.`);
            }
        } else if (args[i] === '--store') {
            store = true;
        }
    }

    const { client } = await getGraphClient();

    // Resolve folder ID if specified
    let folderId = null;
    if (folderFilter) {
        const folder = await findFolderByName(client, folderFilter);
        if (!folder) {
            console.error(`Folder not found: ${folderFilter}`);
            process.exit(1);
        }
        folderId = folder.id;
    }

    // Build the API endpoint
    const endpoint = folderId
        ? `/me/mailFolders/${folderId}/messages`
        : '/me/messages';

    let request = client
        .api(endpoint)
        .search(`"${queryArg}"`)
        .select('id,from,sender,subject,receivedDateTime,isRead,flag,bodyPreview,importance,hasAttachments,conversationId,toRecipients,ccRecipients,bccRecipients,webLink,body,parentFolderId')
        .top(Math.min(limit, 50));

    let results;
    try {
        const response = await request.get();
        results = response.value || [];
    } catch (error) {
        console.error('Search failed:', error.message);
        process.exit(1);
    }

    // Apply since filter (Graph $search doesn't support $filter together)
    if (sinceDate) {
        results = results.filter(e => new Date(e.receivedDateTime) >= sinceDate);
    }

    // Trim to limit
    results = results.slice(0, limit);

    if (results.length === 0) {
        console.log(`No results found for: "${queryArg}"`);
        return;
    }

    const termWidth = process.stdout.columns || 120;
    const numWidth = String(results.length).length;
    const hashW = 6, dateW = 9, senderW = 26;
    const overhead = 3 + (numWidth + 1) + 2 + hashW + 2 + dateW + 2 + senderW + 2;
    const subjectW = Math.max(20, termWidth - overhead);
    const BOL = '\x1b[1G';

    const label = results.length === 1 ? 'result' : 'results';
    process.stdout.write(BOL + '\n');
    process.stdout.write(BOL + `🔍 ${paint(String(results.length), palette.count)} ${label} for "${queryArg}":\n`);
    process.stdout.write(BOL + '\n');

    let stored = 0;
    for (let i = 0; i < results.length; i++) {
        const email = results[i];
        const hash = hashOutlookId(email.id);
        const shortId = hash.substring(0, 6);
        const lineNum = String(i + 1).padStart(numWidth) + '.';
        const dateStr = formatRelativeDate(email.receivedDateTime).padEnd(dateW);
        const senderStr = truncate(formatSenderShort(email), senderW).padEnd(senderW);
        const subjectStr = truncate(email.subject || '(No Subject)', subjectW);

        process.stdout.write(
            BOL +
            `   ${paint(lineNum, palette.lineNum)}` +
            `  ${paint(shortId, palette.hash)}` +
            `  ${paint(dateStr, palette.date)}` +
            `  ${paint(senderStr, palette.sender)}` +
            `  ${paint(subjectStr, palette.subject)}` +
            '\n'
        );

        if (store) {
            // Store into local cache (like pull)
            const { body, ...emailMeta } = email;
            emailMeta._stored_id = hash;
            emailMeta._stored_at = new Date().toISOString();
            await saveEmail(hash, { ...emailMeta, body });
            stored++;
        }
    }

    process.stdout.write('\n');

    if (store) {
        console.log(`Stored ${stored} email(s) to local cache.`);
    }
}
