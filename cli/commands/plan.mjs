import { loadAllEmails } from '../lib/storage.mjs';
import { paint, palette, pink, mint, yellow, dim } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email plan

Description:
  Preview pending offline changes queued in local storage.

Options:
  -h, --help  Show this help message

Examples:
  outlook-email plan
`);
}

export default async function planCommand(args) {
    if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
        printUsage();
        return;
    }

    const emails = await loadAllEmails();
    const pending = emails.filter(({ email }) => email?.offline?.pending);

    if (pending.length === 0) {
        console.log('No pending changes.');
        return;
    }

    console.log('Planned changes:\n');

    let readOps = 0;
    let unreadOps = 0;
    let moveOps = 0;
    let deleteOps = 0;

    for (const { id, email } of pending) {
        const pendingData = email?.offline?.pending || {};
        const fromRead = email?.offline?.read === true;
        const subject = email.subject || '(No Subject)';
        const shortId = id.substring(0, 6);

        const marker = pendingData.delete ? pink('-') : yellow('~');
        console.log(`${marker} ${paint(shortId, palette.hash)} / ${paint(subject, palette.subject)}`);

        if (pendingData.delete) {
            console.log(`    ${pink('delete')} → Deleted Items`);
            deleteOps++;
        }

        if (Object.prototype.hasOwnProperty.call(pendingData, 'read')) {
            const toRead = pendingData.read === true;
            console.log(`    read: ${pink(String(fromRead))} → ${mint(String(toRead))}`);
            if (toRead) {
                readOps++;
            } else {
                unreadOps++;
            }
        }

        if (typeof pendingData.moveToFolder === 'string' && pendingData.moveToFolder.trim()) {
            console.log(`    move: ${dim('(current)')} → ${mint(pendingData.moveToFolder)}`);
            moveOps++;
        }

        console.log('');
    }

    console.log(`Plan: ${paint(String(pending.length), palette.count)} email(s) with changes`);
    console.log(`      ${paint(String(readOps), palette.count)} mark-read, ${paint(String(unreadOps), palette.count)} mark-unread, ${paint(String(moveOps), palette.count)} move, ${paint(String(deleteOps), palette.count)} delete`);
    console.log(`\n${dim('Run "outlook-email apply" to push these changes.')}`);
}
