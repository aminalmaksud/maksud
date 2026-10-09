// Render one Marvel Heroes post card to a 1920x1080 PNG.
// Usage: node marvel-heroes/template/render.js marvel-heroes/posts/day-001.json
const {chromium} = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const cfgPath = path.resolve(process.argv[2]);
  const post = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  // image paths in the JSON are relative to the JSON file; the template needs a file URL
  post.image = 'file://' + path.resolve(path.dirname(cfgPath), post.image);
  const out = path.resolve(path.dirname(cfgPath), post.output);

  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 1920, height: 1080}});
  await p.addInitScript(cfg => { window.POST = cfg; }, post);
  await p.goto('file://' + path.join(__dirname, 'post.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.getElementById('art').complete);
  await p.evaluate(() => window.fitAll());
  const bad = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'error').map(f => f.family));
  if (bad.length) console.warn('WARNING: fonts failed to load:', bad.join(', '));
  await p.screenshot({path: out});
  await b.close();
  console.log('Saved', out);
})();
