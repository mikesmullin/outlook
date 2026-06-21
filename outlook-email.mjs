#!/usr/bin/env bun

import { fileURLToPath } from 'url';
import path from 'path';
import moveCommand from './cli/commands/move.mjs';
import sendCommand from './cli/commands/send.mjs';
import listCommand from './cli/commands/inbox/list.mjs';
import viewCommand from './cli/commands/inbox/view.mjs';
import readCommand from './cli/commands/inbox/read.mjs';
import unreadCommand from './cli/commands/inbox/unread.mjs';
import deleteCommand from './cli/commands/inbox/delete.mjs';
import searchCommand from './cli/commands/search.mjs';
import folderCommand from './cli/commands/folder.mjs';
import calendarCommand from './cli/commands/calendar.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
Usage: outlook-email <command> [options]

Commands:
  send --to <email> --subject <text> [--html] <file>  Send an email via SMTP
  list                         List emails from Outlook (default: Inbox)
  view <id>                    Fetch & show a single email
  read <id>                    Mark an email as read (immediate)
  unread <id>                  Mark an email as unread (immediate)
  move <id> --folder <name>    Move an email to a folder (immediate)
  delete <id>                  Delete an email → Deleted Items (confirms first)
  folders                      List all mailbox folders as a tree
  search <query>               Search emails via Microsoft Graph
  calendar list|view           Read your Outlook calendar

Ids are short ids printed by 'list' / 'search' (cached in db/idmap.yml).
Use:
  outlook-email <command> --help

Examples:
  outlook-email list --limit 20
  outlook-email list --folder Processed --unread-only
  outlook-email search "SSL classicteam"
  outlook-email view 6498ce
  outlook-email read 6498ce
  outlook-email move 6498ce --folder Processed
  outlook-email delete 6498ce
  outlook-email folders
  outlook-email calendar list --days 7
  outlook-email calendar view a1b2c3
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    const mainCommand = args[0];

    if (mainCommand === 'send') {
        sendCommand(args.slice(1));
    } else if (mainCommand === 'move') {
        try {
            await moveCommand(args.slice(1));
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
    } else if (mainCommand === 'search') {
        try {
            await searchCommand(args.slice(1));
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else if (mainCommand === 'calendar' || mainCommand === 'cal') {
        try {
            await calendarCommand(args.slice(1));
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
