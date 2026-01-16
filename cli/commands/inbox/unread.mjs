import { loadEmail, saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

export default async function unreadCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email inbox unread <id>

Mark an email as unread (offline). Removes 'offline.read' from the YAML file.

Arguments:
  <id>    Email hash ID, partial ID, or filename (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  outlook-email inbox unread f86bca
  outlook-email inbox unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1
  outlook-email inbox unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1.yml
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

    // Check if already unread
    if (!email.offline?.read) {
        console.log(`${colorize('⊘', colors.yellow)} Email already unread: ${id}`);
        return;
    }

    // Mark as unread (remove offline.read)
    if (email.offline) {
        delete email.offline.read;
        delete email.offline.readAt;
        
        // If offline object is now empty, remove it
        if (Object.keys(email.offline).length === 0) {
            delete email.offline;
        }
    }

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Marked as unread: ${id}`);
    console.log(`  ${subject}`);
}
