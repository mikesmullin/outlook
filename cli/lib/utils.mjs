import { loadAllEmails } from './storage.mjs';

// ─── legacy 3-bit ANSI (kept for backward compat) ────────────────────────────
export const colors = {
    reset:   '\x1b[0m',
    dim:     '\x1b[2m',
    bright:  '\x1b[1m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    gray:    '\x1b[90m',
};

export function colorize(text, color) {
    return `${color}${text}\x1b[0m`;
}

// ─── 24-bit color helpers ─────────────────────────────────────────────────────
/**
 * Return an ANSI 24-bit foreground escape sequence.
 * @param {number} r @param {number} g @param {number} b
 * @returns {string}
 */
export function rgb(r, g, b) {
    return `\x1b[38;2;${r};${g};${b}m`;
}

/** Named 24-bit color palette used across CLI output. */
export const palette = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    lineNum: rgb(110, 110, 110),  // muted gray
    hash:    rgb( 86, 182, 194),  // teal
    date:    rgb(255, 198, 109),  // amber
    sender:  rgb(130, 170, 255),  // periwinkle
    subject: rgb(220, 220, 220),  // off-white
    count:   rgb(255, 198, 109),  // amber (matches date)
    muted:   rgb(130, 130, 130),  // secondary gray
    success: rgb( 80, 200, 120),  // green
    error:   rgb(255,  85,  85),  // red
    warn:    rgb(255, 198, 109),  // amber
    // jira-style diff colours
    pink:    rgb(255, 121, 121),  // soft coral  – old values / removals
    mint:    rgb(123, 237, 159),  // mint green  – new values / additions
    yellow:  rgb(255, 209, 102),  // soft yellow – change markers / warnings
    cyan:    rgb(102, 217, 239),  // cyan        – info
};

// ─── jira-style convenience wrappers ─────────────────────────────────────────
/** Soft coral – deletions, old values */
export function pink(text)   { return paint(text, palette.pink); }
/** Mint green – additions, new values */
export function mint(text)   { return paint(text, palette.mint); }
/** Soft yellow – change markers, warnings */
export function yellow(text) { return paint(text, palette.yellow); }
/** Dim gray – secondary / less important text */
export function dim(text)    { return paint(text, palette.muted); }
/** Cyan – informational text */
export function paintCyan(text) { return paint(text, palette.cyan); }

/**
 * Colorize text with a 24-bit palette entry (or any escape string).
 * @param {string} text
 * @param {string} color - escape string from `palette` or `rgb()`
 * @returns {string}
 */
export function paint(text, color) {
    return `${color}${text}${palette.reset}`;
}

/**
 * Truncate a string to maxLen visible chars, appending '…' if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
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
 * Format a datetime as a human-friendly relative time string.
 * Examples: "just now", "4m ago", "2h ago", "3d ago", "02/18"
 * @param {string} isoDateString - ISO date string
 * @returns {string}
 */
export function formatRelativeDate(isoDateString) {
    const date = new Date(isoDateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec  = Math.floor(diffMs / 1000);
    const diffMin  = Math.floor(diffMs / (1000 * 60));
    const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDay  = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffSec < 60)  return 'just now';
    if (diffMin < 60)  return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7)   return `${diffDay}d ago`;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

/**
 * Format sender as "Name <address>" (long form).
 * @param {object} email - Email object
 * @returns {string}
 */
export function formatSender(email) {
    const from = email.from?.emailAddress;
    if (!from) return 'Unknown';
    if (from.name) return `${from.name} <${from.address}>`;
    return from.address || 'Unknown';
}

/**
 * Format sender as just the display name, or email address if no name.
 * More compact — suitable for columnar list output.
 * @param {object} email - Email object
 * @returns {string}
 */
export function formatSenderShort(email) {
    const from = email.from?.emailAddress;
    if (!from) return 'Unknown';
    const name = from.name?.trim();
    if (name) return name;
    return from.address || 'Unknown';
}

/**
 * Get short ID (first 6 chars)
 * @param {string} id - Full ID
 * @returns {string}
 */
export function getShortId(id) {
    return id.substring(0, 6);
}
