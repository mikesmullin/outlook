import { loadAllEmails, isEmailRead } from '../../lib/storage.mjs';
import {
    colorize,
    colors,
    formatRelativeDate,
    formatSender,
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
Usage: outlook-email inbox list [options]

List unread emails from storage (newest first).

Options:
  -l, --limit <n>    Maximum emails to list (default: ${DEFAULT_LIMIT})
  --since <date>     Only show emails after this date
                     Formats: YYYY-MM-DD, yesterday, "N days ago"
  -a, --all          Include read emails (marked offline.read: true)
  --help             Show this help

Examples:
  outlook-email inbox list
  outlook-email inbox list --limit 20
  outlook-email inbox list --since 2026-01-01
  outlook-email inbox list --since yesterday --all
`);
        return;
    }

    let limit = DEFAULT_LIMIT;
    let sinceDate = null;
    let includeRead = false;

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
        } else if (args[i] === '-a' || args[i] === '--all') {
            includeRead = true;
        }
    }

    let emails = await loadAllEmails();

    // Filter by read/unread status
    emails = emails.filter(({ email }) => {
        if (includeRead) return true;
        return !isEmailRead(email);
    });

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

    console.log(`\nShowing ${Math.min(limit, emails.length)} of ${emails.length} emails:\n`);

    for (let i = 0; i < Math.min(limit, emails.length); i++) {
        const { id, email } = emails[i];
        const shortId = getShortId(id);
        const relativeDate = formatRelativeDate(email.receivedDateTime);
        const sender = formatSender(email);
        const subject = email.subject || '(No Subject)';

        // Format with colors
        const idColorized = colorize(shortId, colors.cyan);
        const dateColorized = colorize(relativeDate, colors.magenta);
        const senderColorized = colorize(sender, colors.blue);
        const subjectColorized = colorize(subject, colors.bright);
        
        // First line: short id / date / sender
        console.log(`${idColorized} / ${dateColorized} / ${senderColorized}`);
        // Second line: subject (indented)
        console.log(`${subjectColorized}`);
        console.log();
    }

    if (emails.length > limit) {
        console.log(`... and ${emails.length - limit} more`);
    }
}
