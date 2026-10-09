const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const [src,out]=process.argv.slice(2);
const b=await chromium.launch();const p=await b.newPage({viewport:{width:2000,height:1125}});
await p.goto('file://'+require('path').resolve(src));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
console.log(await p.evaluate(()=>[...document.fonts].map(f=>f.family+':'+f.status).join(', ')));
console.log(await p.evaluate(()=>JSON.stringify([...document.querySelectorAll('.badge,.kicker,.title,.bn,.sig')].map(e=>{const r=e.getBoundingClientRect();return [e.className,Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]}))));
await p.screenshot({path:out});await b.close();})();
