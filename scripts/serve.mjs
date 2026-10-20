import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Collector} from '../server/collector.mjs';
import {AutoComic} from '../server/auto-comic.mjs';
import {CaptureStore} from '../server/capture-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
const store=await new CaptureStore({inputRoot:process.env.CAT_CAPTURE_DIR||path.join(os.homedir(),'Desktop','reCamera猫观察'),dataDir:process.env.CAT_DATA_DIR||path.join(root,'.data')}).init();
const auto=await new AutoComic(store).init();
const collector=new Collector(store,root);await collector.load();await collector.start();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>34*1024*1024){const error=new Error('Request too large');error.statusCode=413;throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const error=new Error('Invalid JSON');error.statusCode=400;throw error;}}
const server=http.createServer(async(req,res)=>{
 try{
  const requestURL=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(requestURL.pathname);
  if(!['localhost','127.0.0.1'].includes((req.headers.host||'').split(':')[0]))return json(res,403,{error:'Local host required'});
  if(pathname.startsWith('/api/')){
   if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});
   if(req.method==='POST'){
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))return json(res,403,{error:'Same-origin request required'});
    if(pathname==='/api/settings')return json(res,200,await store.updateSettings(await body(req)));
    if(pathname==='/api/collector')return json(res,200,await collector.configure(await body(req)));
    if(pathname==='/api/drawing-config')return json(res,200,await auto.drawing.configure(await body(req)));
    if(pathname==='/api/credentials')return json(res,200,await auto.configure(await body(req)));
    if(pathname==='/api/capture/sync')return json(res,200,await store.sync());
    const command=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/(publish|generation)$/);
    if(command){const input=await body(req);return json(res,200,await (command[2]==='publish'?store.publish(command[1],input):store.setGeneration(command[1],input)));}
    return json(res,405,{error:'Method not allowed'});
   }
   if(pathname==='/api/capture')return json(res,200,{...store.snapshot(),automation:auto.snapshot(),collector:collector.snapshot()});
   const photo=pathname.match(/^\/api\/capture\/photos\/([a-f0-9]{24})\.jpg$/);
   const comic=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\.svg$/);
   const artwork=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/artwork\/([a-f0-9]{64})\.png$/);
   if(artwork){const file=await store.artworkFile(artwork[1],artwork[2]);if(!file)return json(res,404,{error:'Artwork not found'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));return;}
   if(photo){const file=await store.photoFile(photo[1]);if(!file)return json(res,404,{error:'Photo not found'});res.writeHead(200,{'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));return;}
   if(comic){const svg=await store.comic(comic[1],requestURL.searchParams.get('lang')==='en'?'en':'zh');if(svg===null)return json(res,404,{error:'Work not found'});res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'"});res.end(svg);return;}
   return json(res,404,{error:'Not found'});
  }
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),relative=path.relative(root,target);
  if(relative.startsWith('..')||relative.split(path.sep).some(x=>x.startsWith('.'))||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
  if(!(await stat(target)).isFile())throw new Error('not found');
  const content=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){if(!res.headersSent)return json(res,error.statusCode||(error.code==='ENOENT'||error.message==='not found'?404:500),{error:error.statusCode?error.message:'Unable to complete request'});res.end();}
});
const timer=setInterval(()=>{store.sync().catch(()=>console.error('Capture sync failed'));auto.tick().catch(()=>console.error('Comic worker failed'));},2000);timer.unref();
server.on('error',error=>{clearInterval(timer);console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`CatApp ready: http://localhost:${port}`);console.log(`Watching capture directory: ${store.inputRoot}`);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await collector.stop();server.close(()=>process.exit(0));});
