import {isSummary} from './daily-summary.mjs';
import {readFile,writeFile,rename,mkdir,chmod,stat} from 'node:fs/promises';
import path from 'node:path';
export const SEEDREAM_MODEL='doubao-seedream-5-0-pro-260628';
export function comicPrompt(work){
 const s=work.story;const daily=isSummary(work);
 return `Create ONE finished English comic page, ${daily?'portrait 3:4 with two columns':'landscape 16:9'}, exactly ${s.panels.length} large panels read left-to-right${daily?`, then top-to-bottom in ${Math.ceil(s.panels.length/2)} rows (last panel may span both columns if needed)`:s.panels.length>3?', then top-to-bottom in two rows':''}. Image 1 is STYLE ONLY: warm watercolor/gouache, cream textured paper, brown rounded ink borders, soft sunlight, detailed expressive cat fur. Other images are source photos: use the visible cat in each source photo for markings and pose (if a phone screen is photographed, use the cat on that screen), omit phone, hands, people, office, timestamps, detection boxes and all UI. Use a cozy home setting and keep the cat's appearance consistent. Actions and story must follow the panel list, not the style sample. Give all panels generous space, large high-contrast English lettering and short clear speech bubbles away from faces. No Chinese text, no extra panels, no inset panels. Number the panels sequentially from 1 exactly once, without duplicate numbers or repeated scenes. For the portrait page use ONLY the stated two-column grid, never three columns. Title exactly: "${s.title}". ${s.panels.map((p,i)=>`Panel ${i+1}, source photoId ${p.photoId}: heading "${p.caption}"; speech bubble "${p.dialogue}".`).join(' ')} Footer exactly: "A fictional story inspired by snapshots." Story summary: ${s.summary}. Return the complete illustrated page; do not describe it in text.`;
}
export class Seedream {
 constructor(store,{fetchImpl=fetch}={}){this.store=store;this.fetch=fetchImpl;this.config={model:process.env.SEEDREAM_MODEL||SEEDREAM_MODEL,apiKey:process.env.SEEDREAM_API_KEY||''};this.root=new URL('../',import.meta.url);}
 async init(){try{this.config={...this.config,...JSON.parse(await readFile(path.join(this.store.dataDir,'seedream-config.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw new Error('Unable to read drawing configuration');}if(process.env.SEEDREAM_API_KEY)this.config.apiKey=process.env.SEEDREAM_API_KEY;if(process.env.SEEDREAM_MODEL)this.config.model=process.env.SEEDREAM_MODEL;return this;}
 snapshot(){return {drawingConfigured:!!this.config.apiKey,drawingProvider:'seedream',drawingModel:this.config.model,drawingStatus:this.config.apiKey?'configured':'awaiting_provider'};}
 async configure(input){
  if(typeof input?.apiKey!=='string'||input.apiKey.length>300||(!input.apiKey&&!this.config.apiKey)||/\s/.test(input.apiKey)||!/^(doubao-seedream-[a-z0-9-]{3,100}|ep-[a-zA-Z0-9-]{3,100})$/.test(input.model||SEEDREAM_MODEL)){const e=new Error('Invalid Seedream key or model ID');e.statusCode=400;throw e;}
  const next={apiKey:input.apiKey||this.config.apiKey,model:input.model||SEEDREAM_MODEL},file=path.join(this.store.dataDir,'seedream-config.json');
  await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await chmod(file+'.tmp',0o600);await rename(file+'.tmp',file);this.config=next;return this.snapshot();
 }
 async generate(work){
  if(!this.config.apiKey)throw new Error('Seedream is not configured');
  const prompt=comicPrompt(work),ids=[...new Set(work.story.panels.map(p=>p.photoId))];
  const images=['data:image/png;base64,'+(await readFile(new URL('public/comic-style-reference-en.png',this.root))).toString('base64')];
  for(const id of ids){if(!work.photoIds.includes(id))throw new Error('Invalid source photo');images.push('data:image/jpeg;base64,'+(await readFile(await this.store.photoFile(id))).toString('base64'));}
  const sourceMap=ids.map((id,i)=>`Input image ${i+2} = photoId ${id}.`).join(' ');
  const payload={model:this.config.model,prompt:prompt+' '+sourceMap,image:images,size:isSummary(work)?'1728x2304':'2560x1440',response_format:'b64_json',output_format:'png',stream:false,watermark:false};
  const dir=path.join(this.store.dataDir,'jobs',work.id);
  try{const metadata=JSON.parse(await readFile(path.join(dir,'seedream-publication.json'),'utf8'));if(metadata.prompt===payload.prompt&&metadata.model===this.config.model&&JSON.stringify(metadata.photoIds)===JSON.stringify(work.photoIds))return {imageBase64:(await readFile(path.join(dir,'seedream-result.png'))).toString('base64'),metadata};}catch(e){if(e.code!=='ENOENT')throw new Error('Saved drawing output needs inspection before retry');try{await stat(path.join(dir,'seedream-result.png'));throw new Error('Saved drawing output needs inspection before retry');}catch(saved){if(saved.code!=='ENOENT')throw saved;}}
  const response=await this.fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations',{method:'POST',headers:{Authorization:'Bearer '+this.config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(180000),redirect:'error'});
  if(!response.ok){let code='';try{const r=await response.json();if(/^[A-Za-z0-9_.-]{1,100}$/.test(r.error?.code||''))code=r.error.code;}catch{}const e=new Error(`Seedream request failed (HTTP ${response.status}${code?', '+code:''})`);throw e;}
  const result=await response.json(),data=result.data?.[0];
  if(!data?.b64_json)throw new Error('Seedream did not return PNG image data');
  const metadata={...work.story,prompt:payload.prompt,reviewed:false,generationMode:'seedream-api',model:this.config.model,qualityStatus:'unreviewed'};
  // Retain the paid output before publication, so a save error never forces a new API call.
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'seedream-result.png'),Buffer.from(data.b64_json,'base64'));
  await writeFile(path.join(dir,'seedream-publication.json'),JSON.stringify(metadata,null,2));
  return {imageBase64:data.b64_json,metadata};
 }
}
