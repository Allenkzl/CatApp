import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CaptureStore} from '../server/capture-store.mjs';import {AutoComic} from '../server/auto-comic.mjs';import {pngFixture,publicationFor} from './png-fixture.mjs';
async function setup(t,fetchImpl){const root=await mkdtemp(path.join(os.tmpdir(),'seedream-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const input=path.join(root,'input');await mkdir(input);const store=await new CaptureStore({generationMode:'batch',inputRoot:input,dataDir:path.join(root,'data')}).init();const photoIds=['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)];const work={id:'d'.repeat(24),photoIds,status:'awaiting_image_provider',title:'A Cat Day'};work.story={...publicationFor(work).metadata};delete work.story.reviewed;delete work.story.prompt;store.index.works.push(work);for(const id of photoIds){await writeFile(path.join(store.dataDir,'media',id+'.jpg'),await readFile(new URL('../public/mikan.jpg',import.meta.url)));store.index.photos.push({id});}await store.save();const auto=await new AutoComic(store,{fetchImpl}).init();await auto.drawing.configure({apiKey:'test-placeholder-only'});await store.requestDrawing(work.id,{confirmPaid:true});return {auto,store,work,input};}
test('draws once with style and real photos, publishes PNG with accurate unreviewed provenance, reuses paid output',async t=>{let calls=0;const {auto,store,work}=await setup(t,async(url,opts)=>{calls++;assert.equal(url,'https://ark.cn-beijing.volces.com/api/v3/images/generations');const body=JSON.parse(opts.body);assert.equal(body.image.length,3);assert.match(body.prompt,/Title exactly/);assert.equal(body.output_format,'png');return {ok:true,json:async()=>({data:[{b64_json:pngFixture().toString('base64')}]})};});await Promise.all([auto.tick(),auto.tick()]);let w=store.index.works[0];assert.equal(w.status,'completed');assert.equal(w.artwork.metadata.generationMode,'seedream-api');assert.equal(w.artwork.metadata.reviewed,false);assert.equal(calls,1);await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();assert.equal(calls,1);assert.equal((await stat(path.join(store.dataDir,'seedream-config.json'))).mode&0o777,0o600);assert.ok(!JSON.stringify(auto.snapshot()).includes('test-placeholder-only'));});
test('authentication failure keeps story and sources and never auto-retries; image retry skips DeepSeek',async t=>{let calls=0;const {auto,store,work}=await setup(t,async()=>{calls++;return {ok:false,status:401,json:async()=>({error:{code:'AuthenticationError',message:'secret provider text'}})};});await auto.tick();assert.equal(store.index.works[0].status,'image_failed');assert.ok(store.index.works[0].story);assert.match(store.index.works[0].error,/HTTP 401/);assert.ok(!store.index.works[0].error.includes('secret'));await auto.tick();assert.equal(calls,1);await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();assert.equal(calls,2);});
test('timeout and interrupted drawing do not repeat a paid request without explicit retry',async t=>{const {auto,store,input}=await setup(t,async()=>{throw new DOMException('timeout','TimeoutError');});await auto.tick();assert.equal(store.index.works[0].status,'image_failed');await store.updateJob(store.index.works[0].id,{status:'drawing'});const restored=await new CaptureStore({generationMode:'batch',inputRoot:input,dataDir:store.dataDir}).init();await new AutoComic(restored).init();assert.equal(restored.index.works[0].status,'image_failed');});

test('configured provider never draws without manual confirmation; duplicates remain idempotent after failure and restart',async t=>{
 let calls=0;const {auto,store,work,input}=await setup(t,async()=>{calls++;throw new DOMException('timeout','TimeoutError');});
 await store.updateJob(work.id,{status:'story_ready',drawingRequested:false});
 await auto.tick();await auto.tick();assert.equal(calls,0);
 await assert.rejects(store.requestDrawing(work.id,{}),e=>e.statusCode===400);
 const token='manual-request-one';const replies=await Promise.all(Array.from({length:5},()=>store.requestDrawing(work.id,{confirmPaid:true,requestId:token})));
 assert.equal(replies.filter(r=>!r.duplicate).length,1);await Promise.all([auto.tick(),auto.tick()]);assert.equal(calls,1);
 assert.match(store.index.works[0].error,/10 minutes/);assert.ok(store.index.works[0].story);
 await assert.rejects(store.requestDrawing(work.id,{confirmPaid:true}),e=>e.statusCode===409);
 assert.equal((await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true,requestId:token})).duplicate,true);
 const restored=await new CaptureStore({generationMode:'batch',inputRoot:input,dataDir:store.dataDir}).init();const a=await new AutoComic(restored,{fetchImpl:async()=>{calls++;throw Error('Must not retry');}}).init();
 await a.tick();assert.equal(calls,1);assert.equal((await restored.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true,requestId:token})).duplicate,true);
 await restored.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true,requestId:'manual-request-two'});await a.tick();assert.equal(calls,2);assert.equal((await restored.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true,requestId:token})).duplicate,true);await a.tick();assert.equal(calls,2);
});

