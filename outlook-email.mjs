#!/usr/bin/env bun

import { fileURLToPath } from 'url';
import path from 'path';
import inboxCommand from './cli/commands/inbox.mjs';
import pullCommand from './cli/commands/pull.mjs';
import folderCommand from './cli/commands/folder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
Usage: outlook-email <command> [options]

Commands:
  inbox summary                Show unread/read/total email counts
  inbox list                   List unread emails from storage
  inbox view <id>              Show a single email (print YAML)
  inbox read <id>              Mark an email as read (offline)
    folder list --folder <name>  List recent emails from a specific Outlook folder
  pull --since <date>          Fetch unread emails from Outlook

Options depend on the command. Use:
  outlook-email <command> --help

Examples:
  outlook-email inbox summary
  outlook-email inbox list --limit 20
  outlook-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  outlook-email inbox read 6498cec18d676f08ff64932bf93e7ec33c0adb2b
    outlook-email folder list --folder Alerts --limit 5
  outlook-email pull --since 2026-01-01
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    const mainCommand = args[0];

    if (mainCommand === 'inbox') {
        try {
            await inboxCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'folder') {
        try {
            await folderCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'pull') {
        try {
            await pullCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else {
        console.error(`Unknown command: ${mainCommand}`);
        printUsage();
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
