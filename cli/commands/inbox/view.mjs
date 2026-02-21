import { findEmailById } from '../../lib/utils.mjs';
import yaml from 'js-yaml';

/**
 * Strip HTML tags from a string, collapsing any run of tags/whitespace into
 * a single space, then decode common HTML entities.
 */
function stripHtml(html) {
    if (!html) return '';
    // Block-level elements that should become newlines
    const BLOCK = 'p|div|li|ul|ol|tr|td|th|h[1-6]|blockquote|pre|section|article|header|footer|nav|main|figure|figcaption|table|thead|tbody|tfoot';
    return html
        // self-closing / void block tags
        .replace(/<(br|hr)(\s*\/?)>/gi, '\n')
        // opening block tags  → newline
        .replace(new RegExp(`<(${BLOCK})(\\s[^>]*)?>`, 'gi'), '\n')
        // closing block tags → newline
        .replace(new RegExp(`<\\/(${BLOCK})>`, 'gi'), '\n')
        // collapse all remaining (inline) tags to a single space
        .replace(/(\s*<[^>]+>\s*)+/g, ' ')
        // decode common entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        // collapse runs of blank lines to max 2
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function formatAddress(addr) {
    if (!addr) return '';
    const { name, address } = addr.emailAddress || addr;
    if (name && address) return `${name} <${address}>`;
    return address || name || '';
}

function formatAddressList(list) {
    if (!list || list.length === 0) return '';
    return list.map(formatAddress).filter(Boolean).join(', ');
}

export default async function viewCommand(args) {
    // parse flags — id is first non-flag arg
    let mode = 'yaml';  // default
    let partialId = null;

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: outlook-email view <id> [--yaml|--text]

Display a single email from storage.

Arguments:
  <id>    Email hash ID, partial ID, or filename
          - Full: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
          - Partial: 6498cec (as long as unique)
          - Filename: 6498cec18d676f08ff64932bf93e7ec33c0adb2b.yml

Options:
  --yaml  Print full YAML (default)
  --text  Print headers + plain-text body (HTML tags stripped)

Examples:
  outlook-email view 6498cec
  outlook-email view 6498cec --text
  outlook-email view 6498cec18d676f08ff64932bf93e7ec33c0adb2b
`);
            return;
        } else if (arg === '--yaml') {
            mode = 'yaml';
        } else if (arg === '--text') {
            mode = 'text';
        } else if (!arg.startsWith('-')) {
            partialId = arg;
        }
    }

    if (!partialId) {
        console.error('Error: <id> is required.');
        process.exit(1);
    }

    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`Email not found: ${partialId}`);
        process.exit(1);
    }

    const { email } = result;

    if (mode === 'text') {
        // Headers
        const from    = formatAddress(email.from);
        const to      = formatAddressList(email.toRecipients);
        const cc      = formatAddressList(email.ccRecipients);
        const bcc     = formatAddressList(email.bccRecipients);
        const subject = email.subject || '(No Subject)';
        const date    = email.receivedDateTime
            ? new Date(email.receivedDateTime).toLocaleString()
            : '';

        const headers = [
            `From:    ${from}`,
            `To:      ${to}`,
            cc  ? `Cc:      ${cc}`  : null,
            bcc ? `Bcc:     ${bcc}` : null,
            `Subject: ${subject}`,
            `Date:    ${date}`,
        ].filter(Boolean).join('\n');

        // Body
        const bodyContent = email.body?.content || '';
        const contentType = (email.body?.contentType || 'text').toLowerCase();
        const bodyText = contentType === 'html' ? stripHtml(bodyContent) : bodyContent.trim();

        console.log(headers + '\n\n' + bodyText);
    } else {
        const ymlContent = yaml.dump(email, {
            indent: 2,
            lineWidth: -1,
            flowLevel: -1,
        });
        console.log(ymlContent);
    }
}
