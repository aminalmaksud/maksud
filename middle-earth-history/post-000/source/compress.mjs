import fs from 'fs';
import {PNG} from 'pngjs';
import encode, {init} from '@jsquash/jpeg/encode.js';
const [src,out,qt,trellis,sub,limit]=process.argv.slice(2);
await init(await WebAssembly.compile(fs.readFileSync(new URL('./node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url))));
const png=PNG.sync.read(fs.readFileSync(src));
const img={data:new Uint8ClampedArray(png.data),width:png.width,height:png.height};
const t=trellis==='1';
const enc=q=>encode(img,{quality:q,chroma_subsample:+sub,auto_subsample:false,quant_table:+qt,trellis_multipass:t,trellis_opt_zero:t,trellis_opt_table:t,trellis_loops:t?1:0,progressive:true,optimize_coding:true});
let lo=5,hi=95,best=null,bq=0;
while(lo<=hi){const m=(lo+hi)>>1;const b=await enc(m);if(b.byteLength<=+limit){best=b;bq=m;lo=m+1}else hi=m-1}
fs.writeFileSync(out,Buffer.from(best));console.log(out.split('/').pop(),'q',bq,best.byteLength);
