import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEND_SCRIPT = path.join(__dirname, 'send_browser.py');

function printUsage() {
    console.log(`
Usage: outlook-email send --to <email> --subject <subject> [options] <file>

Send an email via Outlook Web using browser automation.
The body is read from <file> (use - to read from stdin).
Requires uv and the browser-use Python package.

Arguments:
  <file>             File containing the email body (or - for stdin)

Options:
  --to <email>       Recipient email address (required)
  --subject <text>   Email subject (required)
  --html             Treat body as raw HTML
  --headed           Show the browser window (default: headless)
  -v, --verbose      Show progress output
  --debug            Pause at compose window for interactive JS inspection
  -h, --help         Show this help

Examples:
  outlook-email send --to alice@example.com --subject "Hello" body.txt
  outlook-email send --to alice@example.com --subject "Report" --html report.html
  echo "Hi there" | outlook-email send --to alice@example.com --subject "Hi" -
`);
}

export default function sendCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const opts = { to: null, subject: null, html: false, headed: false, verbose: false, debug: false };
    const positional = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to') opts.to = args[++i];
        else if (args[i] === '--subject') opts.subject = args[++i];
        else if (args[i] === '--html') opts.html = true;
        else if (args[i] === '--headed') opts.headed = true;
        else if (args[i] === '-v' || args[i] === '--verbose') opts.verbose = true;
        else if (args[i] === '--debug') opts.debug = true;
        else if (!args[i].startsWith('-')) positional.push(args[i]);
        else { console.error(`Unknown option: ${args[i]}`); process.exit(1); }
    }

    if (!opts.to) { console.error('Error: --to is required'); process.exit(1); }
    if (!opts.subject) { console.error('Error: --subject is required'); process.exit(1); }
    if (positional.length === 0) { console.error('Error: <file> argument is required'); process.exit(1); }

    const file = positional[positional.length - 1];
    let body;
    try {
        body = file === '-'
            ? readFileSync('/dev/stdin', 'utf8')
            : readFileSync(path.resolve(file), 'utf8');
    } catch (err) {
        console.error(`Error reading file: ${err.message}`);
        process.exit(1);
    }

    const uvArgs = ['run', SEND_SCRIPT, '--to', opts.to, '--subject', opts.subject, '--body', body];
    if (opts.html) uvArgs.push('--html');
    if (opts.verbose) uvArgs.push('--verbose');
    if (opts.headed) uvArgs.push('--headed');
    if (opts.debug) uvArgs.push('--debug');

    const result = spawnSync('uv', uvArgs, { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
