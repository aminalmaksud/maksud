const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const dir=process.argv[2];const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:Number(process.argv[3]||1)});
await p.goto('file://'+dir+'/thumb.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
await p.screenshot({path:dir+'/'+(process.argv[4]||'preview.png')});await b.close();})();
