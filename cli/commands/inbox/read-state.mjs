import { getGraphClient, msgApi } from '../../lib/client.mjs';
import { resolveId, removeByFullId } from '../../lib/idmap.mjs';
import { paint, palette, mint, pink } from '../../lib/utils.mjs';

/**
 * Resolve a CLI id, PATCH the message's isRead flag, and print a result line.
 * Shared by the read/unread commands.
 * @param {string} partialId
 * @param {boolean} targetRead
 */
export async function setReadState(partialId, targetRead) {
    const fullId = await resolveId(partialId);
    if (!fullId) {
        console.error(`${pink('✗')} Email not found: ${partialId} (run "outlook-email list" first)`);
        process.exit(1);
    }

    const { client } = await getGraphClient();

    let email;
    try {
        email = await msgApi(client, `/me/messages/${fullId}`)
            .select('id,subject,isRead')
            .get();
        if (email.isRead !== targetRead) {
            await msgApi(client, `/me/messages/${fullId}`).patch({ isRead: targetRead });
        }
    } catch (error) {
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            await removeByFullId(fullId);
            console.error(`${pink('✗')} Email no longer exists (stale id dropped): ${partialId}`);
            process.exit(1);
        }
        throw error;
    }

    const verb = targetRead ? 'read' : 'unread';
    const already = email.isRead === targetRead ? ' (already)' : '';
    console.log(`${mint('✓')} Marked ${verb}${already}: ${paint(partialId, palette.hash)}`);
    console.log(`  ${paint(email.subject || '(No Subject)', palette.subject)}`);
}