test('manual drawing uses 10-minute timeout and reuses paid cache after publication failure',async t=>{
 let calls=0,timeoutMs;const {auto,store,work}=await setup(t,async()=>{calls++;return {ok:true,json:async()=>({data:[{b64_json:pngFixture().toString('base64')}]})};});
 auto.drawing.timeoutFactory=ms=>{timeoutMs=ms;return AbortSignal.timeout(ms);};
 const publish=store.publish;store.publish=async()=>{throw Error('disk');};await auto.tick();assert.equal(calls,1);assert.equal(timeoutMs,600000);assert.equal(store.index.works[0].status,'image_failed');
 store.publish=publish;await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();assert.equal(store.index.works[0].status,'completed');assert.equal(calls,1);
});

test('manual request validates sources and rolls back on failed save; upgrading waiting stories preserves content',async t=>{
 const {store,work,input}=await setup(t,async()=>{throw Error('No model call');});await store.updateJob(work.id,{status:'story_ready',drawingRequested:false});
 const before=structuredClone(store.index),save=store.save;store.save=async()=>{throw Error('disk full');};await assert.rejects(store.requestDrawing(work.id,{confirmPaid:true}));assert.deepEqual(store.index,before);store.save=save;
 await store.updateJob(work.id,{status:'awaiting_image_provider'});const restored=await new CaptureStore({generationMode:'batch',inputRoot:input,dataDir:store.dataDir}).init();assert.equal(restored.index.works[0].status,'story_ready');assert.deepEqual(restored.index.works[0].story,work.story);
 await store.updateJob(work.id,{story:null});await assert.rejects(store.requestDrawing(work.id,{confirmPaid:true}),e=>e.statusCode===409);
});

test('a confirmed drawing queued before restart runs once even when scheduled stories are paused',async t=>{
 let calls=0;const {auto,store,input}=await setup(t,async()=>{calls++;return {ok:true,json:async()=>({data:[{b64_json:pngFixture().toString('base64')}]})};});
 for(const p of store.index.photos)Object.assign(p,{date:'2026-10-29',capturedAt:'2026-10-29T01:00:00+08:00',cameraId:'test-camera'});
 store.index.settings={...store.index.settings,dailyTime:'00:10',panelCount:8,generationMode:'daily',summaryFrequency:'daily',autoGenerateEnabled:false,dailyStartDate:'2026-10-29'};await store.save();
 const restored=await new CaptureStore({generationMode:'batch',inputRoot:input,dataDir:store.dataDir}).init();const restarted=await new AutoComic(restored,{fetchImpl:auto.fetch}).init();assert.equal(restarted.enabled(),false);assert.equal(restored.index.works[0].status,'image_queued');
 await restarted.tick();await restarted.tick();assert.equal(calls,1);assert.equal(restored.index.works[0].status,'completed');
});


test('network failures retain the underlying timeout code and phase without leaking raw errors',async t=>{
 const raw='sk-private-value must not be logged';let calls=0;const {auto,store}=await setup(t,async()=>{calls++;throw new TypeError(raw,{cause:Object.assign(new Error(raw),{code:'UND_ERR_HEADERS_TIMEOUT'})});});
 const logs=[];t.mock.method(console,'error',line=>logs.push(line));await auto.tick();const w=store.index.works[0];assert.equal(w.status,'image_failed');assert.equal(w.drawingDiagnostics.stage,'provider_request');assert.equal(w.drawingDiagnostics.code,'UND_ERR_HEADERS_TIMEOUT');assert.match(w.error,/response headers/);assert.ok(w.drawingDiagnostics.elapsedMs>=0);assert.ok(w.drawingDiagnostics.requestBytes>0);assert.ok(!JSON.stringify({w,logs}).includes(raw));assert.equal(logs.length,1);await auto.tick();assert.equal(calls,1);
});

