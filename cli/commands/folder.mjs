import { getGraphClient } from '../lib/client.mjs';
import { paint, palette } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email folders

List all folders in the mailbox as an ASCII tree.

Options:
  --help  Show this help

Examples:
  outlook-email folder
`);
}

async function getRootFolders(client) {
    const response = await client
        .api('/me/mailFolders')
        .select('id,displayName,childFolderCount,unreadItemCount,totalItemCount')
        .top(200)
        .get();
    return response.value || [];
}

async function getChildFolders(client, folderId) {
    const response = await client
        .api(`/me/mailFolders/${folderId}/childFolders`)
        .select('id,displayName,childFolderCount,unreadItemCount,totalItemCount')
        .top(200)
        .get();
    return response.value || [];
}

function formatCounts(folder) {
    const unread = folder.unreadItemCount ?? 0;
    const total  = folder.totalItemCount  ?? 0;
    if (total === 0) return paint('(empty)', palette.muted);
    const unreadStr = unread > 0
        ? paint(String(unread), palette.count) + paint(' unread', palette.muted)
        : paint('0 unread', palette.muted);
    return `${unreadStr}${paint(', ', palette.muted)}${paint(String(total), palette.muted)} total`;
}

async function printTree(client, folders, prefix) {
    for (let i = 0; i < folders.length; i++) {
        const folder  = folders[i];
        const isLast  = i === folders.length - 1;
        const branch  = isLast ? '└── ' : '├── ';
        const name    = paint(folder.displayName, palette.subject);
        const counts  = formatCounts(folder);
        console.log(`${prefix}${branch}${name}  ${counts}`);

        if (folder.childFolderCount > 0) {
            const children  = await getChildFolders(client, folder.id);
            const childPfx  = prefix + (isLast ? '    ' : '│   ');
            await printTree(client, children, childPfx);
        }
    }
}

export default async function folderCommand(args) {
    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        return;
    }

    const { client } = await getGraphClient();
    const roots = await getRootFolders(client);

    console.log(`\n${paint('Mailbox Folders', palette.bold + palette.subject)}\n`);
    await printTree(client, roots, '');
    console.log();
}
