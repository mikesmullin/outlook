import summaryCommand from './inbox/summary.mjs';
import listCommand from './inbox/list.mjs';
import viewCommand from './inbox/view.mjs';
import readCommand from './inbox/read.mjs';
import unreadCommand from './inbox/unread.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email inbox <subcommand> [options]

Subcommands:
  summary              Show unread/read/total counts by folder
  list                 List unread emails from storage
  view <id>            Show a single email (print YAML)
  read <id>            Mark an email as read (offline)
  unread <id>          Mark an email as unread (offline)

Options:
  -h, --help           Show help for this command

Examples:
  outlook-email inbox summary
  outlook-email inbox list --limit 20
  outlook-email inbox list --since yesterday
  outlook-email inbox view f86bca
  outlook-email inbox read f86bca
  outlook-email inbox unread f86bca
`);
}

export default async function inboxCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
        case 'summary':
            await summaryCommand(subArgs);
            break;
        case 'list':
            await listCommand(subArgs);
            break;
        case 'view':
            await viewCommand(subArgs);
            break;
        case 'read':
            await readCommand(subArgs);
            break;
        case 'unread':
            await unreadCommand(subArgs);
            break;
        default:
            console.error(`Unknown inbox subcommand: ${subcommand}`);
            printUsage();
            process.exit(1);
    }
}
