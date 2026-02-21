import moveCommand from './inbox/move.mjs';

function printUsage() {
    console.log(`
Usage: outlook-email inbox <subcommand> [options]

Subcommands:
  move <id>            Queue move to a folder (offline)

Options:
  -h, --help           Show help for this command

Examples:
  outlook-email inbox move f86bca --folder Processed
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
        case 'move':
            await moveCommand(subArgs);
            break;
        default:
            console.error(`Unknown inbox subcommand: ${subcommand}`);
            printUsage();
            process.exit(1);
    }
}
