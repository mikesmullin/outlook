import { getGraphClient } from '../lib/client.mjs';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import {
    palette,
    paint,
    truncate,
} from '../lib/utils.mjs';

// Timezone to render event times in (Graph honors this via the Prefer header).
const DISPLAY_TZ = process.env.OUTLOOK_TZ || 'America/Los_Angeles';

const EVENT_SELECT = [
    'id', 'subject', 'start', 'end', 'isAllDay', 'showAs', 'isCancelled',
    'organizer', 'location', 'locations', 'categories', 'webLink',
    'onlineMeeting', 'isOnlineMeeting', 'responseStatus', 'sensitivity',
    'attendees', 'bodyPreview',
].join(',');

function hashEventId(id) {
    return createHash('sha1').update(id).digest('hex');
}

function shortId(fullId) {
    return hashEventId(fullId).substring(0, 6);
}

/** Parse a YYYY-MM-DD or relative date ("today", "N days ago", "in N days"). */
function parseDate(raw) {
    if (!raw) return null;
    const r = raw.trim().toLowerCase();
    const now = new Date();
    if (r === 'today') return startOfDay(now);
    if (r === 'tomorrow') return startOfDay(new Date(now.getTime() + 864e5));
    if (r === 'yesterday') return startOfDay(new Date(now.getTime() - 864e5));
    let m = r.match(/^(\d+)\s+days?\s+ago$/);
    if (m) return startOfDay(new Date(now.getTime() - Number(m[1]) * 864e5));
    m = r.match(/^in\s+(\d+)\s+days?$/);
    if (m) return startOfDay(new Date(now.getTime() + Number(m[1]) * 864e5));
    if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return new Date(r + 'T00:00:00');
    throw new Error(`Invalid date: "${raw}". Use YYYY-MM-DD, today, tomorrow, "N days ago", or "in N days".`);
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Format a Graph dateTime object into a short local time label. */
function fmtTime(dt, isAllDay) {
    if (!dt?.dateTime) return '??';
    const d = new Date(dt.dateTime);
    if (isAllDay) return 'all-day';
    return d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ,
    }).replace(' ', '').toLowerCase();
}

function fmtDay(dt) {
    if (!dt?.dateTime) return '??';
    const d = new Date(dt.dateTime);
    return d.toLocaleDateString('en-US', {
        weekday: 'short', month: '2-digit', day: '2-digit', timeZone: DISPLAY_TZ,
    });
}

function showAsLabel(showAs) {
    switch (showAs) {
        case 'free': return paint('free', palette.success);
        case 'tentative': return paint('tentative', palette.warn);
        case 'oof': return paint('OOO', palette.pink);
        case 'workingElsewhere': return paint('elsewhere', palette.cyan);
        case 'busy': default: return paint('busy', palette.muted);
    }
}

function locationLabel(ev) {
    if (ev.isOnlineMeeting || ev.onlineMeeting) return paint('⧉ online', palette.cyan);
    const loc = ev.location?.displayName?.trim();
    return loc ? truncate(loc, 24) : '';
}

async function fetchEvents(client, startDate, endDate) {
    const params = new URLSearchParams({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        '$select': EVENT_SELECT,
        '$orderby': 'start/dateTime',
        '$top': '100',
    });
    const all = [];
    let req = client
        .api(`/me/calendarView?${params.toString()}`)
        .header('Prefer', `outlook.timezone="${DISPLAY_TZ}"`);
    while (req) {
        const res = await req.get();
        all.push(...(res.value || []));
        const next = res['@odata.nextLink'];
        req = next
            ? client.api(next).header('Prefer', `outlook.timezone="${DISPLAY_TZ}"`)
            : null;
    }
    return all;
}

