import { getGraphClient } from '../../cli/lib/client.mjs';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');

/**
 * Parse date from various formats
 * @param {string} dateStr - Date string in format: YYYY-MM-DD, yesterday, or "N days ago"
 * @returns {Date} Parsed date at midnight UTC
 */
function parseDate(dateStr) {
    let date = new Date();

    if (dateStr === 'yesterday') {
        date.setDate(date.getDate() - 1);
    } else if (dateStr.endsWith('ago')) {
        const match = dateStr.match(/^(\d+)\s+days?\s+ago$/i);
        if (match) {
            const daysAgo = parseInt(match[1], 10);
            date.setDate(date.getDate() - daysAgo);
        } else {
            throw new Error(`Invalid date format: "${dateStr}". Use "N days ago" format (e.g., "7 days ago" or "1 day ago").`);
        }
    } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // YYYY-MM-DD format
        date = new Date(dateStr + 'T00:00:00Z');
    } else {
        throw new Error(
            `Invalid date format: "${dateStr}". Accepted formats: YYYY-MM-DD, yesterday, or "N days ago".`
        );
    }

    // Set to midnight UTC
    date.setUTCHours(0, 0, 0, 0);
    return date;
}

/**
 * Generate SHA1 hash from Outlook email ID
 * @param {string} outlookId - The Outlook email ID
 * @returns {string} SHA1 hash
 */
function hashOutlookId(outlookId) {
    return createHash('sha1').update(outlookId).digest('hex');
}

/**
 * Format email reference with subject for human-readable output
 * @param {string} id - Email ID (hash or Outlook ID)
 * @param {string} subject - Email subject line
 * @param {number} maxLen - Maximum length of subject (default 64)
 * @returns {string} Formatted reference like "(id+subject...)"
 */
function formatEmailRef(id, subject, maxLen = 64) {
    const truncated = subject.length > maxLen ? subject.substring(0, maxLen) + '...' : subject;
    return `(${id}+${truncated})`;
}

/**
 * Ensure storage directory exists
 */
