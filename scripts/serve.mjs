import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Collector} from '../server/collector.mjs';
import {AutoComic} from '../server/auto-comic.mjs';
import {CaptureStore} from '../server/capture-store.mjs';
import {runtimeConfig} from '../server/runtime-config.mjs';
import {Access} from '../server/access.mjs';
import {loginPage} from '../server/login-page.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),config=runtimeConfig(root);
const store=await new CaptureStore({inputRoot:config.inputRoot,dataDir:config.dataDir}).init();
const access=await new Access(config).init(),auto=await new AutoComic(store).init();
const collector=new Collector(store,root);if(!config.server){await collector.load();await collector.start();}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function bytes(req,limit){const size=Number(req.headers['content-length']);if(size>limit){const e=new Error('Request too large');e.statusCode=413;throw e;}const chunks=[];let count=0;for await(const c of req){count+=c.length;if(count>limit){const e=new Error('Request too large');e.statusCode=413;throw e;}chunks.push(c);}return Buffer.concat(chunks);}
async function body(req){try{return JSON.parse((await bytes(req,34*1024*1024)).toString('utf8'));}catch(e){if(e.statusCode)throw e;const error=new Error('Invalid JSON');error.statusCode=400;throw error;}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 try{
  const requestURL=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(requestURL.pathname);
  if(pathname==='/healthz'&&req.method==='GET')return json(res,200,{status:'ok',release:'story-manual-drawing-v1',summaryPipelineVersion:2});
  const host=new URL('http://'+(req.headers.host||'')).host;
  if(config.server?host!==new URL(config.origin).host:!['localhost','127.0.0.1'].includes(new URL('http://'+host).hostname))return json(res,403,{error:'Host not allowed'});
  const expected=config.origin||'http://'+host;
  if(req.method==='POST'&&(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==expected)))return json(res,403,{error:'Same-origin request required'});
  if(pathname==='/login'){
   if(!config.server||!config.requireLogin){res.writeHead(303,{Location:'/'}).end();return;}
   if(req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(loginPage());return;}
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
   const data=new URLSearchParams((await bytes(req,4096)).toString('utf8')),result=access.login(req,data.get('username')||'',data.get('password')||'');
   if(result.status!==200){res.writeHead(result.status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(loginPage('failed'));return;}
   res.writeHead(303,{'Set-Cookie':result.cookie,Location:'/','Cache-Control':'no-store'}).end();return;
  }
  if(pathname==='/api/device/photos'||pathname==='/api/device/heartbeat'){
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
   const device=access.device(req);if(!device)return json(res,401,{error:'Device credential required'});
   if(!access.allowUpload(device))return json(res,429,{error:'Device rate limit exceeded'});
   if(pathname.endsWith('/heartbeat')){await bytes(req,1024);const state=req.headers['x-catapp-state']==='watching'?'watching':'connected';access.heartbeat(device,state);return json(res,200,{accepted:true});}
   if(req.headers['content-type']?.split(';')[0]!=='image/jpeg')return json(res,415,{error:'Content-Type must be image/jpeg'});
   const result=await store.ingestUpload(device.id,{photoId:req.headers['x-catapp-photo-id'],capturedAt:req.headers['x-catapp-captured-at']},await bytes(req,30*1024*1024));access.heartbeat(device,'collecting');return json(res,result.duplicate?200:201,{accepted:true,...result});
  }
  if(!access.authorized(req)){
   if(pathname.startsWith('/api/'))return json(res,401,{error:'Login required'});
   res.writeHead(303,{Location:'/login','Cache-Control':'no-store'}).end();return;
  }
  if(pathname==='/logout'&&req.method==='POST'){res.writeHead(303,{'Set-Cookie':access.logout(req),Location:'/login'}).end();return;}
  if(pathname.startsWith('/api/')){
   if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});
   if(req.method==='POST'){
    if(pathname==='/api/devices'){const input=await body(req);return json(res,201,await store.enqueue(()=>access.register(input.deviceId)));}
    if(pathname==='/api/daily/preview'){const input=await body(req);return json(res,200,store.previewDay(input.date,input.cameraId));}
    if(pathname==='/api/settings')return json(res,200,await store.updateSettings(await body(req)));
    if(pathname==='/api/collector'){if(config.server)return json(res,409,{error:'SSH collection is disabled in server mode'});return json(res,200,await collector.configure(await body(req)));}
    if(pathname==='/api/drawing-config')return json(res,200,await auto.drawing.configure(await body(req)));
    if(pathname==='/api/credentials')return json(res,200,await auto.configure(await body(req)));
    if(pathname==='/api/capture/sync')return json(res,200,await store.sync());
    const drawRequest=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/drawing$/);
    if(drawRequest){const input=await body(req);if(!auto.drawing.config.apiKey)return json(res,409,{error:'Configure Seedream before requesting a paid drawing'});return json(res,202,await store.requestDrawing(drawRequest[1],input));}
    const command=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/(publish|generation)$/);
    if(command){const input=await body(req);return json(res,200,await (command[2]==='publish'?store.publish(command[1],input):store.setGeneration(command[1],input)));}
    return json(res,405,{error:'Method not allowed'});
   }
   if(pathname==='/api/capture')return json(res,200,{...store.snapshot(),release:'story-manual-drawing-v1',mode:config.mode,requireLogin:config.requireLogin,devices:access.snapshot(),automation:auto.snapshot(),collector:config.server?{state:'direct_upload',online:access.snapshot().some(d=>d.online)}:collector.snapshot()});
   const album=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/photos$/);if(album)return json(res,200,store.workPhotos(album[1],Number(requestURL.searchParams.get('offset')||0),Number(requestURL.searchParams.get('limit')||24)));
   const photo=pathname.match(/^\/api\/capture\/photos\/([a-f0-9]{24})\.jpg$/),comic=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\.svg$/),art=pathname.match(/^\/api\/capture\/works\/([a-f0-9]{24})\/artwork\/([a-f0-9]{64})\.png$/);
   if(art||photo){const file=art?await store.artworkFile(art[1],art[2]):await store.photoFile(photo[1]);if(!file)return json(res,404,{error:'Image not found'});res.writeHead(200,{'Content-Type':art?'image/png':'image/jpeg','Cache-Control':'private, no-store'}).end(await readFile(file));return;}
   if(comic){const svg=await store.comic(comic[1],requestURL.searchParams.get('lang')==='en'?'en':'zh');if(svg===null)return json(res,404,{error:'Work not found'});res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'"}).end(svg);return;}
   return json(res,404,{error:'Not found'});
  }
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),relative=path.relative(root,target);
  if(relative.startsWith('..')||relative.split(path.sep).some(x=>x.startsWith('.'))||!['GET','HEAD'].includes(req.method)||!(relative==='index.html'||relative.startsWith('src'+path.sep)||relative.startsWith('public'+path.sep))){res.writeHead(403).end();return;}
  if(!(await stat(target)).isFile())throw new Error('not found');
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(target));
 }catch(error){if(!res.headersSent)return json(res,error.statusCode||(error.code==='ENOENT'||error.message==='not found'?404:500),{error:error.statusCode?error.message:'Unable to complete request'});res.end();}
});
server.requestTimeout=60000;server.headersTimeout=15000;
const timer=setInterval(()=>{store.sync().catch(()=>console.error('Capture sync failed'));auto.tick().catch(()=>console.error('Comic worker failed'));},2000);timer.unref();
server.on('error',error=>{clearInterval(timer);console.error(error.message);process.exitCode=1;});
server.listen(config.port,config.host,()=>console.log(`CatApp ready: ${config.origin||'http://localhost:'+config.port} (${config.mode})`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await collector.stop();server.close(()=>process.exit(0));});
