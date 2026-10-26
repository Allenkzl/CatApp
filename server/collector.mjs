import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile,rename,chmod} from 'node:fs/promises';
import path from 'node:path';
export class Collector {
 constructor(store,root){this.store=store;this.root=root;this.state={state:'not_started',online:false};this.child=null;this.timer=null;this.stopping=false;this.config={};}
 async load(){try{this.config=JSON.parse(await readFile(path.join(this.store.dataDir,'collector-config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 async save(){const f=path.join(this.store.dataDir,'collector-config.json');await writeFile(f+'.tmp',JSON.stringify(this.config),{mode:0o600});await chmod(f+'.tmp',0o600);await rename(f+'.tmp',f);}
 async configure(input){
  if(!input||!['start','stop'].includes(input.action)){const e=new Error('Invalid collector action');e.statusCode=400;throw e;}
  if(input.action==='stop'){await this.stop();this.config.enabled=false;await this.save();return this.snapshot();}
  if(!/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(input.host||'')||!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(input.user||'')||typeof input.password!=='string'||input.password.length>200){const e=new Error('Invalid camera connection settings');e.statusCode=400;throw e;}
  await this.stop();
  this.config={host:input.host,user:input.user,password:input.password||(input.host===this.config.host&&input.user===this.config.user?this.config.password:''),enabled:true};await this.save();await this.start();return this.snapshot();
 }
 async start(){
  if(this.child)return;
  const host=process.env.CAT_CAMERA_HOST||(this.config.enabled?this.config.host:'');if(!host)return;
  this.stopping=false;
  await mkdir(this.store.inputRoot,{recursive:true});
  const pointer=path.join(this.store.dataDir,'collector-session.json');let session;
  try{session=JSON.parse(await readFile(pointer,'utf8')).session;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(session&&!/^cats-[a-zA-Z0-9-]+$/.test(session))throw new Error('Invalid collector session');
  if(!session){session='cats-continuous-'+Date.now();await writeFile(pointer+'.tmp',JSON.stringify({session}));await rename(pointer+'.tmp',pointer);}
  this.session=session;let reconnects=0;
  const launch=()=>{
   if(this.stopping)return;
   this.state={state:'connecting',online:false};
   const args=[path.join(this.root,'scripts/recamera/collect_to_desktop.py'),'--host',host,'--user',process.env.CAT_CAMERA_USER||this.config.user||'reCamera','--camera-id',process.env.CAT_CAMERA_ID||'recamera-default','--resume',path.join(this.store.inputRoot,session),'--continuous','--periodic',process.env.CAT_CAPTURE_INTERVAL||'30'];
   const env={...process.env};if(this.config.password)env.SSHPASS=this.config.password;
   const child=spawn(process.env.CAT_PYTHON||'python3',args,{stdio:['ignore','pipe','ignore'],env});this.child=child;let pending='';
   child.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const event=JSON.parse(line);this.state={state:event.state,online:['watching','waiting_for_cat','collecting'].includes(event.state),updatedAt:new Date().toISOString(),saved:event.saved};if(this.state.online)reconnects=0;}catch{}}});
   child.on('error',()=>{this.state={state:'launch_failed',online:false};});
   child.on('close',()=>{
    if(this.child===child)this.child=null;
    if(this.stopping){this.state={...this.state,state:'stopped',online:false};return;}
    if(['connection_failed','launch_failed'].includes(this.state.state)||++reconnects>5){this.state={...this.state,state:'connection_failed',online:false};return;}
    this.state={...this.state,state:'reconnecting',online:false};this.timer=setTimeout(launch,5000);
   });
  };launch();
 }
 snapshot(){return {...this.state,host:this.config.host||process.env.CAT_CAMERA_HOST||'',user:this.config.user||'reCamera',configured:!!this.config.host,session:this.session,online:!!this.state.online&&Date.now()-Date.parse(this.state.updatedAt)<15000};}
 async stop(){this.stopping=true;clearTimeout(this.timer);const child=this.child;if(!child)return;await new Promise(resolve=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);child.once('close',()=>{clearTimeout(timeout);resolve();});child.kill('SIGTERM');});}
}
