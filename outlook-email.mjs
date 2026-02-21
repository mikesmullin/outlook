#!/usr/bin/env bun

import { fileURLToPath } from 'url';
import path from 'path';
import inboxCommand from './cli/commands/inbox.mjs';
import listCommand from './cli/commands/inbox/list.mjs';
import viewCommand from './cli/commands/inbox/view.mjs';
import readCommand from './cli/commands/inbox/read.mjs';
import unreadCommand from './cli/commands/inbox/unread.mjs';
import deleteCommand from './cli/commands/inbox/delete.mjs';
import processedCommand from './cli/commands/inbox/processed.mjs';
import searchCommand from './cli/commands/search.mjs';
import pullCommand from './cli/commands/pull.mjs';
import folderCommand from './cli/commands/folder.mjs';
import cleanCommand from './cli/commands/clean.mjs';
import planCommand from './cli/commands/plan.mjs';
import applyCommand from './cli/commands/apply.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
Usage: outlook-email <command> [options]

Commands:
  inbox move <id>              Queue move to a folder (offline)
  list                         List unread emails from storage
  view <id>                    Show a single email (print YAML)
  read <id>                    Queue mark-read for an email (offline)
  unread <id>                  Queue mark-unread for an email (offline)
  delete <id>                  Queue soft-delete for an email (offline)
  processed <id>               Toggle local "processed" flag on an email (offline-only)
  search <query>               Search emails via Microsoft Graph (online)
  folders                      List all mailbox folders as a tree
  pull --since <date>          Fetch emails from Outlook to local cache
  plan                         Preview queued offline changes
  apply [-y]                   Apply queued changes to Outlook (-y skips prompt)
  clean                        Clear all local cached emails in storage/

Options depend on the command. Use:
  outlook-email <command> --help

Examples:
  outlook-email inbox move f86bca --folder Processed
  outlook-email list --limit 20
  outlook-email list --all
  outlook-email search "SSL classicteam"
  outlook-email search "subject:SSL" --folder Inbox
  outlook-email view 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  outlook-email read 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  outlook-email unread 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  outlook-email delete f591c0
  outlook-email folders
  outlook-email pull --since 2026-01-01
  outlook-email plan
  outlook-email apply
  outlook-email apply --yes
  outlook-email clean
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
    } else if (mainCommand === 'list') {
        try {
            await listCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'view') {
        try {
            await viewCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'read') {
        try {
            await readCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'unread') {
        try {
            await unreadCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'delete') {
        try {
            await deleteCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'processed') {
        try {
            await processedCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'search') {
        try {
            await searchCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'folders') {
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
    } else if (mainCommand === 'plan') {
        try {
            await planCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'apply') {
        try {
            await applyCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'clean') {
        try {
            await cleanCommand(args.slice(1));
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
