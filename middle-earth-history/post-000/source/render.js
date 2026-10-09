// Renders the 2000x1125 layout straight to a 1920x1080 PNG (scale 0.96) so text is drawn at final size.
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const [src,out]=process.argv.slice(2);
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:2000,height:1125},deviceScaleFactor:0.96});
await p.goto('file://'+require('path').resolve(src));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const bad=await p.evaluate(()=>[...document.fonts].filter(f=>f.status!=='loaded').map(f=>f.family));
if(bad.length)console.log('WARNING fonts not loaded:',bad.join(', '));
await p.screenshot({path:out});await b.close();console.log('Saved',out);})();
