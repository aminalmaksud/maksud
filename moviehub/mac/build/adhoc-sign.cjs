// Apple Silicon refuses to run unsigned code, so give the app (and the bundled ffmpeg) an ad-hoc
// signature. It's not a Developer ID signature: on first launch macOS asks you to allow it once.
// On a Mac this uses codesign; when the app is built on Linux it uses rcodesign (RCODESIGN=path).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    return;
  }
  const rcodesign = process.env.RCODESIGN || 'rcodesign';
  // ffmpeg/ffprobe sit in Resources, which bundle signing treats as plain files: sign them first.
  const unpacked = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
  const bins = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^(ffmpeg|ffprobe)$/.test(e.name) && /darwin|ffmpeg-static/.test(p)) bins.push(p);
    }
  };
  walk(unpacked);
  for (const b of bins) execFileSync(rcodesign, ['sign', b], { stdio: 'inherit' });
  execFileSync(rcodesign, ['sign', app], { stdio: 'inherit' });
};
