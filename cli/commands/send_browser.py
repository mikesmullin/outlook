#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "browser-use",
# ]
# ///
"""
Send an email via Outlook Web using browser-use (CDP).
Reuses the persistent browser session in ~/.browser_agent/ (already logged in).

Usage:
  uv run cli/commands/send_browser.py --to user@example.com --subject "Hello" --body "Message"
"""

import asyncio
import argparse
import logging
import sys
import urllib.parse
from pathlib import Path

VERBOSE = False


def log(msg: str) -> None:
    if VERBOSE:
        print(msg)

OUTLOOK_COMPOSE_URL = "https://outlook.cloud.microsoft/mail/deeplink/compose"
BODY_PLACEHOLDER = "OUTLOOK_EMAIL_BODY_PLACEHOLDER"
USER_DATA_DIR = Path.home() / ".browser_agent"


def build_deeplink(to: str, subject: str) -> str:
    params = urllib.parse.urlencode({
        "to": to,
        "subject": subject,
        "body": BODY_PLACEHOLDER,
    }, quote_via=urllib.parse.quote)
    return f"{OUTLOOK_COMPOSE_URL}?{params}"


# JS: wait for compose window to be ready (polls until a known compose element appears)
JS_WAIT_FOR_COMPOSE = """
(...args) => {
    const selectors = [
        '[placeholder="Add a subject"]',
        '[aria-label="Add a subject"]',
        '[aria-label*="subject" i]',
        '[aria-label="To"]',
        '[aria-label*="To" i][role="textbox"]',
    ];
    for (const sel of selectors) {
        if (document.querySelector(sel)) return sel;
    }
    return null;
}
"""

# JS: find placeholder via window.find() and replace it with body text in one shot.
# Must be a single expression — window.find() leaves the selection, then execCommand replaces it.
def JS_REPLACE_BODY(text: str) -> str:
    escaped = text.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    return f"""
    () => {{
        const found = window.find('{BODY_PLACEHOLDER}');
        if (!found) return false;
        return document.execCommand('insertText', false, `{escaped}`);
    }}
    """


def JS_REPLACE_BODY_HTML(html: str) -> str:
    # Escape for JS template literal
    escaped = html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    return f"""
    () => {{
        const found = window.find('{BODY_PLACEHOLDER}');
        if (!found) return false;
        return document.execCommand('insertHTML', false, `{escaped}`);
    }}
    """

# JS: click the Send button by finding button with direct TEXT_NODE child "Send"
JS_CLICK_SEND = """
(...args) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sendBtn = buttons.find(b =>
        Array.from(b.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() === 'Send')
    );
    if (sendBtn) {
        sendBtn.click();
        return true;
    }
    return false;
}
"""

# JS: check we have navigated away from compose (success signal)
JS_CHECK_SENT = f"""
(...args) => {{
    return !window.location.href.includes('deeplink/compose');
}}
"""


def is_truthy(val) -> bool:
    """browser-use evaluate() returns JS result as bool, 'true', or 'True'."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == "true"
    return bool(val)


async def wait_for_deeplink(page, deeplink_url: str) -> None:
    """Wait until the browser has arrived at the deeplink URL.
    If it's stuck elsewhere (login page, error, etc.), warn the user once and keep waiting."""
    warned = False
    for _ in range(240):  # wait up to 2 minutes
        try:
            url = await page.get_url()
            if url and url.startswith(OUTLOOK_COMPOSE_URL):
                if warned:
                    print("✓ Arrived at compose URL, continuing...")
                return
            if not warned:
                print("⚠  Browser has not arrived at the compose URL.")
                print("   It may be on a login page or an error page.")
                print("   Please check the browser window and sign in if needed.")
                print("   Waiting...")
                warned = True
        except Exception:
            pass
        await asyncio.sleep(0.5)
    print("Error: Timed out waiting for compose URL.", file=sys.stderr)
    sys.exit(1)


