import { parseArgs } from 'util';
import { createInterface } from 'readline';
import { getGraphClient } from '../lib/client.mjs';
import { loadAllEmails, saveEmail, deleteEmail } from '../lib/storage.mjs';
import { paint, palette, pink, mint, yellow } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email apply [--yes]

Description:
  Apply pending offline changes to Outlook.

Options:
  -y, --yes   Skip confirmation prompt
  -h, --help  Show this help message

Examples:
  outlook-email apply
  outlook-email apply --yes
`);
}

async function confirm(prompt) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            const normalized = answer.trim().toLowerCase();
            resolve(normalized === 'y' || normalized === 'yes');
        });
    });
}

async function applyReadChange(client, email, targetRead) {
    await client
        .api(`/me/messages/${email.id}`)
        .patch({ isRead: targetRead });
}

async function getRootFolders(client) {
    const response = await client
        .api('/me/mailFolders')
        .select('id,displayName,childFolderCount')
        .top(200)
        .get();

    return response.value || [];
}

async function getChildFolders(client, folderId) {
    const response = await client
        .api(`/me/mailFolders/${folderId}/childFolders`)
        .select('id,displayName,childFolderCount')
        .top(200)
        .get();

    return response.value || [];
}

async function findFolderByName(client, targetName) {
    const queue = await getRootFolders(client);
    const normalizedTarget = targetName.trim().toLowerCase();

    while (queue.length > 0) {
        const folder = queue.shift();
        if ((folder.displayName || '').trim().toLowerCase() === normalizedTarget) {
            return folder;
        }

        if (folder.childFolderCount && folder.childFolderCount > 0) {
            const children = await getChildFolders(client, folder.id);
            queue.push(...children);
        }
    }

    return null;
}

async function applyDeleteChange(client, email) {
    await client
        .api(`/me/messages/${email.id}`)
        .delete();
}

async function applyMoveChange(client, email, targetFolderName) {
    const targetFolder = await findFolderByName(client, targetFolderName);
    if (!targetFolder) {
        throw new Error(`Folder not found: ${targetFolderName}`);
    }

    const movedMessage = await client
        .api(`/me/messages/${email.id}/move`)
        .post({ destinationId: targetFolder.id });

    return {
        movedMessage,
        targetFolder,
    };
}

export default async function applyCommand(args) {
    const { values } = parseArgs({
        args,
        options: {
            yes: { type: 'boolean', short: 'y', default: false },
            help: { type: 'boolean', short: 'h' },
        },
        allowPositionals: true,
    });

    if (values.help) {
        printUsage();
        return;
    }

    const emails = await loadAllEmails();
    const pending = emails.filter(({ email }) => email?.offline?.pending);

    if (pending.length === 0) {
        console.log('No pending changes to apply.');
        return;
    }

    console.log(`Found ${paint(String(pending.length), palette.count)} email(s) with pending changes.\n`);

    if (!values.yes) {
        const ok = await confirm('Apply these changes? (y/N) ');
        if (!ok) {
            console.log('Aborted.');
            return;
        }
    }

    const { client, handleAuthError } = await getGraphClient();
    let applied = 0;
    let errors = 0;

    for (const { id, email } of pending) {
        const pendingData = email?.offline?.pending || {};
        const subject = email.subject || '(No Subject)';
        const shortId = id.substring(0, 6);

        try {
            if (pendingData.delete) {
                try {
                    await applyDeleteChange(client, email);
                } catch (error) {
                    await handleAuthError(error, async (activeClient) => {
                        await applyDeleteChange(activeClient, email);
                    });
                }

                await deleteEmail(id);
                console.log(`${pink('🗑')} Deleted: ${paint(shortId, palette.hash)} / ${paint(subject, palette.subject)}`);
                applied++;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(pendingData, 'read')) {
                const targetRead = pendingData.read === true;

                try {
                    await applyReadChange(client, email, targetRead);
                } catch (error) {
                    await handleAuthError(error, async (activeClient) => {
                        await applyReadChange(activeClient, email, targetRead);
                    });
                }

                if (!email.offline) {
                    email.offline = {};
                }

                email.offline.read = targetRead;
                if (targetRead) {
                    email.offline.readAt = new Date().toISOString();
                } else {
                    delete email.offline.readAt;
                }
            }

            if (typeof pendingData.moveToFolder === 'string' && pendingData.moveToFolder.trim()) {
                const targetFolderName = pendingData.moveToFolder.trim();

                let moveResult;
                try {
                    moveResult = await applyMoveChange(client, email, targetFolderName);
                } catch (error) {
                    moveResult = await handleAuthError(error, async (activeClient) => {
                        return await applyMoveChange(activeClient, email, targetFolderName);
                    });
                }

                const { movedMessage, targetFolder } = moveResult;

                if (movedMessage?.id) {
                    email.id = movedMessage.id;
                }
                if (movedMessage?.webLink) {
                    email.webLink = movedMessage.webLink;
                }
                if (targetFolder?.id) {
                    email.parentFolderId = targetFolder.id;
                }
                if (targetFolder?.displayName) {
                    email.parentFolderName = targetFolder.displayName;
                }
            }

            if (!email.offline) {
                email.offline = {};
            }

            delete email.offline.pending;
            email.offline.last_sync = new Date().toISOString();

            if (Object.keys(email.offline).length === 0) {
                delete email.offline;
            }

            await saveEmail(id, email);
            console.log(`${mint('✓')} Applied: ${paint(shortId, palette.hash)} / ${paint(subject, palette.subject)}`);
            applied++;
        } catch (error) {
            console.error(`${pink('✗')} Failed: ${paint(shortId, palette.hash)} / ${paint(subject, palette.subject)}: ${pink(error.message)}`);
            errors++;
        }
    }

    console.log(`\nSummary:`);
    console.log(`  Applied: ${mint(String(applied))}`);
    console.log(`  Errors:  ${errors > 0 ? pink(String(errors)) : paint(String(errors), palette.muted)}`);
}
