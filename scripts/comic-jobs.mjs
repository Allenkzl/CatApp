import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),command=args.shift()||'pending',options={};
while(args.length){const key=args.shift();if(!key.startsWith('--')||!args.length)throw new Error('Use --option value');options[key.slice(2)]=args.shift();}
const base=new URL(options.url||process.env.CATAPP_URL||'http://127.0.0.1:4173');
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Comic jobs connect only to the local website');
async function request(route,input){const response=await fetch(new URL(route,base),input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;}
const snapshot=await request('/api/capture');
const work=snapshot.works.find(w=>w.id===options.id);
if(command==='pending'){
 console.log(JSON.stringify(snapshot.works.filter(w=>w.status!=='completed').map(w=>({id:w.id,date:w.date,session:w.session,status:w.status,hasPreviousArtwork:!!w.artwork,photoIds:w.photoIds})),null,2));
}else{
 if(!work)throw new Error('Provide a valid --id from the pending list');
 if(command==='prepare'){
  const root=fileURLToPath(new URL('../',import.meta.url)),output=path.resolve(options.out||path.join(root,'.data','jobs',work.id));await mkdir(output,{recursive:true});
  const photos=[];
  for(const [i,id] of work.photoIds.entries()){const photo=snapshot.photos.find(p=>p.id===id),response=await fetch(new URL(photo.url,base));if(!response.ok)throw new Error('Source photo unavailable');const file=path.join(output,String(i+1).padStart(2,'0')+'_source.jpg');await writeFile(file,Buffer.from(await response.arrayBuffer()));photos.push({...photo,referencePath:file});}
  const job={id:work.id,session:work.session,date:work.date,photoIds:work.photoIds,story:work.story||null,photos,styleReference:path.join(root,'public','comic-style-reference-en.png'),generationMode:'assistant-imagegen',instructions:'Read all actual source photos. Write evidence and uncertainty separately from fictional captions. Generate one to six warm storybook panels with English-only text. Do not reuse the sample actions for new batches unless visibly supported. Inspect image and text before publishing.'};
  await writeFile(path.join(output,'job.json'),JSON.stringify(job,null,2));console.log(JSON.stringify(job,null,2));
 }else if(command==='start'||command==='fail'||command==='retry'){
  const status={start:'generating',fail:'failed',retry:'ready_for_generation'}[command];
  const updated=await request('/api/capture/works/'+work.id+'/generation',{status,...(command==='fail'?{error:options.error||'Image generation did not complete.'}:{})});console.log(JSON.stringify(updated.works.find(w=>w.id===work.id),null,2));
 }else if(command==='publish'){
  if(!options.image||!options.metadata)throw new Error('Publish requires --image PNG and --metadata JSON');
  const image=await readFile(path.resolve(options.image)),metadata=JSON.parse(await readFile(path.resolve(options.metadata),'utf8'));
  const updated=await request('/api/capture/works/'+work.id+'/publish',{imageBase64:image.toString('base64'),metadata});
  console.log(JSON.stringify(updated.works.find(w=>w.id===work.id),null,2));
 }else throw new Error('Commands: pending, prepare, start, publish, fail, retry');
}
