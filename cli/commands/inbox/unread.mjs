import { setReadState } from './read-state.mjs';

export default async function unreadCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email unread <id>

Mark an email as unread in Outlook (applies immediately).

Arguments:
  <id>    Short id (from list/search), unique prefix, or full Graph id

Examples:
  outlook-email unread 6498ce
`);
        return;
    }

    await setReadState(args[0], false);
}
