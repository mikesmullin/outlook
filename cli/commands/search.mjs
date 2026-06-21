import { getGraphClient, msgApi, findFolderByName, toImmutableIds } from '../lib/client.mjs';
import { upsertMany } from '../lib/idmap.mjs';
import {
    palette,
    paint,
    truncate,
    formatRelativeDate,
    formatSenderShort,
} from '../lib/utils.mjs';

export default async function searchCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email search <query> [options]

Search emails via Microsoft Graph (all folders by default). Each result's short
id is cached locally so you can pass it to view/read/unread/move/delete.

Arguments:
  <query>          KQL search string (e.g., "SSL classicteam", "subject:SSL from:asmith")

Options:
  --folder <name>  Limit search to a specific folder (e.g., Inbox, Processed)
  -l, --limit <n>  Max results to return (default: 10)
  --since <date>   Only show emails after this date (YYYY-MM-DD)
  --help           Show this help

Examples:
  outlook-email search "SSL classicteam"
  outlook-email search "subject:SSL from:asmith" --folder Inbox
  outlook-email search "renewal" --limit 5 --since 2026-01-01
`);
        return;
    }

    const queryArg = args[0];
    if (queryArg.startsWith('--')) {
        console.error('Error: first argument must be a search query string.');
        process.exit(1);
    }

    let folderFilter = null;
    let limit = 10;
    let sinceDate = null;

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
        }
    }

    const { client } = await getGraphClient();

    let folderId = null;
    if (folderFilter) {
        const folder = await findFolderByName(client, folderFilter);
        if (!folder) {
            console.error(`Folder not found: ${folderFilter}`);
            process.exit(1);
        }
        folderId = folder.id;
    }

    const endpoint = folderId
        ? `/me/mailFolders/${folderId}/messages`
        : '/me/messages';

    const request = msgApi(client, endpoint)
        .search(`"${queryArg}"`)
        .select('id,from,sender,subject,receivedDateTime,isRead,bodyPreview')
        .top(Math.min(limit, 50));

    let results;
    try {
        const response = await request.get();
        results = response.value || [];
    } catch (error) {
        console.error('Search failed:', error.message);
        process.exit(1);
    }

    if (sinceDate) {
        results = results.filter((e) => new Date(e.receivedDateTime) >= sinceDate);
    }
    results = results.slice(0, limit);

    if (results.length === 0) {
        console.log(`No results found for: "${queryArg}"`);
        return;
    }

    // $search ignores the immutable-id header, so translate to immutable ids to
    // keep one stable id space across commands, then cache short→full.
    const immutableIds = await toImmutableIds(client, results.map((e) => e.id));
    const shorts = await upsertMany(immutableIds);

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

    for (let i = 0; i < results.length; i++) {
        const email = results[i];
        const lineNum = String(i + 1).padStart(numWidth) + '.';
        const dateStr = formatRelativeDate(email.receivedDateTime).padEnd(dateW);
        const senderStr = truncate(formatSenderShort(email), senderW).padEnd(senderW);
        const subjectStr = truncate(email.subject || '(No Subject)', subjectW);

        process.stdout.write(
            BOL +
            `   ${paint(lineNum, palette.lineNum)}` +
            `  ${paint(shorts[i], palette.hash)}` +
            `  ${paint(dateStr, palette.date)}` +
            `  ${paint(senderStr, palette.sender)}` +
            `  ${paint(subjectStr, palette.subject)}` +
            '\n'
        );
    }

    process.stdout.write('\n');
}
