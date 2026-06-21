---
name: outlook-email
description: interact w/ Microsoft Office (O365) Outlook Email inbox
---

# Outlook Emails

## Overview

The `outlook-email` command is installed globally.

It is a **direct-access** email + calendar CLI for Office 365 (Microsoft Outlook).
Every command talks straight to the Microsoft Graph API using a cached token —
there is **no local email cache and no offline mode**. Reads and mutations apply
to your mailbox immediately. Benchmarks show direct calls return in well under a
quarter-second, so local caching is unnecessary.

It provides:

- List, view, and search emails live from Outlook
- Mark read/unread, move between folders, and delete — applied immediately
- Browse mailbox folders
- Read your Outlook calendar
- Send email via SMTP

## Authentication

A Graph access token is cached in `.tokens.yaml` (auto-generated, git-ignored).
When it is missing/expired, the tool refreshes it via PowerShell
(`cli/lib/get-token.ps1`). PowerShell is **only** used for token refresh; all
day-to-day commands are pure Graph HTTP calls.

Required scopes: `Mail.Read`, `Mail.ReadWrite`, `Calendars.Read`.

## IDs — short ids backed by a local id-map

Graph message ids are long and ugly (68–152 chars). The CLI instead uses
**git-style short ids** (6 hex chars) everywhere. A small map file,
`db/idmap.yml`, maps each short id to its full immutable Graph id:

```yaml
6498ce: AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A64cxTJn3rUWKTxQNXDBVFAAFUuu62wAA
2d6309: AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A64cxTJn3rUWKTxQNXDBVFAAFUuu62gAA
```

- **Populated by** `list` and `search` — every row they print is upserted.
- **Consumed by** `view`, `read`, `unread`, `move`, `delete` — they accept a short
  id (or a unique prefix of one) and resolve it to the full id.
- Full ids are **immutable ids** (`Prefer: IdType="ImmutableId"`), so a short id
  keeps working after a `move`. (`search` results are translated to immutable ids
  via `translateExchangeIds`, so the same message always gets the same short id in
  both `list` and `search`.)
- `db/idmap.yml` is a disposable local index (git-ignored). If a short id isn't
  found, just run `list` or `search` first to repopulate it.

> **Workflow:** run `list` (or `search`) to see emails and cache their ids, then
> use the printed short id with `view` / `read` / `unread` / `move` / `delete`.

## Command: `outlook-email list`

**Purpose**: List emails directly from a mailbox folder (newest first) and cache
their short ids.

```bash
outlook-email list [--folder <name>] [-l/--limit <n>] [--since <date>] [--unread-only]
```

**Options**:
- `--folder <name>`: Folder to list (default: `Inbox`)
- `-l, --limit <n>`: Max results (default: 10)
- `--since <date>`: Only emails on/after this date — `YYYY-MM-DD`, `yesterday`,
  `"N days ago"` (server-side `$filter`)
- `--unread-only`: Only unread emails

**Output** (one email per line; `•` marks unread):
```
📧 5 emails in Inbox:

   1. • 441c84  3h ago     se1-artifactory-vip@bli...  [Artifactory] JFrog Platform Access Token...
   2. • 6287d1  9h ago     BIIS Alerts                 [ALERT - Warning] RAM Utilization - irvdb302
```

**Examples**:
```bash
outlook-email list
outlook-email list --limit 20
outlook-email list --folder Processed
outlook-email list --since 2026-01-01 --unread-only
```

## Command: `outlook-email view <id>`

**Purpose**: Fetch and display a single email live from Outlook.

```bash
outlook-email view <id> [--text|--yaml]
```

**Arguments**:
- `<id>`: Short id (from `list`/`search`), a unique prefix, or a full Graph id

**Options**:
- `--text`: Headers + plain-text body (HTML stripped) — **default**
- `--yaml`: Full message metadata + body as YAML

**Examples**:
```bash
outlook-email view 6498ce
outlook-email view 6498ce --yaml
```

## Command: `outlook-email read <id>` / `unread <id>`

**Purpose**: Mark an email read/unread in Outlook — **applied immediately**
(`PATCH /me/messages/{id}` `{ isRead }`).

```bash
outlook-email read 6498ce
outlook-email unread 6498ce
```

**Output**:
```
✓ Marked read: 6498ce
  [ALERT - Warning] RAM Utilization - irvdb302 - BIIS-Prod
```

## Command: `outlook-email move <id> --folder <name>`

**Purpose**: Move an email to a folder in Outlook — **applied immediately**
(`POST /me/messages/{id}/move`). The short id keeps working after the move
(immutable id).

```bash
outlook-email move 6498ce --folder Processed
outlook-email move 6498ce --folder Archive
```

**Output**:
```
✓ Moved: 6498ce
  NOTICE: Bnet LDAP Password Expiration
  → Processed
```

## Command: `outlook-email delete <id>`

**Purpose**: Delete an email (moves it to **Deleted Items**, recoverable).
Confirms locally first, then mutates remotely (`DELETE /me/messages/{id}`).

```bash
outlook-email delete <id> [-y/--yes]
```

**Options**:
- `-y, --yes`: Skip the confirmation prompt

**Behavior**: Without `--yes`, prints the sender + subject and asks `Confirm? [y/N]`.
On confirm, deletes in Outlook and drops the id from `db/idmap.yml`.

