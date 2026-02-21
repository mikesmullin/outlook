import { parseArgs } from 'util';
import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, paint, palette, pink, mint, yellow, dim } from '../../lib/utils.mjs';

export default async function deleteCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email delete <id> [--clear]

Queue an email for soft-deletion (offline). The email will be moved to Deleted
Items in Outlook when you run "outlook-email apply".

Arguments:
  <id>          Email hash ID or partial ID (e.g., f591c0)

Options:
  -c, --clear   Remove the deletion marker (undo)
  -h, --help    Show this help

Examples:
  outlook-email delete f591c0
  outlook-email delete --clear f591c0
`);
        return;
    }

    const { values, positionals } = parseArgs({
        args,
        options: {
            clear: { type: 'boolean', short: 'c', default: false },
            help:  { type: 'boolean', short: 'h' },
        },
        allowPositionals: true,
    });

    if (positionals.length === 0) {
        console.error(`${pink('✗')} Error: <id> argument required`);
        process.exit(1);
    }

    const partialId = positionals[0];
    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`${pink('✗')} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;
    const subject = email.subject || '(No Subject)';
    const shortId = id.substring(0, 6);

    if (!email.offline) email.offline = {};
    if (!email.offline.pending) email.offline.pending = {};

    if (values.clear) {
        if (!email.offline.pending.delete) {
            console.log(`${yellow('⊘')} ${paint(shortId, palette.hash)} not marked for deletion`);
            return;
        }
        delete email.offline.pending.delete;
        if (Object.keys(email.offline.pending).length === 0) delete email.offline.pending;
        if (Object.keys(email.offline).length === 0) delete email.offline;
        await saveEmail(id, email);
        console.log(`${mint('✓')} Cleared deletion marker: ${paint(shortId, palette.hash)}`);
        console.log(`  ${paint(subject, palette.subject)}`);
    } else {
        if (email.offline.pending.delete) {
            console.log(`${yellow('⊘')} ${paint(shortId, palette.hash)} already marked for deletion`);
            return;
        }
        email.offline.pending.delete = true;
        await saveEmail(id, email);
        console.log(`${pink('✓')} Marked for deletion: ${paint(shortId, palette.hash)}`);
        console.log(`  ${paint(subject, palette.subject)}`);
        console.log(`  ${dim('Run "outlook-email apply" to soft-delete from Outlook.')}`);
    }
}
