import { getGraphClient, msgApi, findFolderByName } from '../../lib/client.mjs';
import { upsertMany } from '../../lib/idmap.mjs';
import {
    palette,
    paint,
    truncate,
    formatRelativeDate,
    formatSenderShort,
} from '../../lib/utils.mjs';

const DEFAULT_LIMIT = 10;

function parseDate(dateStr) {
    let date = new Date();

    if (dateStr === 'yesterday') {
        date.setDate(date.getDate() - 1);
    } else if (dateStr.endsWith('ago')) {
        const match = dateStr.match(/^(\d+)\s+days?\s+ago$/i);
        if (match) {
            date.setDate(date.getDate() - parseInt(match[1], 10));
        } else {
            throw new Error(`Invalid date format: "${dateStr}". Use "N days ago" format.`);
        }
    } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        date = new Date(dateStr + 'T00:00:00Z');
    } else {
        throw new Error(
            `Invalid date format: "${dateStr}". Accepted formats: YYYY-MM-DD, yesterday, or "N days ago".`
        );
    }

    date.setUTCHours(0, 0, 0, 0);
    return date;
}

export default async function listCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email list [options]

List emails directly from Outlook (newest first). Each row's short id is cached
locally so you can pass it to view/read/unread/move/delete.

Options:
  --folder <name>      Mailbox folder to list (default: Inbox)
  -l, --limit <n>      Maximum emails to list (default: ${DEFAULT_LIMIT})
  --since <date>       Only show emails received on/after this date
                       Formats: YYYY-MM-DD, yesterday, "N days ago"
  --unread-only        Only show unread emails
  --help               Show this help

Examples:
  outlook-email list
  outlook-email list --limit 20
  outlook-email list --folder Processed
  outlook-email list --since 2026-01-01 --unread-only
`);
        return;
    }

    let limit = DEFAULT_LIMIT;
    let sinceDate = null;
    let folderName = 'Inbox';
    let unreadOnly = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--unread-only') {
            unreadOnly = true;
        } else if (args[i] === '-l' || args[i] === '--limit') {
            limit = parseInt(args[++i], 10);
            if (isNaN(limit) || limit <= 0) throw new Error('--limit must be a positive number');
        } else if (args[i] === '--since') {
            sinceDate = parseDate(args[++i]);
        } else if (args[i] === '--folder') {
            folderName = args[++i];
        }
    }

    const { client } = await getGraphClient();

    // Resolve folder (Inbox is a well-known id; others resolved by name)
    let folderId = 'inbox';
    if (folderName && folderName.trim().toLowerCase() !== 'inbox') {
        const folder = await findFolderByName(client, folderName);
        if (!folder) {
            console.error(`Folder not found: ${folderName}`);
            process.exit(1);
        }
        folderId = folder.id;
    }

    let request = msgApi(client, `/me/mailFolders/${folderId}/messages`)
        .select('id,from,subject,receivedDateTime,isRead,bodyPreview')
        .orderby('receivedDateTime desc')
        .top(Math.min(limit, 50));

    const filters = [];
    if (sinceDate) filters.push(`receivedDateTime ge ${sinceDate.toISOString()}`);
    if (unreadOnly) filters.push('isRead eq false');
    if (filters.length) request = request.filter(filters.join(' and '));

    let emails;
    try {
        const response = await request.get();
        emails = response.value || [];
    } catch (error) {
        console.error('List failed:', error.message);
        process.exit(1);
    }

    emails = emails.slice(0, limit);

    if (emails.length === 0) {
        console.log('No emails found.');
        return;
    }

    // Populate the short→full id-map for every row we show.
    const shorts = await upsertMany(emails.map((e) => e.id));

    const termWidth = process.stdout.columns || 120;
    const numWidth  = String(emails.length).length;
    const hashW     = 6;
    const dateW     = 9;
    const senderW   = 26;
    const overhead  = 3 + (numWidth + 1) + 2 + hashW + 2 + dateW + 2 + senderW + 2;
    const subjectW  = Math.max(60, (termWidth - overhead) * 2);

    const label = emails.length === 1 ? 'email' : 'emails';
    const folderLabel = folderId === 'inbox' ? 'Inbox' : folderName;
    const shown = `${paint(String(emails.length), palette.count)} ${label} in ${paint(folderLabel, palette.sender)}:`;

    const BOL = '\x1b[1G';
    process.stdout.write(BOL + '\n');
    process.stdout.write(BOL + '📧 ' + shown + '\n');
    process.stdout.write(BOL + '\n');

    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const lineNum  = String(i + 1).padStart(numWidth) + '.';
        const hashStr  = shorts[i];
        const unreadDot = email.isRead ? ' ' : paint('•', palette.count);
        const dateStr  = formatRelativeDate(email.receivedDateTime).padEnd(dateW);
        const senderStr = truncate(formatSenderShort(email), senderW).padEnd(senderW);
        const subjectStr = truncate(email.subject || '(No Subject)', subjectW);

        process.stdout.write(
            BOL +
            `   ${paint(lineNum, palette.lineNum)}` +
            ` ${unreadDot}` +
            ` ${paint(hashStr, palette.hash)}` +
            `  ${paint(dateStr, palette.date)}` +
            `  ${paint(senderStr, palette.sender)}` +
            `  ${paint(subjectStr, palette.subject)}` +
            '\n'
        );
    }

    process.stdout.write('\n');
}
