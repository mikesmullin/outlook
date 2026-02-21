# Outlook Email

Office 365 email CLI.

## Features

- **Email Management**: Read, search, and process inbox emails
- **ETL to YAML**: Extract emails to a flat-file YAML database

## Prerequisites

- Bun runtime (v1.0+)
- PowerShell Core (pwsh) installed
- Microsoft Graph PowerShell module
- Valid Office 365 account with appropriate permissions

## Installation

1. Install deps
```bash
bun install
```

2. Install Microsoft Graph PowerShell module:
```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
```

## Authentication

The plugin automatically authenticates using Microsoft Graph PowerShell module. On first use, you'll be prompted to sign in to your Office 365 account.

Required scopes:
- `Mail.Read` - Read emails
- `Mail.ReadWrite` - Read emails and manage folders

## Usage

### Pull & Store Emails (ETL)
Fetch emails (read + unread) since a given date and store as Markdown files in `storage/`:

```bash
# Fetch emails from the last 7 days
bun outlook-email.mjs pull --since "7 days ago"

# Fetch emails since yesterday
bun outlook-email.mjs pull --since yesterday

# Fetch emails since a specific date (YYYY-MM-DD)
bun outlook-email.mjs pull --since 2026-01-01
```

#### Pull Script Details

- **Fetches**: All emails (read and unread) received on or after the specified date
- **Ordering**: Newest to oldest (most recent first)
- **Pagination**: Automatically handles pagination, stops when past the cutoff date
- **Storage**: Each email is saved as a Markdown file under `storage/<id>.md` where `id` is a SHA1 hash of the Outlook email ID
- **Deduplication**: Files are never overwritten; re-running the script skips existing files
- **Remote behavior**: Pull is read-only against Outlook (does not mark read, move, or otherwise mutate messages)
- **Content**: Emails are stored as Markdown with YAML frontmatter:
  - **Frontmatter**: Email metadata (id, from, recipients, timestamps, etc.)
  - **Body**: Email body stored as a code block (HTML or Text)
  - Custom fields: `_stored_id` (SHA1 hash) and `_stored_at` (storage timestamp)

#### Date Format Examples

- `YYYY-MM-DD` - Exact date at midnight UTC (e.g., `2026-01-01`)
- `yesterday` - Yesterday at midnight UTC
- `N days ago` - N days before now at midnight UTC (e.g., `"7 days ago"`, `"1 days ago"`)

## Offline CLI - YAML Database

After pulling emails to storage, use the `outlook-email` command to query and manage the offline YAML database. This command works entirely offline without connecting to Outlook.

### Setup

Link the binary globally:
```bash
cd /path/to/outlook-email
bun link
```

Then use from anywhere:
```bash
outlook-email inbox summary
outlook-email list --limit 20
outlook-email view f86bca
outlook-email read f86bca
outlook-email unread f86bca
outlook-email plan
outlook-email apply
outlook-email clean
```

Queue and apply offline changes:
```bash
# Queue changes locally
outlook-email read f86bca

# Preview queued changes
outlook-email plan

# Apply queued changes to Outlook
outlook-email apply
```

Clear local cache for a fresh pull:
```bash
outlook-email clean
```

### ID Matching (Git-style)

All commands accepting an `<id>` parameter support partial ID matching like Git:

```bash
# Full ID
outlook-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b

# Short ID (first 6 chars)
outlook-email view 6498ce

# Any prefix
outlook-email view 6498cec18d67

# Filename format
outlook-email view 6498cec18d676f08ff64932bf93e7ec33c0adb2b.yml
```

As long as the prefix is unique, it will match the email. If ambiguous, you'll get an error with all matching IDs.

### Commands

#### `outlook-email inbox summary`
Show email counts by folder (unread, read, total).

```bash
outlook-email inbox summary
```

Output:
```
Folder Summary:
===============
Inbox:
  Unread: 46
  Read:   1
  Total:  47

Overall:
  Unread: 46
  Read:   1
  Total:  47
```

#### `outlook-email list`
List unread emails from storage (newest first). Omits emails marked `offline.read: true` unless `--all` is passed.

Options:
- `-l, --limit <n>` - Maximum emails to show (default: 10)
- `--since <date>` - Only show emails after this date (same formats as pull script)
- `-a, --all` - Include read emails (marked `offline.read: true`)

Examples:
```bash
# Show 20 unread emails (default newest first)
outlook-email list --limit 20

# Show emails from yesterday
outlook-email list --since yesterday --limit 10

# Show all emails including read ones
outlook-email list --all --limit 50

# Show emails from specific date
outlook-email list --since 2026-01-01
```

Output format: `<short_id> / <relative_date> / <sender_name> <sender_email>`
```
Showing 3 of 46 emails:

f86bca / Today 10:00 / Science Operations <ScienceOperations@bigco.com>
Science record review request

cda64a / Today 9:46 / Alice Johnson <noreply@github.bigco.net>
Re: [fowl-dept] Create new decorative turkey slices (PR #537)

8fb5bf / Today 9:01 / U.S. Payroll <payroll@bigco.com>
Payroll for 2026

... and 43 more
```

Output is formatted with ANSI color codes for easy visual parsing.

#### `outlook-email view <id>`
Display a single email (print full YAML). Supports partial ID matching.

```bash
# Full ID
outlook-email view 6498cec18d676f08ff64932bf93e7ec33c0adb2b

# Short ID
outlook-email view 6498ce
```

#### `outlook-email read <id>`
Mark an email as read (offline only, updates YAML file). Adds `offline.read: true` and `offline.readAt` timestamp. Supports partial ID matching.

```bash
outlook-email read 6498ce
```

Output:
```
✓ Marked as read: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  [Admin] - Password Reset
```

#### `outlook-email unread <id>`
Mark an email as unread (offline only, removes `offline.read` from YAML file). Supports partial ID matching.

```bash
outlook-email unread 6498ce
```

Output:
```
✓ Marked as unread: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  [Admin] - Password Reset
```

### Offline Metadata

Custom metadata is stored in each YAML file under the `offline` key:
```yaml
offline:
  read: true              # Whether marked as read offline
  readAt: '2026-01-05T...' # Timestamp when marked as read
```

## Troubleshooting

### Authentication Issues
1. Ensure you're signed in to Azure CLI: `az login`
2. Check PowerShell module: `Get-Module Microsoft.Graph -ListAvailable`
3. Clear token cache: `rm .tokens.yaml`

## Security Notes

- Tokens are cached locally in `.tokens.yaml` (auto-generated)
- Never commit `.tokens.yaml` to version control
- All upload operations require user confirmation
- YAML storage directory contains full email content
  - we use git to version control `storage/` dir (our email yml data changes) with daily snapshot cadence