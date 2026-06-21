import { getGraphClient, msgApi, findFolderByName } from '../lib/client.mjs';
import { resolveId, removeByFullId } from '../lib/idmap.mjs';
import { paint, palette, mint, pink, dim } from '../lib/utils.mjs';

export default async function moveCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email move <id> --folder <name>

Move an email to a folder in Outlook (applies immediately).

Arguments:
  <id>              Short id (from list/search), unique prefix, or full Graph id

Options:
  --folder <name>   Target Outlook folder display name (required)
  -h, --help        Show this help

Examples:
  outlook-email move 6498ce --folder Processed
  outlook-email move 6498ce --folder Archive
`);
        return;
    }

    const partialId = args[0];
    let targetFolder = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--folder') {
            targetFolder = args[++i];
        }
    }

    if (!targetFolder || !targetFolder.trim()) {
        console.error('Error: --folder <name> is required');
        process.exit(1);
    }

    const fullId = await resolveId(partialId);
    if (!fullId) {
        console.error(`${pink('✗')} Email not found: ${partialId} (run "outlook-email list" first)`);
        process.exit(1);
    }

    const { client } = await getGraphClient();

    const folder = await findFolderByName(client, targetFolder.trim());
    if (!folder) {
        console.error(`${pink('✗')} Folder not found: ${targetFolder}`);
        process.exit(1);
    }

    let subject = '(No Subject)';
    try {
        const meta = await msgApi(client, `/me/messages/${fullId}`).select('subject').get();
        subject = meta.subject || subject;
        // Immutable id survives the move, so the id-map entry stays valid.
        await msgApi(client, `/me/messages/${fullId}/move`).post({ destinationId: folder.id });
    } catch (error) {
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            await removeByFullId(fullId);
            console.error(`${pink('✗')} Email no longer exists (stale id dropped): ${partialId}`);
            process.exit(1);
        }
        throw error;
    }

    console.log(`${mint('✓')} Moved: ${paint(partialId, palette.hash)}`);
    console.log(`  ${paint(subject, palette.subject)}`);
    console.log(`  ${dim('→ ' + folder.displayName)}`);
}
