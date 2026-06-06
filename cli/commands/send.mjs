import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEND_SCRIPT = path.join(__dirname, 'send_smtp.py');
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TOKEN_PATH = path.join(PROJECT_ROOT, '.tokens.yaml');

function printUsage() {
    console.log(`
Usage: outlook-email send --to <email> --subject <subject> [options] <file>

Send an email via SMTP (internal Exchange relay, no auth required).
The body is read from <file> (use - to read from stdin).

Arguments:
  <file>             File containing the email body (or - for stdin)

Options:
  --to <email>       Recipient address(es), comma-separated (required)
  --subject <text>   Email subject (required)
  --cc <email>       CC address(es), comma-separated
  --bcc <email>      BCC address(es), comma-separated
  --from <email>     Override the From address (default: from cached token)
  --html             Treat body as raw HTML
  --smtp-host <host> SMTP host (default: $SMTP_HOST, else sender domain MX)
  --smtp-port <port> SMTP port (default: $SMTP_PORT, else 25)
  -v, --verbose      Show progress / SMTP debug output
  -h, --help         Show this help

Examples:
  outlook-email send --to alice@example.com --subject "Hello" body.txt
  outlook-email send --to alice@example.com --subject "Report" --html report.html
  echo "Hi there" | outlook-email send --to alice@example.com --subject "Hi" -
`);
}

/**
 * Derive the sender identity (address + display name) from the cached Graph
 * token's JWT claims. Returns { from, fromName } or {} if unavailable.
 */
function identityFromToken() {
    try {
        const tokens = yaml.load(readFileSync(TOKEN_PATH, 'utf8'));
        const accessToken = tokens?.email?.access_token;
        if (!accessToken) return {};
        const payloadPart = accessToken.split('.')[1];
        if (!payloadPart) return {};
        const claims = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8'));
        return {
            from: claims.upn || claims.unique_name || claims.preferred_username || claims.email,
            fromName: claims.name || '',
        };
    } catch {
        return {};
    }
}

export default function sendCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const opts = {
        to: null, subject: null, cc: null, bcc: null, from: null,
        html: false, verbose: false, smtpHost: null, smtpPort: null,
    };
    const positional = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to') opts.to = args[++i];
        else if (args[i] === '--subject') opts.subject = args[++i];
        else if (args[i] === '--cc') opts.cc = args[++i];
        else if (args[i] === '--bcc') opts.bcc = args[++i];
        else if (args[i] === '--from') opts.from = args[++i];
        else if (args[i] === '--html') opts.html = true;
        else if (args[i] === '--smtp-host') opts.smtpHost = args[++i];
        else if (args[i] === '--smtp-port') opts.smtpPort = args[++i];
        else if (args[i] === '-v' || args[i] === '--verbose') opts.verbose = true;
        else if (args[i] === '-' || !args[i].startsWith('-')) positional.push(args[i]);
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

    const identity = identityFromToken();
    const fromAddr = opts.from || identity.from;
    if (!fromAddr) {
        console.error('Error: could not determine From address. Pass --from <email> or refresh the token cache.');
        process.exit(1);
    }

    const pyArgs = [SEND_SCRIPT, '--to', opts.to, '--subject', opts.subject, '--body', body, '--from', fromAddr];
    if (identity.fromName) pyArgs.push('--from-name', identity.fromName);
    if (opts.cc) pyArgs.push('--cc', opts.cc);
    if (opts.bcc) pyArgs.push('--bcc', opts.bcc);
    if (opts.html) pyArgs.push('--html');
    if (opts.smtpHost) pyArgs.push('--smtp-host', opts.smtpHost);
    if (opts.smtpPort) pyArgs.push('--smtp-port', opts.smtpPort);
    if (opts.verbose) pyArgs.push('--verbose');

    const result = spawnSync('python3', pyArgs, { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
