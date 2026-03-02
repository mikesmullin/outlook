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

See [SKILL.md](SKILL.md) for detailed command documentation and usage examples.

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