async def js_repl(page) -> bool:
    """Interactive JS REPL. Returns True to proceed with send, False to abort."""
    import sys
    print()
    print("=" * 60)
    print("JS REPL — browser is paused at compose window.")
    print("  Type any JS expression to evaluate on the page.")
    print("  Type 'send' to proceed with sending.")
    print("  Type 'quit' to abort.")
    print("  Tip: 'document.querySelectorAll(\"iframe\").length'")
    print("  Tip: 'document.activeElement.tagName'")
    print("=" * 60)
    print()
    while True:
        try:
            line = input("js> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return False
        if line == "quit":
            return False
        if line == "send":
            return True
        if not line:
            continue
        try:
            result = await page.evaluate(f"() => {{ try {{ return JSON.stringify(eval({repr(line)})) }} catch(e) {{ return 'ERROR: ' + e.message }} }}")
            print(f"  => {result}")
        except Exception as e:
            print(f"  ERROR: {e}")


async def send_email(to: str, subject: str, body: str, debug: bool = False, headed: bool = False, html: bool = False) -> None:
    from browser_use import Browser

    browser = Browser(
        user_data_dir=str(USER_DATA_DIR),
        headless=not headed,
    )

    try:
        await browser.start()
        page = await browser.get_current_page()
        if page is None:
            page = await browser.new_page()

        # 1. Navigate to compose deeplink
        url = build_deeplink(to, subject)
        log("Navigating to compose...")
        await page.goto(url)

        # 2. Wait until we've arrived at the deeplink compose URL
        await wait_for_deeplink(page, url)

        # 3. Wait for compose window to render (poll up to 30s)
        log("Waiting for compose window...")
        for _ in range(60):
            try:
                current_url = await page.get_url()
                result = await page.evaluate(JS_WAIT_FOR_COMPOSE)
                if result and result is not False and result != "false" and result != "null":
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)
        else:
            print("Error: Compose window did not load in time.", file=sys.stderr)
            sys.exit(1)

        await asyncio.sleep(1.0)  # let signature render

        if debug:
            proceed = await js_repl(page)
            if not proceed:
                print("Aborted.", file=sys.stderr)
                sys.exit(1)

        # 4. Replace BODY_PLACEHOLDER with real body text in a single JS call
        log("Inserting body text...")
        js_inject = JS_REPLACE_BODY_HTML(body) if html else JS_REPLACE_BODY(body)
        for attempt in range(5):
            try:
                replaced = await page.evaluate(js_inject)
                if is_truthy(replaced):
                    break
                log(f"  attempt {attempt+1}: returned {replaced!r}")
            except Exception as e:
                log(f"  attempt {attempt+1} error: {e}")
            await asyncio.sleep(0.5)
        else:
            print("Error: Could not find/replace body placeholder.", file=sys.stderr)
            sys.exit(1)
        await asyncio.sleep(0.5)

        # 5. Click Send — tab will close after this
        log("Clicking Send...")
        sent = await page.evaluate(JS_CLICK_SEND)
        if not is_truthy(sent):
            print("Error: Send button not found.", file=sys.stderr)
            sys.exit(1)

        # 6. Wait briefly — Outlook closes the tab on send, which raises an exception
        # That's normal and expected. Just sleep to give it time.
        try:
            await asyncio.sleep(2.0)
            # If page is still open, check we navigated away
            confirmed = await page.evaluate(JS_CHECK_SENT)
            if not is_truthy(confirmed):
                log("Warning: Could not confirm send via URL check.")
        except Exception:
            pass  # Tab closed = send succeeded

        print(f"✓ Sent: {subject} → {to}")

    finally:
        await browser.stop()


def main():
    parser = argparse.ArgumentParser(description="Send email via Outlook Web")
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", default="", help="Email body text")
    parser.add_argument("--debug", action="store_true", help="Pause at compose window for interactive JS REPL")
    parser.add_argument("--headed", action="store_true", help="Show the browser window (default: headless)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show progress output")
    parser.add_argument("--html", action="store_true", help="Treat --body as raw HTML (uses insertHTML instead of insertText)")
    args = parser.parse_args()

    global VERBOSE
    VERBOSE = args.verbose or args.debug

    # Suppress browser-use library logging unless verbose
    if not VERBOSE:
        logging.disable(logging.CRITICAL)

    asyncio.run(send_email(args.to, args.subject, args.body, debug=args.debug, headed=args.headed or args.debug, html=args.html))


if __name__ == "__main__":
    main()
