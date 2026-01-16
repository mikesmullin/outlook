import { loadAllEmails } from './storage.mjs';

/**
 * ANSI color codes
 */
export const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

/**
 * Colorize text
 * @param {string} text - Text to colorize
 * @param {string} color - Color code
 * @returns {string}
 */
export function colorize(text, color) {
    return `${color}${text}${colors.reset}`;
}

/**
 * Find an email by partial or full ID
 * @param {string} partialId - Full ID or partial ID prefix
 * @returns {Promise<{id: string, email: object} | null>}
 */
export async function findEmailById(partialId) {
    const emails = await loadAllEmails();
    
    // Normalize partial ID (remove .md or .yml if present)
    const normalized = partialId.replace('.md', '').replace('.yml', '').toLowerCase();
    
    // Find exact match first
    for (const { id, email } of emails) {
        if (id === normalized) {
            return { id, email };
        }
    }
    
    // Find prefix match (like git does)
    const matches = emails.filter(({ id }) => id.startsWith(normalized));
    
    if (matches.length === 0) {
        return null;
    }
    
    if (matches.length === 1) {
        const { id, email } = matches[0];
        return { id, email };
    }
    
    // Multiple matches
    throw new Error(
        `Ambiguous ID "${partialId}". Matches: ${matches.map(({ id }) => id).join(', ')}`
    );
}

/**
 * Format relative date
 * @param {string} isoDateString - ISO date string
 * @returns {string}
 */
export function formatRelativeDate(isoDateString) {
    const date = new Date(isoDateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        // Today - show time
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `Today ${hours}:${minutes}`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return dayNames[date.getDay()];
    } else {
        // Older - show date
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}/${day}`;
    }
}

/**
 * Format sender name
 * @param {object} email - Email object
 * @returns {string}
 */
export function formatSender(email) {
    const from = email.from?.emailAddress;
    if (!from) return 'Unknown';
    
    if (from.name) {
        return `${from.name} <${from.address}>`;
    }
    return from.address;
}

/**
 * Get short ID (first 6 chars)
 * @param {string} id - Full ID
 * @returns {string}
 */
export function getShortId(id) {
    return id.substring(0, 6);
}
