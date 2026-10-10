// Renders a list of posts with template.html, reusing one browser for the whole batch.
// Usage: node render.js jobs.json
// jobs.json: [{"data": {...template data...}, "out": "path.png", "scale": 0.96}, ...]
// Prints one JSON line per job: {"out", "panel": [l, t, r, b] in layout px, "warnings": [...]}.
const path = require('path');
const fs = require('fs');
const {chromium} = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const template = 'file://' + path.join(__dirname, 'template.html');
  const browser = await chromium.launch();
  const pages = {};
  const pageFor = async scale => {
    if (!pages[scale]) {
      const ctx = await browser.newContext({viewport: {width: 2000, height: 1125}, deviceScaleFactor: scale});
      pages[scale] = await ctx.newPage();
    }
    return pages[scale];
  };
  let failed = 0;
  for (const job of jobs) {
    const page = await pageFor(job.scale || 0.96);
    // about:blank first so a hash-only change still reloads the template
    await page.goto('about:blank');
    await page.goto(template + '#' + encodeURIComponent(JSON.stringify(job.data)));
    await page.waitForFunction(() => window.READY || window.ERROR, null, {timeout: 30000});
    const err = await page.evaluate(() => window.ERROR);
    if (err) {
      failed++;
      console.log(JSON.stringify({out: job.out, error: err}));
      continue;
    }
    const layout = await page.evaluate(() => window.LAYOUT);
    await page.screenshot({path: job.out});
    console.log(JSON.stringify({out: job.out, ...layout}));
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
