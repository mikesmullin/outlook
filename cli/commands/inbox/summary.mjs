import { loadAllEmails, isEmailRead, getEmailFolder } from '../../lib/storage.mjs';

export default async function summaryCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email inbox summary

Show email counts by folder.

Examples:
  outlook-email inbox summary
`);
        return;
    }

    const emails = await loadAllEmails();

    // Group by folder
    const folderCounts = {};

    for (const { email } of emails) {
        const folder = getEmailFolder(email);
        if (!folderCounts[folder]) {
            folderCounts[folder] = { unread: 0, read: 0, total: 0 };
        }

        folderCounts[folder].total++;
        if (isEmailRead(email)) {
            folderCounts[folder].read++;
        } else {
            folderCounts[folder].unread++;
        }
    }

    console.log('\nFolder Summary:');
    console.log('===============');

    let totalUnread = 0;
    let totalRead = 0;
    let totalAll = 0;

    for (const [folder, counts] of Object.entries(folderCounts)) {
        console.log(`${folder}:`);
        console.log(`  Unread: ${counts.unread}`);
        console.log(`  Read:   ${counts.read}`);
        console.log(`  Total:  ${counts.total}`);
        console.log();

        totalUnread += counts.unread;
        totalRead += counts.read;
        totalAll += counts.total;
    }

    console.log('Overall:');
    console.log(`  Unread: ${totalUnread}`);
    console.log(`  Read:   ${totalRead}`);
    console.log(`  Total:  ${totalAll}`);
}
