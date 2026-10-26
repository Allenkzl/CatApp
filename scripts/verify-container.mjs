// Requires a running Docker Engine and an already built image. Uses no paid APIs.
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const image=process.argv[2]||'catapp:deploy-candidate';
function docker(...args){return execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
try{docker('info','--format','{{.ServerVersion}}');}catch{console.error('Docker Engine unavailable. Install/start Docker, build the image, then rerun this check.');process.exit(1);}
const id=randomBytes(6).toString('hex'),name='catapp-smoke-'+id,volume=name+'-data';
const temp=await mkdtemp(path.join(os.tmpdir(),'catapp-container-')),password=randomBytes(24).toString('hex');
let created=false,volumeCreated=false,base;
const host={Host:'catapp-smoke.invalid'};
async function start(){
 docker('run','-d','--name',name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--env-file',path.join(temp,'env'),'-p','127.0.0.1::4173','--mount','type=volume,src='+volume+',dst=/app/data',image);created=true;
 base='http://'+docker('port',name,'4173/tcp').split('\n')[0];
 for(let i=0;i<60;i++){
  try{if((await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error('Container did not become healthy');
}
async function login(){const r=await fetch(base+'/login',{method:'POST',headers:host,body:new URLSearchParams({username:'admin',password}),redirect:'manual'});assert.equal(r.status,303);return {...host,Cookie:r.headers.get('set-cookie').split(';')[0]};}
async function snapshot(auth){return (await fetch(base+'/api/capture',{headers:auth})).json();}
try{
 await writeFile(path.join(temp,'env'),`CAT_MODE=server\nCAT_REQUIRE_LOGIN=true\nCAT_PUBLIC_URL=http://catapp-smoke.invalid\nCAT_ADMIN_PASSWORD=${password}\nCAT_AUTO_GENERATE=false\nDEEPSEEK_API_KEY=\nSEEDREAM_API_KEY=\n`,{mode:0o600});
 docker('volume','create',volume);volumeCreated=true;await start();
 assert.equal(docker('exec',name,'id','-u'),'1000');
 assert.equal((await fetch(base+'/api/capture',{headers:host})).status,401);
 const auth=await login(),response=await fetch(base+'/api/devices',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({deviceId:'smoke-camera'})});assert.equal(response.status,201);
 const {token}=await response.json(),photo=await readFile(new URL('../public/mikan.jpg',import.meta.url));
 const uploadHeaders={...host,Authorization:'Bearer '+token,'Content-Type':'image/jpeg'};
 async function upload(i){return fetch(base+'/api/device/photos',{method:'POST',headers:{...uploadHeaders,'X-Catapp-Photo-Id':'smoke-'+i,'X-Catapp-Captured-At':`2026-10-21T10:0${i}:00+08:00`},body:photo});}
 for(let i=0;i<3;i++)assert.equal((await upload(i)).status,201);
 assert.equal((await upload(0)).status,200);
 let s=await snapshot(auth);assert.equal(s.photos.length,3);assert.equal(s.works.length,1);assert.equal(s.works[0].status,'ready_for_generation');
 assert.equal((await fetch(base+'/api/capture/photos/'+s.photos[0].id+'.jpg',{headers:host,redirect:'manual'})).status,401);
 assert.equal((await fetch(base+'/.data/secrets.json',{headers:auth})).status,403);
 docker('stop','-t','10',name);docker('rm',name);created=false;
 await start();const restoredAuth=await login();s=await snapshot(restoredAuth);assert.equal(s.photos.length,3);assert.equal(s.works.length,1);
 assert.equal((await upload(0)).status,200);assert.equal((await snapshot(restoredAuth)).photos.length,3);
 docker('stop','-t','10',name);docker('rm',name);created=false;
 await writeFile(path.join(temp,'env'),'CAT_MODE=server\nCAT_PUBLIC_URL=http://catapp-smoke.invalid\nCAT_AUTO_GENERATE=false\nDEEPSEEK_API_KEY=\nSEEDREAM_API_KEY=\n',{mode:0o600});await start();
 const open=await fetch(base+'/api/capture',{headers:host});assert.equal(open.status,200);const state=await open.json();assert.equal(state.requireLogin,false);assert.equal(state.photos.length,3);
 const noLogin=await fetch(base+'/login',{headers:host,redirect:'manual'});assert.equal(noLogin.status,303);assert.equal(noLogin.headers.get('location'),'/');assert.equal((await fetch(base+'/',{headers:host})).status,200);
 assert.equal((await fetch(base+'/api/device/photos',{method:'POST',headers:host})).status,401);
 console.log('PASS: non-root/read-only container, default direct access and explicit login, device registration, 3 uploads, grouping, duplicate ACK, private media, container replacement with persistent data and device credentials. No paid API calls.');
}catch(error){console.error('FAIL:',error.message);process.exitCode=1;}
finally{
 try{if(created)docker('rm','-f',name);}catch{console.error('Cleanup needed: '+name);}
 try{if(volumeCreated)docker('volume','rm',volume);}catch{console.error('Cleanup needed: '+volume);}
 await rm(temp,{recursive:true,force:true});
}
