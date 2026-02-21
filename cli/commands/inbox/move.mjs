import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email inbox move <id> --folder <name>

Queue an email to be moved to a folder (offline). Adds 'offline.pending.moveToFolder' to the YAML file.

Arguments:
  <id>              Email hash ID, partial ID, or filename

Options:
  --folder <name>   Target Outlook folder display name
  -h, --help        Show this help message

Examples:
  outlook-email inbox move f86bca --folder Processed
  outlook-email inbox move f86bca --folder Alerts
`);
}

export default async function moveCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const partialId = args[0];
    let targetFolder = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--folder') {
            if (i + 1 < args.length) {
                targetFolder = args[i + 1];
                i++;
            } else {
                console.error('Error: --folder requires a folder name');
                process.exit(1);
            }
        }
    }

    if (!targetFolder || !targetFolder.trim()) {
        console.error('Error: --folder <name> is required');
        process.exit(1);
    }

    const result = await findEmailById(partialId);
    if (!result) {
        console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;
    const normalizedTarget = targetFolder.trim();

    if (!email.offline) {
        email.offline = {};
    }

    if (!email.offline.pending) {
        email.offline.pending = {};
    }

    const currentPendingMove = email.offline.pending.moveToFolder;
    if (currentPendingMove && currentPendingMove.toLowerCase() === normalizedTarget.toLowerCase()) {
        console.log(`${colorize('⊘', colors.yellow)} Email already queued to move to ${normalizedTarget}: ${id}`);
        return;
    }

    email.offline.pending.moveToFolder = normalizedTarget;

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Queued move: ${id}`);
    console.log(`  ${subject}`);
    console.log(`  → ${normalizedTarget}`);
}
