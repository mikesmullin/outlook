import { getGraphClient } from '../../cli/lib/client.mjs';

const DEFAULT_LIMIT = 5;

function printUsage() {
    console.log(`
Usage: outlook-email folder list --folder <name> [options]

List recent emails from a specific Outlook folder (online).

Required:
  --folder <name>    Folder display name (e.g., Alerts)

Options:
  -l, --limit <n>    Number of emails to show (default: ${DEFAULT_LIMIT})
  --help             Show this help

Examples:
  outlook-email folder list --folder Alerts
  outlook-email folder list --folder Alerts --limit 10
`);
}

function formatSenderName(message) {
    const sender = message.from?.emailAddress;
    if (!sender) return '(Unknown Sender)';
    if (sender.name && sender.address) return `${sender.name} <${sender.address}>`;
    return sender.address || sender.name || '(Unknown Sender)';
}

function formatDate(isoDate) {
    if (!isoDate) return '(No Date)';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
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

async function listFolderMessages(client, folderId, limit) {
    const response = await client
        .api(`/me/mailFolders/${folderId}/messages`)
        .select('subject,from,receivedDateTime')
        .orderby('receivedDateTime desc')
        .top(Math.max(1, Math.min(limit, 50)))
        .get();

    return response.value || [];
}

export default async function folderCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const subcommand = args[0];
    if (subcommand !== 'list') {
        console.error(`Unknown folder subcommand: ${subcommand}`);
        printUsage();
        process.exit(1);
    }

    let folderName = null;
    let limit = DEFAULT_LIMIT;

    const subArgs = args.slice(1);
    for (let i = 0; i < subArgs.length; i++) {
        const arg = subArgs[i];
        if (arg === '--folder') {
            folderName = subArgs[i + 1];
            i++;
        } else if (arg === '-l' || arg === '--limit') {
            const parsed = parseInt(subArgs[i + 1], 10);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                throw new Error('--limit must be a positive integer');
            }
            limit = parsed;
            i++;
        }
    }

    if (!folderName) {
        throw new Error('--folder is required');
    }

    const { client } = await getGraphClient();

    const folder = await findFolderByName(client, folderName);
    if (!folder) {
        throw new Error(`Folder not found: ${folderName}`);
    }

    const messages = await listFolderMessages(client, folder.id, limit);

    if (messages.length === 0) {
        console.log(`No emails found in folder: ${folder.displayName}`);
        return;
    }

    console.log(`\nRecent emails in folder: ${folder.displayName}`);
    console.log(`Showing ${messages.length} email(s):\n`);

    for (const msg of messages) {
        const subject = msg.subject || '(No Subject)';
        const sender = formatSenderName(msg);
        const date = formatDate(msg.receivedDateTime);
        console.log(`${date} | ${sender}`);
        console.log(`${subject}`);
        console.log('');
    }
}