```bash
outlook-email delete 6498ce
outlook-email delete 6498ce --yes
```

## Command: `outlook-email search <query>`

**Purpose**: Search emails via Microsoft Graph (all folders by default) and cache
result short ids.

```bash
outlook-email search <query> [--folder <name>] [-l/--limit <n>] [--since <date>]
```

**Arguments**:
- `<query>`: KQL search string (e.g. `"SSL classicteam"`, `"subject:SSL from:asmith"`)

**Options**:
- `--folder <name>`: Limit to a folder (e.g. `Inbox`, `Processed`)
- `-l, --limit <n>`: Max results (default: 10)
- `--since <date>`: Only emails after `YYYY-MM-DD`

**Examples**:
```bash
outlook-email search "SSL classicteam"
outlook-email search "subject:SSL from:asmith" --folder Inbox
outlook-email search "renewal" --limit 5 --since 2026-01-01
```

> Note: Graph's search index lags a little for brand-new mail; use `list` to see
> messages that just arrived.

## Command: `outlook-email folders`

**Purpose**: List all mailbox folders as a tree, with unread/total counts.

```bash
outlook-email folders
```

**Output**:
```
Mailbox Folders

├── Alerts  68 unread, 13333 total
├── Archive  0 unread, 7705 total
├── Inbox  12 unread, 240 total
```

## Command: `outlook-email send`

**Purpose**: Send an email via SMTP (fast, headless, no browser).

```bash
outlook-email send --to <email> --subject <subject> [options] <file>
```

**Arguments**:
- `<file>`: Path to a file containing the email body. Use `-` to read from stdin.

**Options**:
- `--to <email>`: Recipient address(es), comma-separated (required)
- `--subject <text>`: Email subject (required)
- `--cc <email>` / `--bcc <email>`: CC/BCC address(es), comma-separated
- `--from <email>`: Override the From address (default: derived from the cached token)
- `--html`: Treat body as raw HTML (sent as a `text/html` MIME part)
- `--smtp-host <host>`: SMTP host (default: `$SMTP_HOST`, else the sender domain's MX)
- `--smtp-port <port>`: SMTP port (default: `$SMTP_PORT`, else `25`)
- `-v, --verbose`: Show progress / SMTP debug output

**Output** (default, quiet):
```
✓ Sent: My Subject → recipient@example.com
```

**Plain text example**:
```bash
echo "Hi Alice, let's sync tomorrow." > body.txt
outlook-email send --to alice@example.com --subject "Quick sync" body.txt
```

**HTML example**:
```bash
cat > email.html << 'EOF'
<p>Hi team,</p>
<ul><li><b>Item one</b></li><li><i>Item two</i></li></ul>
<p>See <a href="https://example.com">this link</a> for details.</p>
EOF
outlook-email send --to team@example.com --subject "Update" --html email.html
```

**Stdin example**:
```bash
echo "Quick note from a script." | outlook-email send --to alice@example.com --subject "Note" -
```

**Dependencies**:
- `python3` — standard library only (`smtplib`, `email`)
- `dig` or `nslookup` — to resolve the sender domain's MX when no host is given
- Network access to the resolved SMTP host (often corporate network/VPN)

## Calendar

Read your Outlook calendar directly via Microsoft Graph (`/me/calendarView`).
Requires the `Calendars.Read` scope. Event short ids are the first 6 chars of the
SHA1 of the Graph event id — same git-style partial matching used for emails.
Times render in `America/Los_Angeles` by default; override with `$OUTLOOK_TZ`.

### Command: `outlook-email calendar list`

**Purpose**: List events in a date range (default: next 7 days), grouped by day.

```bash
outlook-email calendar list [--from <date>] [--to <date>] [-n/--days <n>] [--all-cancelled]
```

**Options**:
- `--from <date>`: Range start (default: today). `YYYY-MM-DD`, `today`, `tomorrow`,
  `"N days ago"`, `"in N days"`
- `--to <date>`: Range end (default: `--from` + `--days`)
- `-n, --days <n>`: Days from `--from` (default: 7)
- `--all-cancelled`: Include cancelled events (hidden by default)

**Output**:
```
📅 8 events  (6/22/2026 → 6/29/2026, America/Los_Angeles)

  Mon, 06/22
    a1541c  6:35am–7:00am     BKPv2 Migration Sync   busy   ⧉ online
    fcef28  11:00am–12:00pm   lunch                  busy
```

### Command: `outlook-email calendar view <id>`

**Purpose**: Show full details for one event (date, time, organizer, location,
online join URL, attendees + responses, your response, busy/free, categories).

```bash
outlook-email calendar view <short_id>
```

Notes:
- `view` is stateless — it scans a wide window (−60d…+180d, paginated) and matches
  the event whose hashed id starts with `<short_id>`.
- Recurring meetings expand to one occurrence per day, each with its own short id.

## Agent Guidance

1. Start with `list` (or `search`) — this is what populates `db/idmap.yml` with the
   short ids the other commands consume.
2. Then use the printed short id with `view` / `read` / `unread` / `move` / `delete`.
3. Mutations are **immediate** — there is no plan/apply step. `delete` confirms
   first unless you pass `--yes`.
4. If a command reports an id as not found, run `list`/`search` to refresh the map.
5. There is no offline cache — every command reflects the live mailbox.