test('provider rejection records HTTP status, provider code and request ID; JSON and empty-image failures identify their stages',async t=>{
 const {auto,store,work}=await setup(t,async()=>({ok:false,status:400,headers:new Headers({'x-request-id':'req-diagnostic-123'}),json:async()=>({error:{code:'InvalidParameter',message:'sensitive raw response'}})}));
 await auto.tick();let w=store.index.works[0];assert.equal(w.drawingDiagnostics.stage,'provider_response');assert.equal(w.drawingDiagnostics.httpStatus,400);assert.equal(w.drawingDiagnostics.providerCode,'InvalidParameter');assert.equal(w.drawingDiagnostics.requestId,'req-diagnostic-123');assert.ok(!JSON.stringify(w).includes('sensitive raw response'));
 auto.drawing.fetch=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('secret body');}});await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();w=store.index.works[0];assert.equal(w.drawingDiagnostics.stage,'provider_response');assert.match(w.error,/valid JSON/);
 auto.drawing.fetch=async()=>({ok:true,status:200,json:async()=>({request_id:'req-no-image',data:[]})});await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();w=store.index.works[0];assert.equal(w.drawingDiagnostics.stage,'decoding_response');assert.equal(w.drawingDiagnostics.code,'SEEDREAM_NO_IMAGE');assert.equal(w.drawingDiagnostics.requestId,'req-no-image');
});

test('read-only cache inspection distinguishes missing, incomplete and recoverable paid output without calling a provider',async t=>{
 let calls=0;const {auto,store,work}=await setup(t,async()=>{calls++;return {ok:true,json:async()=>({data:[{b64_json:pngFixture().toString('base64')}]})};});
 let r=await auto.drawing.inspect(work);assert.equal(calls,0);assert.equal(r.style.exists,true);assert.equal(r.sources.filter(p=>p.exists).length,3);assert.equal(r.cache.image.exists,false);
 const publish=store.publish;store.publish=async()=>{throw Error('private filesystem detail');};await auto.tick();assert.equal(store.index.works[0].drawingDiagnostics.stage,'publishing');assert.ok(!store.index.works[0].error.includes('private filesystem detail'));
 r=await auto.drawing.inspect(work);assert.equal(calls,1);assert.equal(r.cache.image.exists,true);assert.equal(r.cache.metadata.exists,true);assert.equal(r.cache.matchesCurrentRequest,true);assert.equal(r.cache.publicationValid,true);assert.ok(!JSON.stringify(r).includes(store.dataDir));
 store.publish=publish;await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});await auto.tick();assert.equal(calls,1);assert.equal(store.index.works[0].drawingDiagnostics.cacheReused,true);assert.equal(store.index.works[0].drawingDiagnostics.stage,'completed');
 await rm(path.join(store.dataDir,'jobs',work.id,'seedream-publication.json'));r=await auto.drawing.inspect(work);assert.equal(r.cache.image.exists,true);assert.equal(r.cache.metadata.exists,false);assert.equal(calls,1);
});

test('small base64 reference mode uses two photos plus compressed style, downloads the paid image and reuses the saved URL after a download failure',async t=>{
 let posts=0,downloads=0,failDownload=true;
 const {auto,store,work}=await setup(t,async(url,opts)=>{
  if(opts.method==='GET'){
   downloads++;assert.equal(url,'https://cdn.example/result.png');
   if(failDownload)throw new Error('simulated download interruption');
   return {ok:true,status:200,buffer:async()=>pngFixture()};
  }
  posts++;assert.equal(url,'https://ark.cn-beijing.volces.com/api/v3/images/generations');
  const body=JSON.parse(opts.body);
  assert.equal(body.response_format,'url');assert.equal(body.output_format,'png');assert.equal(body.image.length,3);
  assert.ok(body.image.every(u=>u.startsWith('data:image/jpeg;base64,')));
  assert.match(body.prompt,/Only the supplied reference photos are available/);
  return {ok:true,json:async()=>({data:[{url:'https://cdn.example/result.png'}]})};
 });
 await auto.tick();
 assert.equal(posts,1);assert.equal(downloads,1);assert.equal(store.index.works[0].status,'image_failed');
 assert.ok((await stat(path.join(store.dataDir,'jobs',work.id,'seedream-result.url'))).isFile());
 assert.equal(auto.drawing.snapshot().drawingReferenceMode,'base64-limited');
 failDownload=false;
 await store.requestDrawing(work.id,{confirmPaid:true,confirmRetry:true});
 await auto.tick();
 assert.equal(posts,1);assert.equal(downloads,2);assert.equal(store.index.works[0].status,'completed');
 assert.equal(store.index.works[0].artwork.metadata.generationMode,'seedream-api');
});
