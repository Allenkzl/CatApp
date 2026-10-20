import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {CaptureStore} from '../server/capture-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
const store=await new CaptureStore({inputRoot:process.env.CAT_CAPTURE_DIR||path.join(os.homedir(),'Desktop','reCamera猫观察'),dataDir:process.env.CAT_DATA_DIR||path.join(root,'.data')}).init();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/api/')){
   if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});
   if(req.method==='POST'){
    if(pathname!=='/api/capture/sync')return json(res,405,{error:'Method not allowed'});
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))return json(res,403,{error:'Same-origin request required'});
    return json(res,200,await store.sync());
   }
   if(pathname==='/api/capture')return json(res,200,store.snapshot());
   const photo=pathname.match(/^\/api\/capture\/photos\/([a-f0-9]{24})\.jpg$/);
   const comic=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\.svg$/);
   if(photo){const file=await store.photoFile(photo[1]);if(!file)return json(res,404,{error:'Photo not found'});res.writeHead(200,{'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));return;}
   if(comic){const svg=await store.comic(comic[1]);if(svg===null)return json(res,404,{error:'Work not found'});res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'"});res.end(svg);return;}
   return json(res,404,{error:'Not found'});
  }
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),relative=path.relative(root,target);
  if(relative.startsWith('..')||relative.split(path.sep).some(x=>x.startsWith('.'))||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
  if(!(await stat(target)).isFile())throw new Error('not found');
  const content=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
});
const timer=setInterval(()=>store.sync().catch(error=>console.error('抓拍同步失败：',error.message)),2000);timer.unref();
server.on('error',error=>{clearInterval(timer);console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`CatApp ready: http://localhost:${port}`);console.log(`Watching capture directory: ${store.inputRoot}`);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0));});
