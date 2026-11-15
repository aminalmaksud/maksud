// Entry point for the Windows app's bundled server (see windows/scripts/build-server.mjs).
import { start } from './server.js';

// The app keeps our stdin open while it runs. When it closes (the app quit or crashed), stop too.
if (process.env.MMTV_EXIT_WITH_PARENT) {
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('error', () => process.exit(0));
  process.stdin.resume();
}
start();
