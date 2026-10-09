// Renders the 1080x1350 layout at final size to a PNG (fonts checked before capture).
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const [src,out]=process.argv.slice(2);
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
await p.goto('file://'+require('path').resolve(src));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const bad=await p.evaluate(()=>[...document.fonts].filter(f=>f.status!=='loaded').map(f=>f.family));
if(bad.length)console.log('WARNING fonts not loaded:',bad.join(', '));
await p.screenshot({path:out});await b.close();console.log('Saved',out);})();
