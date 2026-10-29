import http from 'node:http';import {once} from 'node:events';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CaptureStore} from '../server/capture-store.mjs';import {AutoComic} from '../server/auto-comic.mjs';import {drawingFetch} from '../server/drawing-http.mjs';import {pngFixture,publicationFor} from '../tests/png-fixture.mjs';
const delayMs=Number(process.env.CAT_DRAWING_TEST_DELAY_MS||310000);assert.ok(Number.isFinite(delayMs)&&delayMs>=0&&delayMs<590000);
const root=await mkdtemp(path.join(os.tmpdir(),'cat-drawing-wait-'));let requests=0,server,timer,progress;
try{
 server=http.createServer((req,res)=>{requests++;req.resume();req.on('end',()=>{timer=setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json','x-request-id':'local-delay-fixture'});res.end(JSON.stringify({data:[{b64_json:pngFixture().toString('base64')}]}));},delayMs);});});server.listen(0,'127.0.0.1');await once(server,'listening');
 const store=await new CaptureStore({generationMode:'batch',inputRoot:null,dataDir:root}).init();const id='f'.repeat(24),photoIds=['a'.repeat(24)];const work={id,photoIds,status:'story_ready',title:'A Patient Cat'};work.story={...publicationFor(work).metadata};delete work.story.reviewed;delete work.story.prompt;
 store.index.works.push(work);for(const photoId of photoIds){store.index.photos.push({id:photoId});await writeFile(path.join(root,'media',photoId+'.jpg'),await readFile(new URL('../public/mikan.jpg',import.meta.url)));}await store.save();
 const defaults=new AutoComic(store);assert.equal(defaults.drawing.fetch,drawingFetch);assert.equal(defaults.fetch,fetch);
 const auto=await new AutoComic(store,{drawingFetchImpl:(_url,options)=>drawingFetch('http://127.0.0.1:'+server.address().port,options)}).init();auto.drawing.config.apiKey='isolated-test-only';
 await store.requestDrawing(id,{confirmPaid:true,requestId:'isolated-long-wait-test'});const started=Date.now();
 progress=setInterval(()=>console.log(JSON.stringify({elapsedSeconds:Math.round((Date.now()-started)/1000),stage:store.index.works[0].drawingDiagnostics?.stage,requests})),45000);
 await auto.tick();clearInterval(progress);const result=store.index.works[0];assert.equal(result.status,'completed',JSON.stringify(result.drawingDiagnostics));assert.ok(Date.now()-started>=delayMs);assert.equal(requests,1);assert.equal(result.drawingDiagnostics.requestId,'local-delay-fixture');assert.equal(result.drawingDiagnostics.stage,'completed');assert.ok((await auto.drawing.inspect(result)).cache.publicationValid);await auto.tick();assert.equal(requests,1);
 console.log('PASS: delayed headers after '+Math.round(delayMs/1000)+' seconds → PNG cached and published; one request, no retries. Default production drawing uses native HTTP(S), while stories still use fetch. LOCAL SIMULATION ONLY; no paid API calls.');
}finally{clearInterval(progress);clearTimeout(timer);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(root,{recursive:true,force:true});}
