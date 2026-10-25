// Apple Silicon refuses to run unsigned code, so give the app (and the bundled ffmpeg) an ad-hoc
// signature. It's not a Developer ID signature: on first launch macOS asks you to allow it once.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
