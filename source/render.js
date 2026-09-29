const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const times=process.argv[2]?process.argv[2].split(',').map(Number):null;
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.goto('file://'+__dirname+'/anim.html');await p.evaluate(()=>document.fonts.ready);
  fs.mkdirSync('frames',{recursive:true});
  const list=times||[...Array(450).keys()].map(i=>i/30);
  for(let i=0;i<list.length;i++){await p.evaluate(t=>render(t),list[i]);
    await p.screenshot({path:times?`prev_${list[i]}.png`:`frames/f${String(i).padStart(4,'0')}.png`});}
  await b.close();})();