async function ensureStorageDir() {
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

/**
 * Check if email file already exists
 * @param {string} hash - SHA1 hash of email ID
 * @returns {boolean}
 */
async function fileExists(hash) {
    try {
        await fs.access(path.join(STORAGE_DIR, `${hash}.md`));
        return true;
    } catch {
        return false;
    }
}

/**
 * Write email to Markdown file with YAML front matter
 * @param {string} hash - SHA1 hash of email ID
 * @param {object} email - Email data object
 */
async function writeEmailToMarkdown(hash, email) {
    const filePath = path.join(STORAGE_DIR, `${hash}.md`);
    
    // Separate body.content from the rest of the email data
    const { body, ...emailWithoutBody } = email;
    const bodyContent = body?.content || '';
    const bodyContentType = body?.contentType || 'html';
    
    // Include body metadata (without content) in front matter
    const emailForFrontMatter = {
        ...emailWithoutBody,
        body: { contentType: bodyContentType },
    };
    
    const frontMatter = yaml.dump(emailForFrontMatter, {
        indent: 2,
        lineWidth: -1,
        flowLevel: -1,
    });
    
    // Pretty print HTML if it's HTML content
    let formattedBody = bodyContent;
    if (bodyContentType === 'html') {
        // Basic HTML formatting - add newlines after common tags
        formattedBody = bodyContent
            .replace(/></g, '>\n<')
            .replace(/\r\n/g, '\n');
    }
    
    const mdContent = `---\n${frontMatter}---\n\n# ${email.subject || '(No Subject)'}\n\n\`\`\`${bodyContentType}\n${formattedBody}\n\`\`\`\n`;
    
    await fs.writeFile(filePath, mdContent, 'utf8');
}

/**
 * Get ID of the "Processed" folder
 * @param {object} client - Microsoft Graph client
 * @returns {Promise<string>} Folder ID
 */
async function getProcessedFolderId(client) {
    try {
        const response = await client
            .api('/me/mailFolders')
            .filter("displayName eq 'Processed'")
            .get();

        if (response.value && response.value.length > 0) {
            return response.value[0].id;
        }

        // If not found, create it
        const createResponse = await client
            .api('/me/mailFolders')
            .post({
                displayName: 'Processed',
            });

        return createResponse.id;
    } catch (error) {
        throw new Error(`Failed to get/create Processed folder: ${error.message}`);
    }
}

/**
 * Mark email as read
 * @param {object} client - Microsoft Graph client
 * @param {string} messageId - Email message ID
 */
async function markAsRead(client, messageId) {
    try {
        await client
            .api(`/me/messages/${messageId}`)
            .patch({
                isRead: true,
            });
    } catch (error) {
        throw new Error(`Failed to mark email as read: ${error.message}`);
    }
}

/**
 * Move email to folder and return the moved message with new id/webLink and return the moved message with new id/webLink
 * @param {object} client - Microsoft Graph client
 * @param {string} messageId - Email message ID
 * @param {string} folderId - Target folder ID
 * @returns {Promise<object>} Moved message with new id and webLink
 */
async function moveToFolder(client, messageId, folderId) {
    try {
        const movedMessage = await client
            .api(`/me/messages/${messageId}/move`)
            .post({
                destinationId: folderId,
            });
        return movedMessage;
    } catch (error) {
        throw new Error(`Failed to move email to folder: ${error.message}`);
    }
}

/**
 * Fetch unread emails since given date
 * @param {Date} sinceDate - Fetch emails received on or after this date
 * @param {object} client - Microsoft Graph client
 * @returns {Promise<Array>} Array of emails
 */
async function fetchUnreadEmailsSinceDate(sinceDate, client) {
    const emails = [];
    const sinceDateStr = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Filter for unread emails received on or after sinceDate
    const filter = `isRead eq false and receivedDateTime ge ${sinceDate.toISOString()}`;

    try {
        let hasMore = true;
        let skipToken = null;

        while (hasMore) {
            let request = client
                .api('/me/mailFolders/inbox/messages')
                .filter(filter)
                .select(
                    'id,from,subject,receivedDateTime,isRead,flag,body,bodyPreview,importance,hasAttachments,conversationId,sender,toRecipients,ccRecipients,bccRecipients,webLink'
                )
                .orderby('receivedDateTime desc')
                .top(50);

            if (skipToken) {
                request = request.skipToken(skipToken);
            }

            const response = await request.get();

            if (!response.value || response.value.length === 0) {
                hasMore = false;
                break;
            }

            for (const email of response.value) {
                const receivedDate = new Date(email.receivedDateTime);

                // Stop if we've passed the since date
                if (receivedDate < sinceDate) {
                    hasMore = false;
                    break;
                }

                emails.push(email);
            }

            // Check for pagination token
            if (response['@odata.nextLink']) {
                // Extract skipToken from nextLink
                const nextLink = response['@odata.nextLink'];
                const match = nextLink.match(/\$skiptoken=([^&]+)/);
                if (match) {
                    skipToken = match[1];
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }
    } catch (error) {
        console.error('Error fetching emails:', error.message);
        throw error;
    }

    return emails;
}

function printUsage() {
    console.log(`
Usage: outlook-email pull --since <date> [options]

Required:
  --since <date>  Fetch unread emails since this date
                  Accepted formats:
                    - YYYY-MM-DD (e.g., 2026-01-01)
                    - yesterday
                    - N days ago (e.g., "7 days ago")

Options:
  -l, --limit <n>  Limit processing to first N emails (optional)
  --help            Show this help message

Examples:
  outlook-email pull --since 2026-01-01
  outlook-email pull --since yesterday --limit 5
  outlook-email pull --since "7 days ago"
`);
}

export default async function pullCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    let sinceDate = null;
    let limit = null;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--since') {
            if (i + 1 < args.length) {
                try {
                    sinceDate = parseDate(args[i + 1]);
                    i++;
                } catch (error) {
                    console.error(`Error: ${error.message}`);
                    process.exit(1);
                }
            } else {
                console.error('Error: --since requires a date argument');
                process.exit(1);
            }
        } else if (args[i] === '-l' || args[i] === '--limit') {
            if (i + 1 < args.length) {
                limit = parseInt(args[i + 1], 10);
                if (isNaN(limit) || limit <= 0) {
                    console.error('Error: --limit must be a positive number');
                    process.exit(1);
                }
                i++;
            } else {
                console.error('Error: --limit requires a number');
                process.exit(1);
            }
        }
    }

    if (!sinceDate) {
        console.error('Error: --since date is required');
        printUsage();
        process.exit(1);
    }

    console.log(`Fetching unread emails since: ${sinceDate.toISOString().split('T')[0]}`);
    if (limit) {
        console.log(`Processing limit: ${limit}`);
    }

    try {
        // Initialize Graph client
        const { client, handleAuthError } = await getGraphClient();

        // Ensure storage directory exists
        await ensureStorageDir();

        // Get Processed folder ID
        const processedFolderId = await getProcessedFolderId(client);

        // Fetch emails
        const emails = await fetchUnreadEmailsSinceDate(sinceDate, client);

        if (emails.length === 0) {
            console.log('No unread emails found.');
            return;
        }

        console.log(`Found ${emails.length} unread emails.`);

        let written = 0;
        let skipped = 0;
        let processed = 0;

        // Process each email (respecting limit)
        for (let idx = 0; idx < emails.length; idx++) {
            const email = emails[idx];

            // Check if we've hit the limit
            if (limit && processed >= limit) {
                console.log(`\nReached processing limit of ${limit}. Stopping.`);
                break;
            }

            try {
                const hash = hashOutlookId(email.id);
                const exists = await fileExists(hash);

                if (!exists) {
                    // Enhance email data with hash
                    const emailWithHash = {
                        ...email,
                        _stored_id: hash,
                        _stored_at: new Date().toISOString(),
                    };

                    await writeEmailToMarkdown(hash, emailWithHash);
                    console.log(`✓ Stored: ${formatEmailRef(hash, email.subject)}`);
                    written++;
                } else {
                    console.log(`⊘ Skipped (exists): ${formatEmailRef(hash, email.subject)}`);
                    skipped++;
                }

                // Mark as read and move to Processed folder
                console.log(`  → Marking as read...`);
                await markAsRead(client, email.id);
                console.log(`  → Moving to Processed folder...`);
                const movedMessage = await moveToFolder(client, email.id, processedFolderId);
                
                // Update stored email with new webLink from moved message
                if (movedMessage && movedMessage.webLink) {
                    email.webLink = movedMessage.webLink;
                    const emailWithHash = {
                        ...email,
                        _stored_id: hash,
                        _stored_at: new Date().toISOString(),
                    };
                    await writeEmailToMarkdown(hash, emailWithHash);
                    console.log(`  ✓ Updated in Outlook (webLink updated)`);
                } else {
                    console.log(`  ✓ Updated in Outlook`);
                }

                processed++;
            } catch (error) {
                console.error(`✗ Error processing email ${formatEmailRef(email.id, email.subject)}: ${error.message}`);
            }
        }

        console.log(`\nSummary:`);
        console.log(`  Available:  ${emails.length}`);
        console.log(`  Processed:  ${processed}`);
        console.log(`  Written:    ${written}`);
        console.log(`  Skipped:    ${skipped}`);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}
