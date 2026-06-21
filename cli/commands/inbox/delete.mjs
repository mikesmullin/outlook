import { createInterface } from 'readline';
import { getGraphClient, msgApi } from '../../lib/client.mjs';
import { resolveId, removeByFullId } from '../../lib/idmap.mjs';
import { paint, palette, mint, pink, yellow, dim } from '../../lib/utils.mjs';

function confirm(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            const n = answer.trim().toLowerCase();
            resolve(n === 'y' || n === 'yes');
        });
    });
}

export default async function deleteCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email delete <id> [--yes]

Delete an email in Outlook (moves it to Deleted Items, recoverable). Prompts for
confirmation first unless --yes is given.

Arguments:
  <id>          Short id (from list/search), unique prefix, or full Graph id

Options:
  -y, --yes     Skip the confirmation prompt
  -h, --help    Show this help

Examples:
  outlook-email delete 6498ce
  outlook-email delete 6498ce --yes
`);
        return;
    }

    let partialId = null;
    let skipConfirm = false;
    for (const arg of args) {
        if (arg === '-y' || arg === '--yes') skipConfirm = true;
        else if (!arg.startsWith('-')) partialId = partialId || arg;
    }

    if (!partialId) {
        console.error(`${pink('✗')} Error: <id> argument required`);
        process.exit(1);
    }

    const fullId = await resolveId(partialId);
    if (!fullId) {
        console.error(`${pink('✗')} Email not found: ${partialId} (run "outlook-email list" first)`);
        process.exit(1);
    }

    const { client } = await getGraphClient();

    // Fetch metadata to confirm against locally before mutating remotely.
    let email;
    try {
        email = await msgApi(client, `/me/messages/${fullId}`)
            .select('id,subject,from,receivedDateTime')
            .get();
    } catch (error) {
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            await removeByFullId(fullId);
            console.error(`${pink('✗')} Email no longer exists (stale id dropped): ${partialId}`);
            process.exit(1);
        }
        throw error;
    }

    const subject = email.subject || '(No Subject)';
    const sender = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';

    if (!skipConfirm) {
        console.log(`${yellow('⚠')}  Delete this email (→ Deleted Items)?`);
        console.log(`   ${paint(partialId, palette.hash)}  ${paint(sender, palette.sender)}`);
        console.log(`   ${paint(subject, palette.subject)}`);
        const ok = await confirm(`   ${dim('Confirm? [y/N] ')}`);
        if (!ok) {
            console.log(`${dim('Cancelled.')}`);
            return;
        }
    }

    await msgApi(client, `/me/messages/${fullId}`).delete();
    await removeByFullId(fullId);

    console.log(`${mint('✓')} Deleted: ${paint(partialId, palette.hash)}`);
    console.log(`  ${paint(subject, palette.subject)}`);
}
