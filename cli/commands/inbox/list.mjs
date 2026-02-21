import { loadAllEmails, getEmailFolder } from '../../lib/storage.mjs';
import {
    palette,
    paint,
    truncate,
    formatRelativeDate,
    formatSenderShort,
    getShortId,
} from '../../lib/utils.mjs';

const DEFAULT_LIMIT = 10;

function parseDate(dateStr) {
    let date = new Date();

    if (dateStr === 'yesterday') {
        date.setDate(date.getDate() - 1);
    } else if (dateStr.endsWith('ago')) {
        const match = dateStr.match(/^(\d+)\s+days?\s+ago$/i);
        if (match) {
            const daysAgo = parseInt(match[1], 10);
            date.setDate(date.getDate() - daysAgo);
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

List emails from storage (newest first).

Options:
  -l, --limit <n>      Maximum emails to list (default: ${DEFAULT_LIMIT})
  --since <date>       Only show emails after this date
                       Formats: YYYY-MM-DD, yesterday, "N days ago"
  --folder <name>      Only show emails from this source folder
  --help               Show this help

Examples:
  outlook-email list
  outlook-email list --limit 20
  outlook-email list --folder Alerts
  outlook-email list --since 2026-01-01
`);
        return;
    }

    let limit = DEFAULT_LIMIT;
    let sinceDate = null;
    let folderFilter = null;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-l' || args[i] === '--limit') {
            if (i + 1 < args.length) {
                limit = parseInt(args[i + 1], 10);
                if (isNaN(limit) || limit <= 0) {
                    throw new Error('--limit must be a positive number');
                }
                i++;
            }
        } else if (args[i] === '--since') {
            if (i + 1 < args.length) {
                sinceDate = parseDate(args[i + 1]);
                i++;
            }
        } else if (args[i] === '--folder') {
            if (i + 1 < args.length) {
                folderFilter = args[i + 1].trim().toLowerCase();
                i++;
            }
        }
    }

    let emails = await loadAllEmails();
    const totalInStorage = emails.length;

    // Filter by folder
    if (folderFilter) {
        emails = emails.filter(({ email }) => {
            const src = getEmailFolder(email).trim().toLowerCase();
            return src === folderFilter;
        });
    }

    // Filter by date
    if (sinceDate) {
        emails = emails.filter(({ email }) => {
            const receivedDate = new Date(email.receivedDateTime);
            return receivedDate >= sinceDate;
        });
    }

    // Sort by date (newest first)
    emails.sort(({ email: a }, { email: b }) => {
        const dateA = new Date(a.receivedDateTime);
        const dateB = new Date(b.receivedDateTime);
        return dateB - dateA;
    });

    if (emails.length === 0) {
        console.log('No emails found.');
        return;
    }

    const filteredCount = emails.length;
    const displayCount = Math.min(limit, filteredCount);
    const remaining = filteredCount - displayCount;
    const hiddenByFilter = totalInStorage - filteredCount;
    const termWidth = process.stdout.columns || 120;

    // column widths
    const numWidth  = String(displayCount).length; // digits in largest line number
    const hashW     = 6;
    const dateW     = 9; // e.g. "just now" = 8, "23h ago" = 7
    const senderW   = 26;
    // overhead: 3 (indent) + numWidth+1 (N.) + 2 + hashW + 2 + dateW + 2 + senderW + 2
    const overhead  = 3 + (numWidth + 1) + 2 + hashW + 2 + dateW + 2 + senderW + 2;
    const subjectW  = Math.max(20, termWidth - overhead);

    const label = filteredCount === 1 ? 'email' : 'emails';
    let headerLine = `${paint(String(filteredCount), palette.count)} ${label}`;
    if (displayCount < filteredCount) {
        headerLine += ` ${paint(`(showing ${displayCount})`, palette.muted)}`;
    }
    const shown = headerLine + ':';

    // BOL = CHA(1): force cursor to column 1 BEFORE writing content.
    // This defeats any cursor drift from wide/emoji chars on the previous line.
    const BOL = '\x1b[1G';
    // Separate writes: blank line, then header, then blank line separator.
    // Keeps spacing consistent across bare terminal and tmux/mari.
    process.stdout.write(BOL + '\n');
    process.stdout.write(BOL + '📧 ' + shown + '\n');
    process.stdout.write(BOL + '\n');

    for (let i = 0; i < displayCount; i++) {
        const { id, email } = emails[i];

        const lineNum  = String(i + 1).padStart(numWidth) + '.';
        const hashStr  = getShortId(id);
        const dateStr  = formatRelativeDate(email.receivedDateTime).padEnd(dateW);
        const senderStr = truncate(formatSenderShort(email), senderW).padEnd(senderW);
        const subjectStr = truncate(email.subject || '(No Subject)', subjectW);

        process.stdout.write(
            BOL +
            `   ${paint(lineNum, palette.lineNum)}` +
            `  ${paint(hashStr, palette.hash)}` +
            `  ${paint(dateStr, palette.date)}` +
            `  ${paint(senderStr, palette.sender)}` +
            `  ${paint(subjectStr, palette.subject)}` +
            '\n'
        );
    }

    if (remaining > 0) {
        process.stdout.write('\n' + BOL + `   ${paint(`... and ${remaining} more`, palette.muted)}` + '\n');
    }
    process.stdout.write('\n');
}