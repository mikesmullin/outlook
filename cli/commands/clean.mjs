import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');

function printUsage() {
    console.log(`
Usage: outlook-email clean

Description:
  Remove all locally cached email files from storage/.

Options:
  -h, --help  Show this help message

Examples:
  outlook-email clean
`);
}

export default async function cleanCommand(args) {
    if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
        printUsage();
        return;
    }

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const entries = await fs.readdir(STORAGE_DIR, { withFileTypes: true });

    if (entries.length === 0) {
        console.log('Storage is already empty.');
        return;
    }

    for (const entry of entries) {
        const entryPath = path.join(STORAGE_DIR, entry.name);
        await fs.rm(entryPath, { recursive: true, force: true });
    }

    console.log(`✓ Cleared local cache: removed ${entries.length} item(s) from storage/`);
}
