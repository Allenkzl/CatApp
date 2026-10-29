import {readdir, readFile, writeFile, mkdir, rename, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {htmlFor, translate, workTitle} from '../src/i18n.js';
import {esc} from '../src/art.js';
import {validatePublication} from './comic-publication.mjs';
import {DAILY_DEFAULTS,beijingDay,dueAt,dailyPlan,dailyId,validDay,periodPlan,hourlyId,scheduleState,isSummary,workFrequency} from './daily-summary.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
function jpegSize(buffer){
 if(buffer.length<8||buffer[0]!==255||buffer[1]!==216||buffer.at(-2)!==255||buffer.at(-1)!==217)throw new Error('照片尚未完整写入，或不是 JPEG');
 let offset=2;
 while(offset+4<buffer.length){
  if(buffer[offset++]!==255)throw new Error('JPEG 数据格式不完整');
  while(buffer[offset]===255)offset++;
  const marker=buffer[offset++];
  if(marker===0xda||marker===0xd9)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  const length=buffer.readUInt16BE(offset);
  if(length<2||offset+length>buffer.length)throw new Error('JPEG 数据尚未写完');
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(length<8)throw new Error('JPEG 尺寸字段无效');
   const height=buffer.readUInt16BE(offset+3),width=buffer.readUInt16BE(offset+5);
   if(!height||!width||height*width>60000000)throw new Error('JPEG 尺寸超出支持范围');
   return {width,height};
  }
  offset+=length;
 }
 throw new Error('无法读取 JPEG 尺寸');
}
function localDate(iso){
 if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(iso))throw new Error('缺少含时区的有效拍摄时间');
 const time=new Date(iso);
 if(!Number.isFinite(time.getTime()))throw new Error('缺少有效拍摄时间');
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(time);
 return {date:parts.slice(0,10),time:parts.slice(11,19),capturedAt:time.toISOString()};
}
export class CaptureStore {
 constructor({inputRoot,dataDir,now=()=>new Date(),generationMode='daily',initialFrequency='daily'}){this.now=now;this.generationMode=generationMode;this.initialFrequency=initialFrequency;this.inputRoot=inputRoot?path.resolve(inputRoot):null;this.dataDir=path.resolve(dataDir);this.index={version:1,photos:[],works:[],settings:{batchPhotoCount:3},groups:[]};this.errors=[];this.status='waiting';this.running=null;this.queue=Promise.resolve();}
 async init(){
  await mkdir(path.join(this.dataDir,'media'),{recursive:true});
  await mkdir(path.join(this.dataDir,'comics'),{recursive:true});
  try{const saved=JSON.parse(await readFile(path.join(this.dataDir,'captures.json'),'utf8'));if(saved.version!==1||!Array.isArray(saved.photos)||!Array.isArray(saved.works))throw new Error('Invalid capture store');this.index=saved;}
  catch(error){if(error.code!=='ENOENT')throw new Error('抓拍数据索引损坏，已停止同步以保留原文件。');}
  this.index.settings ||= {batchPhotoCount:3};this.index.groups ||= [];
  let migrated=false;
  if(this.generationMode==='daily'&&this.index.settings.generationMode!=='daily'){
   this.index.settings={...this.index.settings,...DAILY_DEFAULTS,summaryFrequency:this.initialFrequency,dailyStartDate:beijingDay(this.now())};
   for(const work of this.index.works)if(work.status!=='completed'&&work.kind!=='daily-summary'){work.legacyStatus=work.status;work.status='legacy_paused';}
   this.index.groups=[];migrated=true;
  }
  if(this.index.settings.generationMode==='daily'){
   if(!['hourly','daily'].includes(this.index.settings.summaryFrequency||this.initialFrequency))throw new Error('Invalid summary frequency');
   if(this.index.settings.summaryFrequency===undefined){this.index.settings.summaryFrequency=this.initialFrequency;migrated=true;}
   if(this.index.settings.summaryFrequency==='hourly'&&!this.index.settings.hourlyAnchorAt){this.index.settings.hourlyAnchorAt=this.now().toISOString();migrated=true;}
   if(this.index.settings.summaryFrequency==='hourly'&&!Number.isFinite(Date.parse(this.index.settings.hourlyAnchorAt)))throw new Error('Invalid hourly anchor');
   if(this.index.settings.autoGenerateEnabled===undefined){this.index.settings.autoGenerateEnabled=true;migrated=true;}
   if(typeof this.index.settings.autoGenerateEnabled!=='boolean')throw new Error('Invalid saved automatic-generation setting');
  }
  for(const work of this.index.works)if(work.mode==='photo-layout'&&work.status!=='legacy_paused'){work.previewUrl=work.comicUrl;work.comicUrl=null;work.mode='illustrated-comic';work.status='ready_for_generation';migrated=true;}
  for(const work of this.index.works)if(work.status==='awaiting_image_provider'&&work.story){work.status='story_ready';work.generationStage='story_complete';work.drawingRequested=false;migrated=true;}
  if(migrated)await this.save();
  await this.sync();return this;
 }
 async save(){const file=path.join(this.dataDir,'captures.json');await writeFile(file+'.tmp',JSON.stringify(this.index,null,2));await rename(file+'.tmp',file);}
 enqueue(action){const pending=this.queue.then(action);this.queue=pending.catch(()=>{});return pending;}
 sync(){if(this.running)return this.running;this.running=this.enqueue(()=>this.scan()).finally(()=>{this.running=null;});return this.running;}
 async scan(){
  this.errors=[];let changed=false;
  if(!this.inputRoot){this.status='direct';if(this.groupUnassigned()||this.unsaved){this.unsaved=true;await this.save();this.unsaved=false;}return this.snapshot();}
  let dirs,root;
  try{root=await realpath(this.inputRoot);dirs=await readdir(root,{withFileTypes:true});this.status='watching';}
  catch(error){this.status='waiting';this.errors.push(error.code==='ENOENT'?'等待采集目录出现。':'暂时无法读取采集目录。');if(this.groupUnassigned()||this.unsaved){this.unsaved=true;await this.save();this.unsaved=false;}return this.snapshot();}
  for(const entry of dirs.sort((a,b)=>a.name.localeCompare(b.name))){
   if(!entry.isDirectory()||!/^cats-[a-zA-Z0-9-]+$/.test(entry.name))continue;
   const dir=path.join(root,entry.name);
   try{
    const actualDir=await realpath(dir);if(!inside(root,actualDir))throw new Error('批次路径超出采集目录');
    const manifestPath=await realpath(path.join(dir,'photos.json'));if(!inside(actualDir,manifestPath))throw new Error('清单路径超出批次目录');
    if((await stat(manifestPath)).size>2000000)throw new Error('批次清单过大');
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(!Array.isArray(manifest))throw new Error('照片清单格式错误');
    const records=manifest.slice().sort((a,b)=>String(a?.captured_at).localeCompare(String(b?.captured_at)));
    for(const record of records){
     try{
      if(typeof record?.local_path!=='string')throw new Error('照片清单缺少文件名');
      // Use only the filename so copied manifests remain portable. Resolve symlinks
      // and confine every file read to the corresponding capture batch directory.
      const name=path.basename(record.local_path);
      if(!/\.jpe?g$/i.test(name)||name.startsWith('.'))throw new Error('照片格式不支持');
      const photoId=hash(`${entry.name}/${name}`);
      if(this.index.photos.some(p=>p.id===photoId))continue;
      const file=await realpath(path.join(actualDir,name));if(!inside(actualDir,file))throw new Error('照片路径超出批次目录');
      const fileStat=await stat(file);if(!fileStat.isFile()||fileStat.size>30*1024*1024)throw new Error('照片文件大小不支持');
      const buffer=await readFile(file),dimensions=jpegSize(buffer),when=localDate(record.captured_at);
      const target=path.join(this.dataDir,'media',photoId+'.jpg');await writeFile(target+'.part',buffer);await rename(target+'.part',target);
      this.index.photos.push({id:photoId,session:entry.name,name,cameraId:typeof record.camera_id==='string'?record.camera_id.slice(0,100):'recamera-default',...when,...dimensions,contentHash:createHash('sha256').update(buffer).digest('hex'),score:Number.isFinite(record.score)&&record.score>=0&&record.score<=1?record.score:null,url:`/api/capture/photos/${photoId}.jpg`,source:'reCamera',identity:'unknown'});changed=true;
     }catch(error){this.errors.push(`${entry.name}：${error.code==='ENOENT'?'照片尚未就绪':error.message}`);}
    }
   }catch(error){if(error.code!=='ENOENT')this.errors.push(`${entry.name}：${error instanceof SyntaxError?'清单正在更新，稍后重试':error.message}`);}
  }
  changed=this.groupUnassigned()||changed;
  // Also retry an interrupted index write even if the next scan finds no new files.
  if(changed||this.unsaved){this.unsaved=true;await this.save();this.unsaved=false;}
  return this.snapshot();
 }
 previewDay(day,cameraId){
  if(!validDay(day)){const e=new Error('Invalid date');e.statusCode=400;throw e;}
  const cameras=[...new Set(this.index.photos.filter(p=>p.date===day).map(p=>p.cameraId||'recamera-default'))];
  return {previewOnly:true,paidGeneration:false,date:day,plans:cameras.filter(id=>!cameraId||id===cameraId).map(id=>dailyPlan(this.index.photos,day,id,this.index.settings.panelCount||8))};
 }
 scheduleDaily(){
  let changed=false;const settings=this.index.settings,now=this.now();
  if(settings.summaryFrequency==='hourly')return this.scheduleHourly(now);
  const keys=new Map(this.index.photos.map(p=>[(p.cameraId||'recamera-default')+'/'+p.date,{date:p.date,cameraId:p.cameraId||'recamera-default'}]));
  for(const {date,cameraId} of keys.values()){
   if(date<settings.dailyStartDate||dueAt(date,settings.dailyTime)>now)continue;
   const id=dailyId(cameraId,date);if(this.index.works.some(w=>w.id===id))continue;
   const start=date+'T00:00:00+08:00',end=new Date(Date.parse(start)+86400000);
   const plan=periodPlan(this.index.photos,start,end,cameraId,settings.panelCount);
   if(!plan.photoIds.length)continue;
   this.index.works.push({...plan,id,kind:'daily-summary',title:`Daily Cat Summary · ${date}`,createdAt:now.toISOString(),scheduledFor:dueAt(date,settings.dailyTime).toISOString(),mode:'illustrated-comic',status:'ready_for_generation',comicUrl:null});changed=true;
  }
  return changed;
 }
 scheduleHourly(now){
  const anchor=Date.parse(this.index.settings.hourlyAnchorAt);if(!Number.isFinite(anchor))throw new Error('Invalid hourly schedule anchor');
  const completed=Math.floor((now.getTime()-anchor)/3600000);if(completed<1)return false;
  const windows=new Map();
  for(const p of this.index.photos){const n=Math.floor((Date.parse(p.capturedAt)-anchor)/3600000);if(n<0||n>=completed)continue;const camera=p.cameraId||'recamera-default';windows.set(camera+'/'+n,{camera,n});}
  let changed=false;
  for(const {camera,n} of windows.values()){
   const start=new Date(anchor+n*3600000),end=new Date(start.getTime()+3600000),id=hourlyId(camera,start);if(this.index.works.some(w=>w.id===id))continue;
   const plan=periodPlan(this.index.photos,start,end,camera,this.index.settings.panelCount);if(!plan.photoIds.length)continue;
   this.index.works.push({...plan,id,kind:'hourly-summary',title:`Hourly Cat Diary · ${plan.date} · ${plan.periodStart}`,createdAt:now.toISOString(),scheduledFor:end.toISOString(),mode:'illustrated-comic',status:'ready_for_generation',comicUrl:null});changed=true;
  }
  return changed;
 }
 workEligible(work){return this.index.settings.generationMode!=='daily'||!isSummary(work)||workFrequency(work)===(this.index.settings.summaryFrequency||'daily');}
 albumIds(work){
  if(!isSummary(work)||!work.periodStart||!work.periodEnd)return work.allPhotoIds||work.photoIds;
  return this.index.photos.filter(p=>(p.cameraId||'recamera-default')===work.cameraId&&p.capturedAt>=work.periodStart&&p.capturedAt<work.periodEnd).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id)).map(p=>p.id);
 }
 workPhotos(id,offset=0,limit=24){
  const work=this.index.works.find(w=>w.id===id);if(!work){const e=new Error('Unknown work');e.statusCode=404;throw e;}
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>48){const e=new Error('Invalid page');e.statusCode=400;throw e;}
  const ids=this.albumIds(work);return {workId:id,total:ids.length,offset,photos:ids.slice(offset,offset+limit).map(id=>this.index.photos.find(p=>p.id===id)).filter(Boolean),nextOffset:offset+limit<ids.length?offset+limit:null};
 }
 groupUnassigned(){
  if(this.index.settings.generationMode==='daily')return this.scheduleDaily();
  let changed=false;
  const assigned=new Set(this.index.works.flatMap(w=>w.photoIds));
  const groups=new Map();
  for(const photo of this.index.photos.filter(p=>!assigned.has(p.id)).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt))){
   const key=(photo.cameraId||'recamera-default')+'/'+photo.date;
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(photo);
  }
  for(const [key,photos] of groups){
   let group=this.index.groups.find(g=>g.key===key);
   if(!group){group={key,target:this.index.settings.batchPhotoCount};this.index.groups.push(group);changed=true;}
   while(photos.length>=group.target){
    const batch=photos.splice(0,group.target),id=hash(batch.map(p=>p.id).join('/')),date=batch[0].date;
    this.index.works.push({id,date,title:`Daily Cat Diary · ${date} / ${this.index.works.filter(w=>w.date===date).length+1}`,photoIds:batch.map(p=>p.id),cameraId:batch[0].cameraId||'recamera-default',session:batch[0].session,createdAt:new Date().toISOString(),mode:'illustrated-comic',status:'ready_for_generation',comicUrl:null});
    group.target=this.index.settings.batchPhotoCount;changed=true;
   }
   if(!photos.length)this.index.groups=this.index.groups.filter(g=>g.key!==key);
  }
  return changed;
 }
 snapshot(){
  const daily=this.index.settings.generationMode==='daily';
  const assigned=new Set(this.index.works.filter(w=>!daily||isSummary(w)).flatMap(w=>w.allPhotoIds||w.photoIds)),pending=[];
  for(const photo of this.index.photos.filter(p=>!assigned.has(p.id))){
   const key=(photo.cameraId||'recamera-default')+'/'+photo.date;
   let group=pending.find(g=>g.key===key);
   if(!group){group={key,session:photo.session,date:photo.date,count:0,target:daily?null:this.index.groups.find(g=>g.key===key)?.target||this.index.settings.batchPhotoCount};pending.push(group);}group.count++;
  }
  return {...this.index,works:this.index.works.map(w=>{if(!isSummary(w))return w;const album=this.albumIds(w),frozen=new Set(w.allPhotoIds||w.photoIds);return {...w,albumPhotoIds:album,latePhotoCount:album.filter(id=>!frozen.has(id)).length};}),schedule:scheduleState(this.index.settings,this.now()),pending,inputRoot:this.inputRoot,status:this.status,errors:[...new Set(this.errors)].slice(0,10)};
 }
 ingestUpload(deviceId,metadata,buffer){return this.enqueue(async()=>{
  const bad=message=>{const e=new Error(message);e.statusCode=400;throw e;};
  if(typeof metadata.photoId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(metadata.photoId))bad('Invalid photo ID');
  if(!Buffer.isBuffer(buffer)||buffer.length>30*1024*1024)bad('JPEG must be at most 30 MB');
  let dimensions,when;try{dimensions=jpegSize(buffer);when=localDate(metadata.capturedAt);}catch(e){bad(e.message);}
  const id=hash('upload/'+deviceId+'/'+metadata.photoId),contentHash=createHash('sha256').update(buffer).digest('hex');
  const existing=this.index.photos.find(p=>p.id===id);
  if(existing){if(existing.contentHash!==contentHash||existing.capturedAt!==when.capturedAt){const e=new Error('Photo ID already exists with different content or capture time');e.statusCode=409;throw e;}if(this.unsaved){await this.save();this.unsaved=false;}return {photoId:id,duplicate:true};}
  const file=path.join(this.dataDir,'media',id+'.jpg');await writeFile(file+'.part',buffer);await rename(file+'.part',file);
  const previous=this.index;this.index=structuredClone(previous);
  this.index.photos.push({id,cameraId:deviceId,externalId:metadata.photoId,name:metadata.photoId+'.jpg',session:'device-'+deviceId,...when,...dimensions,contentHash,score:null,url:`/api/capture/photos/${id}.jpg`,source:'reCamera direct upload',identity:'unknown'});
  this.groupUnassigned();
  try{await this.save();}catch(e){this.index=previous;throw e;}
  return {photoId:id,duplicate:false};
 });}
 updateSettings(input){return this.enqueue(async()=>{
  if(this.index.settings.generationMode==='daily'){
   if(!['hourly','daily'].includes(this.index.settings.summaryFrequency||this.initialFrequency))throw new Error('Invalid summary frequency');
   const fields=['dailyTime','panelCount','autoGenerateEnabled','summaryFrequency'];
   const patch=Object.fromEntries(fields.filter(k=>Object.hasOwn(input||{},k)).map(k=>[k,input[k]]));
   const next={...this.index.settings,...patch};
   if(!Object.keys(patch).length||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.dailyTime||'')||![6,7,8].includes(next.panelCount)||typeof next.autoGenerateEnabled!=='boolean'||!['daily','hourly'].includes(next.summaryFrequency)){const e=new Error('Use HH:mm, 6–8 panels and a boolean automatic-generation switch');e.statusCode=400;throw e;}
   if(next.summaryFrequency==='hourly'&&(this.index.settings.summaryFrequency!=='hourly'||!next.hourlyAnchorAt))next.hourlyAnchorAt=this.now().toISOString();
   const old=this.index;this.index=structuredClone(old);this.index.settings=next;
   try{await this.save();}catch(e){this.index=old;throw e;}return this.snapshot();
  }
  if(!Number.isInteger(input?.batchPhotoCount)||input.batchPhotoCount<1||input.batchPhotoCount>12){const e=new Error('Photo count must be an integer from 1 to 12');e.statusCode=400;throw e;}
  const previous=this.index.settings;this.index.settings={batchPhotoCount:input.batchPhotoCount};
  try{await this.save();}catch(e){this.index.settings=previous;throw e;}return this.snapshot();
 });}
 updateJob(id,patch){return this.enqueue(async()=>{
  const old=this.index,work=old.works.find(w=>w.id===id);if(!work)throw new Error('Unknown work');
  this.index={...old,works:old.works.map(w=>w.id===id?{...w,...patch}:w)};
  try{await this.save();}catch(e){this.index=old;throw e;}return this.snapshot();
 });}
 async photoFile(id){if(!/^[a-f0-9]{24}$/.test(id)||!this.index.photos.some(p=>p.id===id))return null;return path.join(this.dataDir,'media',id+'.jpg');}
 async artworkFile(id,digest){
  const work=this.index.works.find(w=>w.id===id);
  const art=[work?.artwork,...(work?.history||[])].find(a=>a?.digest===digest);
  return art?path.join(this.dataDir,'comics',id+'-'+digest+'.png'):null;
 }
 requestDrawing(id,input){return this.enqueue(async()=>{
  const fail=(message,statusCode=409)=>{const e=new Error(message);e.statusCode=statusCode;throw e;};
  if(input?.confirmPaid!==true)fail('Confirm that this manual drawing may incur provider charges',400);
  const work=this.index.works.find(w=>w.id===id);if(!work)fail('Unknown work',404);
  if(work.status==='legacy_paused')fail('Legacy batch is paused');
  if(input.requestId!==undefined&&(typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId)))fail('Invalid drawing request ID',400);
  if(input.requestId&&(work.drawingRequestId===input.requestId||work.drawingRequestIds?.includes(input.requestId)))return {workId:id,status:work.status,duplicate:true};
  if(!work.story||!Array.isArray(work.story.panels)||!work.story.panels.length)fail('Finish the story before drawing');
  if(work.artwork||['image_queued','drawing'].includes(work.status))return {workId:id,status:work.status,duplicate:true};
  if(!['story_ready','awaiting_image_provider','image_failed'].includes(work.status))fail('Work is not ready for manual drawing');
  if(work.status==='image_failed'&&input.confirmRetry!==true)fail('Previous drawing may have been billed; explicitly confirm retry');
  const old=this.index;this.index={...old,works:old.works.map(w=>w.id===id?{...w,status:'image_queued',generationStage:'image',drawingRequested:true,drawingRequestId:input.requestId||null,drawingRequestIds:[...(work.drawingRequestIds||[work.drawingRequestId].filter(Boolean)),...(input.requestId?[input.requestId]:[])],drawingRequestedAt:new Date().toISOString(),error:null}:w)};
  try{await this.save();}catch(e){this.index=old;throw e;}
  return {workId:id,status:'image_queued',duplicate:false};
 });}
 setGeneration(id,input){return this.enqueue(async()=>{
  const work=this.index.works.find(w=>w.id===id);
  if(!work){const error=new Error('Unknown capture batch');error.statusCode=404;throw error;}
  if(work.status==='legacy_paused'){const e=new Error('Legacy batches are paused; their photos are retained for daily summaries');e.statusCode=409;throw e;}
  if(!['ready_for_generation','awaiting_image_provider','generating','failed'].includes(input?.status)){const error=new Error('Invalid generation state');error.statusCode=400;throw error;}
  if(input.status==='awaiting_image_provider'&&!work.story){const error=new Error('A storyboard is required before drawing');error.statusCode=400;throw error;}
  const next={...work,status:input.status};
  if(input.status==='failed')next.error=String(input.error||'Generation failed. Retry using the same photos.').slice(0,500);else delete next.error;
  const previous=this.index;this.index={...previous,works:previous.works.map(w=>w.id===id?next:w)};
  try{await this.save();}catch(error){this.index=previous;throw error;}
  return this.snapshot();
 });}
 publish(id,input){return this.enqueue(async()=>{
  const work=this.index.works.find(w=>w.id===id);
  const result=validatePublication(work,input);
  const file=id+'-'+result.digest+'.png',target=path.join(this.dataDir,'comics',file);
  await writeFile(target+'.part',result.buffer);await rename(target+'.part',target);
  const same=work.artwork?.digest===result.digest&&JSON.stringify(work.artwork.metadata)===JSON.stringify(result.metadata);
  const art=same?work.artwork:{digest:result.digest,width:result.width,height:result.height,url:`/api/capture/works/${id}/artwork/${result.digest}.png`,publishedAt:new Date().toISOString(),metadata:result.metadata};
  const next={...work,title:result.metadata.title,status:'completed',mode:'illustrated-comic',artwork:art,comicUrl:art.url,history:same?(work.history||[]):[...(work.history||[]),...(work.artwork?[work.artwork]:[])]};delete next.error;
  const previous=this.index;this.index={...previous,works:previous.works.map(w=>w.id===id?next:w)};
  try{await this.save();}catch(error){this.index=previous;throw error;}
  return this.snapshot();
 });}
 async comic(id, language='zh'){
  const html=htmlFor(language), t=value=>translate(value,language);
  const work=this.index.works.find(w=>w.id===id);if(!work)return null;
  const photos=work.photoIds.map(id=>this.index.photos.find(p=>p.id===id));
  const images=await Promise.all(photos.map(p=>readFile(path.join(this.dataDir,'media',p.id+'.jpg'))));
  return html`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1870" viewBox="0 0 1100 1870"><rect width="1100" height="1870" fill="#f7f3e8"/><g font-family="sans-serif" fill="#315543"><text x="550" y="64" text-anchor="middle" font-size="16" letter-spacing="4">THE DAILY CAT DIARY</text><text x="550" y="125" text-anchor="middle" font-size="35">${esc(workTitle(work,language))}</text><text x="550" y="171" text-anchor="middle" font-size="17">三次快门，收藏今天的三个小瞬间。</text></g>${photos.map((p,i)=>html`<g transform="translate(55 ${210+i*505})"><rect width="990" height="480" rx="14" fill="#fffdf7" stroke="#d7ddcd"/><rect x="20" y="20" width="950" height="360" rx="9" fill="#e9eade"/><image href="data:image/jpeg;base64,${images[i].toString('base64')}" x="20" y="20" width="950" height="360" preserveAspectRatio="xMidYMid meet"/><g font-family="sans-serif" fill="#315543"><rect x="36" y="36" width="56" height="38" rx="7" fill="#fffbed"/><text x="64" y="63" text-anchor="middle" font-size="23">0${i+1}</text><text x="28" y="422" font-size="23">${esc(t(['第一眼，今天的故事开始了。','再看一眼，把这个瞬间留下。','第三次快门，收好今天的小日常。'][i]))}</text><text x="28" y="457" font-size="15" fill="#8b987e">${esc(p.date)} ${esc(p.time)} · reCamera 抓拍 · ${esc(p.name)}</text></g></g>`).join('')}<g font-family="sans-serif" fill="#8a987d" font-size="15"><text x="55" y="1770">照片排版版 · 未使用 AI 绘图或行为识别 · 文案为创作，不代表连续行为或个体识别结论。</text><text x="55" y="1810">Open Datalogger × Seeed · 来源批次 ${esc(work.session)}</text></g></svg>`;
 }
}
