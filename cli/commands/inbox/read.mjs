import { setReadState } from './read-state.mjs';

export default async function readCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
Usage: outlook-email read <id>

Mark an email as read in Outlook (applies immediately).

Arguments:
  <id>    Short id (from list/search), unique prefix, or full Graph id

Examples:
  outlook-email read 6498ce
`);
        return;
    }

    await setReadState(args[0], true);
}