async function listEvents(client, args) {
    let start = null;
    let end = null;
    let days = 7;
    let includeCancelled = false;
    let asJson = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--from') start = parseDate(args[++i]);
        else if (args[i] === '--to') end = parseDate(args[++i]);
        else if (args[i] === '--days' || args[i] === '-n') days = parseInt(args[++i], 10);
        else if (args[i] === '--all-cancelled') includeCancelled = true;
        else if (args[i] === '--json') asJson = true;
    }

    if (!start) start = startOfDay(new Date());
    if (!end) end = new Date(start.getTime() + days * 864e5);

    let events = await fetchEvents(client, start, end);
    if (!includeCancelled) events = events.filter((e) => !e.isCancelled);

    if (asJson) {
        const out = {
            range: { from: start.toISOString(), to: end.toISOString(), timeZone: DISPLAY_TZ },
            count: events.length,
            events: events.map((ev) => ({
                id: shortId(ev.id),
                day: fmtDay(ev.start),
                start: fmtTime(ev.start, ev.isAllDay),
                end: fmtTime(ev.end, ev.isAllDay),
                startIso: ev.start?.dateTime || null,
                endIso: ev.end?.dateTime || null,
                isAllDay: !!ev.isAllDay,
                subject: ev.subject || '(no subject)',
                showAs: ev.showAs || 'busy',
                isCancelled: !!ev.isCancelled,
                online: !!(ev.isOnlineMeeting || ev.onlineMeeting),
                location: ev.location?.displayName || null,
            })),
        };
        console.log(JSON.stringify(out, null, 2));
        return;
    }

    const range = `${start.toLocaleDateString('en-US', { timeZone: DISPLAY_TZ })} → ${end.toLocaleDateString('en-US', { timeZone: DISPLAY_TZ })}`;
    console.log(paint(`📅 ${events.length} events  (${range}, ${DISPLAY_TZ})`, palette.count));
    console.log('');

    let lastDay = null;
    for (const ev of events) {
        const day = fmtDay(ev.start);
        if (day !== lastDay) {
            console.log(paint(`  ${day}`, palette.date));
            lastDay = day;
        }
        const sid = paint(shortId(ev.id), palette.hash);
        const time = `${fmtTime(ev.start, ev.isAllDay)}–${fmtTime(ev.end, ev.isAllDay)}`;
        const subj = paint(truncate(ev.subject || '(no subject)', 50), palette.subject);
        const where = locationLabel(ev);
        const status = showAsLabel(ev.showAs);
        const cancelled = ev.isCancelled ? paint(' [cancelled]', palette.error) : '';
        const parts = [`    ${sid}`, paint(time.padEnd(16), palette.muted), subj, status];
        if (where) parts.push(where);
        console.log(parts.join('  ') + cancelled);
    }
    if (events.length === 0) console.log(paint('    (no events)', palette.muted));
}

async function findEventById(client, partialId) {
    const normalized = partialId.replace(/\.ya?ml$/, '').toLowerCase();
    // Search a wide window so `view` is stateless.
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 864e5);
    const end = new Date(now.getTime() + 180 * 864e5);
    const events = await fetchEvents(client, start, end);

    const matches = events.filter((e) => hashEventId(e.id).startsWith(normalized) || e.id.toLowerCase() === normalized);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    throw new Error(`Ambiguous ID "${partialId}". Matches: ${matches.map((e) => shortId(e.id)).join(', ')}`);
}

async function viewEvent(client, args) {
    const idArg = args.find((a) => !a.startsWith('-'));
    if (!idArg) throw new Error('Usage: outlook-email calendar view <id>');

    const ev = await findEventById(client, idArg);
    if (!ev) {
        console.error(paint(`Event not found: ${idArg}`, palette.error));
        process.exit(1);
    }

    const attendees = (ev.attendees || []).map((a) => ({
        name: a.emailAddress?.name || a.emailAddress?.address,
        address: a.emailAddress?.address,
        type: a.type,
        response: a.status?.response,
    }));

    const out = {
        id: shortId(ev.id),
        subject: ev.subject,
        when: {
            start: ev.start?.dateTime,
            end: ev.end?.dateTime,
            timeZone: ev.start?.timeZone || DISPLAY_TZ,
            isAllDay: !!ev.isAllDay,
        },
        showAs: ev.showAs,
        isCancelled: !!ev.isCancelled,
        organizer: ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address,
        location: ev.location?.displayName || null,
        online: ev.isOnlineMeeting ? (ev.onlineMeeting?.joinUrl || true) : false,
        categories: ev.categories || [],
        sensitivity: ev.sensitivity,
        myResponse: ev.responseStatus?.response,
        attendees,
        webLink: ev.webLink,
        bodyPreview: ev.bodyPreview?.trim() || null,
    };

    if (args.includes('--json')) {
        console.log(JSON.stringify(out, null, 2));
    } else {
        console.log(yaml.dump(out, { indent: 2, lineWidth: 100 }));
    }
}

export default async function calendarCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email calendar <subcommand> [options]

Read your Outlook calendar via Microsoft Graph (online).

Subcommands:
  list                       List events (default: next 7 days)
  view <id>                  Show full details for a single event

list options:
  --from <date>              Range start (default: today). YYYY-MM-DD / today / "N days ago"
  --to <date>                Range end (default: --from + --days)
  -n, --days <n>             Number of days from --from (default: 7)
  --all-cancelled            Include cancelled events

Examples:
  outlook-email calendar list
  outlook-email calendar list --days 14
  outlook-email calendar list --from today --to 2026-06-30
  outlook-email calendar view a1b2c3

Notes:
  Times render in ${DISPLAY_TZ} (override with $OUTLOOK_TZ).
`);
        return;
    }

    const sub = args[0];
    const { client } = await getGraphClient();

    if (sub === 'list' || sub === 'events' || sub === 'ls') {
        await listEvents(client, args.slice(1));
    } else if (sub === 'view' || sub === 'show') {
        await viewEvent(client, args.slice(1));
    } else {
        // Allow `calendar` with bare flags to mean `calendar list`.
        await listEvents(client, args);
    }
}
