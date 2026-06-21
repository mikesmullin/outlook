import { getGraphClient, msgApi } from '../../lib/client.mjs';
import { resolveId, removeByFullId } from '../../lib/idmap.mjs';
import yaml from 'js-yaml';

/**
 * Strip HTML tags from a string, collapsing any run of tags/whitespace into
 * a single space, then decode common HTML entities.
 */
function stripHtml(html) {
    if (!html) return '';
    const BLOCK = 'p|div|li|ul|ol|tr|td|th|h[1-6]|blockquote|pre|section|article|header|footer|nav|main|figure|figcaption|table|thead|tbody|tfoot';
    return html
        .replace(/<(br|hr)(\s*\/?)>/gi, '\n')
        .replace(new RegExp(`<(${BLOCK})(\\s[^>]*)?>`, 'gi'), '\n')
        .replace(new RegExp(`<\\/(${BLOCK})>`, 'gi'), '\n')
        .replace(/(\s*<[^>]+>\s*)+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
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

const MESSAGE_SELECT = [
    'id', 'from', 'toRecipients', 'ccRecipients', 'bccRecipients',
    'subject', 'receivedDateTime', 'isRead', 'importance', 'hasAttachments',
    'webLink', 'body', 'bodyPreview',
].join(',');

export default async function viewCommand(args) {
    let mode = 'text';  // default: headers + plain-text body
    let partialId = null;

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: outlook-email view <id> [--yaml|--text]

Fetch and display a single email directly from Outlook.

Arguments:
  <id>    Short id (from list/search), unique prefix, or full Graph id

Options:
  --text  Print headers + plain-text body (HTML stripped) [default]
  --yaml  Print full message metadata + body as YAML

Examples:
  outlook-email view 6498ce
  outlook-email view 6498ce --yaml
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

    const fullId = await resolveId(partialId);
    if (!fullId) {
        console.error(`Email not found: ${partialId} (run "outlook-email list" or "search" first to cache ids)`);
        process.exit(1);
    }

    const { client } = await getGraphClient();

    let email;
    try {
        email = await msgApi(client, `/me/messages/${fullId}`).select(MESSAGE_SELECT).get();
    } catch (error) {
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            await removeByFullId(fullId);
            console.error(`Email no longer exists in Outlook (stale id dropped): ${partialId}`);
            console.error('Run "outlook-email list" to refresh.');
            process.exit(1);
        }
        throw error;
    }

    if (mode === 'yaml') {
        console.log(yaml.dump(email, { indent: 2, lineWidth: -1, flowLevel: -1 }));
        return;
    }

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
        email.webLink ? `Link:    ${email.webLink}` : null,
    ].filter(Boolean).join('\n');

    const bodyContent = email.body?.content || '';
    const contentType = (email.body?.contentType || 'text').toLowerCase();
    const bodyText = contentType === 'html' ? stripHtml(bodyContent) : bodyContent.trim();

    console.log(headers + '\n\n' + bodyText);
}
