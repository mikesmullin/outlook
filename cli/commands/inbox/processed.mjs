import { loadEmail, saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

export default async function processedCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email processed <id>

Toggle an email's local "processed" flag (offline-only; never synced to Outlook).
Processed emails are hidden from \`outlook-email list\` by default.
Pass \`--all\` to \`list\` to include them.

Arguments:
  <id>    Email hash ID, partial ID, or filename (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  outlook-email processed f86bca
  outlook-email processed f86bca73ca8afaa2ed51d827e82d190644fc1ff1
`);
        return;
    }

    const partialId = args[0];
    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;

    if (!email.offline) {
        email.offline = {};
    }

    const current = email.offline.processed === true;
    email.offline.processed = !current;

    if (Object.keys(email.offline).length === 0) {
        delete email.offline;
    }

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    const direction = email.offline?.processed ? 'processed' : 'unprocessed';
    console.log(`${colorize('✓', colors.green)} ${id} is now marked as ${direction}`);
    console.log(`  ${subject}`);
}
