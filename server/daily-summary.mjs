import {createHash} from 'node:crypto';
export const DAILY_DEFAULTS={generationMode:'daily',dailyTime:'00:10',panelCount:8};
export function beijingDay(now=new Date()){return new Date(new Date(now).getTime()+8*3600000).toISOString().slice(0,10);}
export function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function dueAt(day,time='00:10'){return new Date(Date.parse(day+'T00:00:00+08:00')+86400000+Number(time.slice(0,2))*3600000+Number(time.slice(3))*60000);}
export function dailyPlan(photos,day,cameraId,panelCount=8){
 const all=photos.filter(p=>p.date===day&&(p.cameraId||'recamera-default')===cameraId).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id));
 const seen=new Set(),unique=all.filter(p=>{const key=p.contentHash||p.id;if(seen.has(key))return false;seen.add(key);return true;});
 // Stratified time sampling bounds API size while retaining the first/last moments.
 const count=Math.min(18,unique.length),samples=[];
 const remaining=[...unique],first=Date.parse(unique[0]?.capturedAt),last=Date.parse(unique.at(-1)?.capturedAt);
 for(let i=0;i<count;i++){
  const target=count===1?first:first+i*(last-first)/(count-1);
  let best=0;for(let j=1;j<remaining.length;j++)if(Math.abs(Date.parse(remaining[j].capturedAt)-target)<Math.abs(Date.parse(remaining[best].capturedAt)-target))best=j;
  samples.push(remaining.splice(best,1)[0]);
 }
 samples.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id));
 return {date:day,cameraId,timeZone:'Asia/Shanghai',sourceCount:all.length,uniqueCount:unique.length,photoIds:samples.map(p=>p.id),allPhotoIds:all.map(p=>p.id),panelTarget:Math.min(panelCount,samples.length),firstSeen:all[0]?.capturedAt||null,lastSeen:all.at(-1)?.capturedAt||null,coverageNote:'Snapshots only; gaps are unknown. Camera grouping does not establish cat identity.'};
}
export const dailyId=(cameraId,day)=>createHash('sha256').update('daily/'+cameraId+'/'+day).digest('hex').slice(0,24);
