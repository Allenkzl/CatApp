import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
const digest=s=>createHash('sha256').update(String(s)).digest();
const equal=(a,b)=>timingSafeEqual(digest(a),digest(b));
export class Access {
 constructor(config){this.config=config;this.sessions=new Map();this.attempts=new Map();this.devices=[];this.activity=new Map();this.uploads=new Map();}
 async init(){
  try{const saved=JSON.parse(await readFile(path.join(this.config.dataDir,'devices.json'),'utf8'));if(!Array.isArray(saved))throw Error();this.devices=saved;}catch(e){if(e.code!=='ENOENT')throw new Error('Invalid device credential store');}
  if(process.env.CAT_DEVICE_TOKEN){const id=process.env.CAT_DEVICE_ID||'recamera-default';this.validateId(id);if(process.env.CAT_DEVICE_TOKEN.length<24||process.env.CAT_DEVICE_TOKEN.startsWith('REPLACE_'))throw new Error('Device token must be at least 24 characters');if(!this.devices.some(d=>d.id===id))this.devices.push({id,tokenHash:digest(process.env.CAT_DEVICE_TOKEN).toString('hex')});}
  return this;
 }
 validateId(id){if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)){const e=new Error('Invalid device ID');e.statusCode=400;throw e;}}
 async register(id){this.validateId(id);const token=randomBytes(32).toString('hex'),next=[...this.devices.filter(d=>d.id!==id),{id,tokenHash:digest(token).toString('hex')}],f=path.join(this.config.dataDir,'devices.json');await writeFile(f+'.tmp',JSON.stringify(next),{mode:0o600});await chmod(f+'.tmp',0o600);await rename(f+'.tmp',f);this.devices=next;return {deviceId:id,token};}
 authorized(req){if(!this.config.server)return true;const match=(req.headers.cookie||'').match(/(?:^|;\s*)catapp_session=([a-f0-9]{64})(?:;|$)/);const until=match&&this.sessions.get(match[1]);return !!until&&until>Date.now();}
 login(req,user,password){const key=req.socket.remoteAddress||'unknown',now=Date.now();let window=this.attempts.get(key);if(!window||now-window.since>600000){window={since:now,count:0};this.attempts.set(key,window);}if(window.count>=10)return {status:429};window.count++;
  if(!equal(user,this.config.adminUser)||!equal(password,this.config.adminPassword))return {status:401};
  this.attempts.delete(key);for(const [id,until]of this.sessions)if(until<now)this.sessions.delete(id);if(this.sessions.size>=1000)this.sessions.delete(this.sessions.keys().next().value);const token=randomBytes(32).toString('hex');this.sessions.set(token,now+8*3600000);return {status:200,cookie:`catapp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${this.config.secure?'; Secure':''}`};
 }
 logout(req){const match=(req.headers.cookie||'').match(/catapp_session=([a-f0-9]{64})/);if(match)this.sessions.delete(match[1]);return `catapp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.config.secure?'; Secure':''}`;}
 device(req){const token=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{24,200})$/)?.[1];if(!token)return null;const key=digest(token).toString('hex');return this.devices.find(d=>equal(d.tokenHash,key))||null;}
 allowUpload(device){const now=Date.now();let value=this.uploads.get(device.id);if(!value||now-value.since>60000){value={since:now,count:0};this.uploads.set(device.id,value);}return ++value.count<=60;}
 heartbeat(device,state='watching'){this.activity.set(device.id,{state,updatedAt:new Date().toISOString()});}
 snapshot(){return this.devices.map(d=>{const live=this.activity.get(d.id);return {id:d.id,state:live?.state||'waiting',updatedAt:live?.updatedAt||null,online:!!live&&Date.now()-Date.parse(live.updatedAt)<30000};});}
}
