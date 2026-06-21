# Outlook Email

Direct-access Office 365 email + calendar CLI (Microsoft Graph). No offline cache —
every command reflects the live mailbox.

## Features

- List, view, and search emails live from Outlook
- Mark read/unread, move, and delete — applied immediately
- Browse mailbox folders; read your Outlook calendar; send via SMTP
- Friendly git-style short ids backed by a small local id-map (`db/idmap.yml`)

## Prerequisites

- Bun runtime (v1.0+)
- PowerShell Core (`pwsh`) — used only to refresh the Graph token
- Valid Office 365 account with appropriate permissions

## Installation

```bash
bun install
```

## Authentication

A Graph access token is cached in `.tokens.yaml` (auto-generated, git-ignored).
When missing/expired it is refreshed via PowerShell (`cli/lib/get-token.ps1`).
All other commands are pure Graph HTTP calls.

Required scopes:
- `Mail.Read`, `Mail.ReadWrite` — read and manage emails/folders
- `Calendars.Read` — read calendar

## Usage

See [SKILL.md](SKILL.md) for full command documentation and examples. Quick start:

```bash
outlook-email list                       # cache + show inbox
outlook-email view 6498ce                # read one (short id from list)
outlook-email read 6498ce                # mark read (immediate)
outlook-email move 6498ce --folder Processed
outlook-email delete 6498ce              # confirms first; → Deleted Items
outlook-email search "renewal" --limit 5
outlook-email folders
outlook-email calendar list --days 7
```

## IDs

Commands use 6-char short ids (or unique prefixes). `list`/`search` cache them in
`db/idmap.yml` (short → full immutable Graph id); the other commands resolve
through it. The map is a disposable local index — re-run `list`/`search` to
refresh it.

## Troubleshooting

### Authentication
1. Clear token cache: `rm .tokens.yaml` (it will refresh on next command)
2. Ensure `pwsh` is installed and on PATH

### "Email not found: <id>"
Run `outlook-email list` or `outlook-email search` first to (re)populate
`db/idmap.yml`, then retry with the printed short id.

## Security Notes

- Tokens are cached locally in `.tokens.yaml` (auto-generated) — never commit it
- `db/idmap.yml` is a local, git-ignored index (ids only, no email content)
