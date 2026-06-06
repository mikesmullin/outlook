#!/usr/bin/env python3
"""
Send an email via SMTP using the Python standard library only.

Replaces the slow/flaky browser-automation send path. Many corporate mail
systems expose an internal submission/relay host that accepts mail without
authentication on the local network, so this needs no credentials, OAuth,
or browser.

The SMTP host is resolved at runtime (no host is baked into the source):
  1. --smtp-host flag, if provided
  2. SMTP_HOST environment variable, if set
  3. the MX record of the sender's email domain

Usage:
  python3 send_smtp.py --to user@example.com --subject "Hello" \
      --body "Message" --from user@example.com --from-name "Display Name"
"""

import argparse
import os
import smtplib
import subprocess
import sys
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

DEFAULT_SMTP_PORT = int(os.environ.get("SMTP_PORT", "25"))


def parse_recipients(value):
    """Split a comma/semicolon-separated recipient string into a clean list."""
    if not value:
        return []
    parts = value.replace(";", ",").split(",")
    return [p.strip() for p in parts if p.strip()]


def domain_of(addr):
    """Return the domain part of an email address, or None."""
    if addr and "@" in addr:
        return addr.rsplit("@", 1)[1].strip().lower() or None
    return None


def resolve_mx(domain):
    """Resolve the lowest-priority MX host for a domain using system tools.

    Uses dig/nslookup/host (whichever is available) so no third-party DNS
    library is required. Returns a hostname string or None.
    """
    if not domain:
        return None

    # Try dig first (cleanest output): "10 mail.example.com."
    try:
        out = subprocess.run(
            ["dig", "+short", "MX", domain],
            capture_output=True, text=True, timeout=10,
        ).stdout
        records = []
        for line in out.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0].isdigit():
                records.append((int(parts[0]), parts[1].rstrip(".")))
        if records:
            return sorted(records)[0][1]
    except (FileNotFoundError, subprocess.SubprocessError):
        pass

    # Fall back to nslookup: "<domain> mail exchanger = 10 mail.example.com."
    try:
        out = subprocess.run(
            ["nslookup", "-type=mx", domain],
            capture_output=True, text=True, timeout=10,
        ).stdout
        records = []
        for line in out.splitlines():
            if "mail exchanger" in line:
                tail = line.split("mail exchanger", 1)[1].lstrip(" =")
                parts = tail.split()
                if len(parts) >= 2 and parts[0].isdigit():
                    records.append((int(parts[0]), parts[1].rstrip(".")))
        if records:
            return sorted(records)[0][1]
    except (FileNotFoundError, subprocess.SubprocessError):
        pass

    return None


def resolve_smtp_host(explicit_host, from_addr):
    """Determine the SMTP host: flag > env > MX of sender domain."""
    if explicit_host:
        return explicit_host
    env_host = os.environ.get("SMTP_HOST")
    if env_host:
        return env_host
    return resolve_mx(domain_of(from_addr))


def main():
    parser = argparse.ArgumentParser(description="Send an email via SMTP (no auth).")
    parser.add_argument("--to", required=True, help="Recipient(s), comma-separated")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", required=True, help="Email body")
    parser.add_argument("--from", dest="from_addr", required=True, help="From address")
    parser.add_argument("--from-name", dest="from_name", default="", help="From display name")
    parser.add_argument("--cc", default="", help="CC recipient(s), comma-separated")
    parser.add_argument("--bcc", default="", help="BCC recipient(s), comma-separated")
    parser.add_argument("--html", action="store_true", help="Treat body as HTML")
    parser.add_argument("--smtp-host", default="", help="SMTP host (default: $SMTP_HOST or sender domain MX)")
    parser.add_argument("--smtp-port", type=int, default=DEFAULT_SMTP_PORT)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    to_list = parse_recipients(args.to)
    cc_list = parse_recipients(args.cc)
    bcc_list = parse_recipients(args.bcc)

    if not to_list:
        print("Error: --to has no valid recipients", file=sys.stderr)
        sys.exit(1)

    smtp_host = resolve_smtp_host(args.smtp_host, args.from_addr)
    if not smtp_host:
        print(
            "Error: could not determine SMTP host. "
            "Pass --smtp-host, set $SMTP_HOST, or ensure the sender domain has an MX record.",
            file=sys.stderr,
        )
        sys.exit(1)

    msg = EmailMessage()
    msg["From"] = formataddr((args.from_name, args.from_addr)) if args.from_name else args.from_addr
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = args.subject
    try:
        domain = args.from_addr.split("@", 1)[1]
    except IndexError:
        domain = "localhost"
    msg["Message-ID"] = make_msgid(domain=domain)

    if args.html:
        # Provide a minimal plain-text fallback alongside the HTML part.
        msg.set_content("This message requires an HTML-capable email client.")
        msg.add_alternative(args.body, subtype="html")
    else:
        msg.set_content(args.body)

    all_rcpts = to_list + cc_list + bcc_list

    if args.verbose:
        print(f"Connecting to {smtp_host}:{args.smtp_port} ...")

    try:
        with smtplib.SMTP(smtp_host, args.smtp_port, timeout=30) as smtp:
            if args.verbose:
                smtp.set_debuglevel(1)
            smtp.ehlo()
            # Opportunistically upgrade to TLS if the server offers it.
            if smtp.has_extn("starttls"):
                try:
                    import ssl
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                except (ssl.SSLError, smtplib.SMTPException):
                    # Internal relay certs may not chain to a public CA; the
                    # plaintext submission port accepts cleartext, so continue.
                    pass
            refused = smtp.send_message(msg, from_addr=args.from_addr, to_addrs=all_rcpts)
    except (smtplib.SMTPException, OSError) as exc:
        print(f"Error: SMTP send failed: {exc}", file=sys.stderr)
        sys.exit(1)

    if refused:
        print(f"Error: some recipients were refused: {refused}", file=sys.stderr)
        sys.exit(1)

    print(f"\u2713 Sent: {args.subject} \u2192 {', '.join(to_list)}")


if __name__ == "__main__":
    main()
