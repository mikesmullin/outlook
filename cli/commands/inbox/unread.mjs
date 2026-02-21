import { loadEmail, saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

export default async function unreadCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email unread <id>

Queue an email to be marked as unread (offline). Adds 'offline.pending.read: false' to the YAML file.

Arguments:
  <id>    Email hash ID, partial ID, or filename (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  outlook-email unread f86bca
  outlook-email unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1
  outlook-email unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1.yml
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

    if (!email.offline.pending) {
        email.offline.pending = {};
    }

    const currentRead = email.offline.read === true;
    const pendingRead = Object.prototype.hasOwnProperty.call(email.offline.pending, 'read')
        ? email.offline.pending.read === true
        : currentRead;

    if (pendingRead === false) {
        console.log(`${colorize('⊘', colors.yellow)} Email already queued as unread: ${id}`);
        return;
    }

    // Queue pending unread change
    email.offline.pending.read = false;

    // Remove no-op pending if user flips back to current state
    if (email.offline.pending.read === currentRead) {
        delete email.offline.pending.read;
    }

    if (Object.keys(email.offline.pending).length === 0) {
        delete email.offline.pending;
    }

    if (Object.keys(email.offline).length === 0) {
        delete email.offline;
    }

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Queued mark-unread: ${id}`);
    console.log(`  ${subject}`);
}
