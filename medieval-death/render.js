const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const times=process.argv[2]?process.argv[2].split(',').map(Number):null;
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
  p.on('pageerror',e=>console.error('PAGE ERROR',e.message));
  await p.goto('file://'+__dirname+'/anim.html');await p.waitForFunction(()=>window.ready);
  const FPS=30,DUR=6.5;
  fs.mkdirSync(times?'prev':'frames',{recursive:true});
  const list=times||[...Array(Math.round(FPS*DUR)).keys()].map(i=>i/FPS);
  for(let i=0;i<list.length;i++){await p.evaluate(t=>render(t),list[i]);
    await p.screenshot({path:times?`prev/t${list[i]}.png`:`frames/f${String(i).padStart(4,'0')}.png`});}
  await b.close();})();
