import https from 'node:https';import {lookup} from 'node:dns/promises';import {getDefaultAutoSelectFamily} from 'node:net';
import {safeRequestId} from './drawing-diagnostics.mjs';
const HOST='ark.cn-beijing.volces.com';
const CODES=new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','PROBE_RESPONSE_TOO_LARGE']);
const errorCode=e=>CODES.has(e?.code)?e.code:e?.name==='TimeoutError'?'PROBE_TIMEOUT':'NETWORK_ERROR';
export class ArkNetworkCheck {
 constructor(config,{requestImpl=https.request,lookupImpl=lookup,timeoutMs=10000,env=process.env}={}){this.config=config;this.request=requestImpl;this.lookup=lookupImpl;this.timeoutMs=timeoutMs;this.env=env;this.running=null;this.last=null;}
 probe(method,pathname,family,authenticate){
  const started=Date.now(),config=this.config(),result={method,endpoint:pathname,family:family||'auto',timings:{},authenticated:authenticate};
  if(authenticate&&!config.apiKey)return Promise.resolve({...result,skipped:'provider_not_configured'});
  const signal=AbortSignal.timeout(this.timeoutMs);
  return new Promise(resolve=>{
   let done=false;const finish=extra=>{if(done)return;done=true;resolve({...result,...extra,elapsedMs:Date.now()-started});};
   const req=this.request(new URL('https://'+HOST+'/api/v3/'+pathname),{method,family,agent:false,timeout:0,signal,headers:{Accept:'application/json',...(authenticate?{Authorization:'Bearer '+config.apiKey}:{})}},res=>{
    result.timings.responseHeadersMs=Date.now()-started;result.httpStatus=res.statusCode;result.requestId=safeRequestId(res.headers['x-request-id']||res.headers['x-tt-logid']);
    let size=0;const chunks=[];
    res.on('data',b=>{size+=b.length;if(size>2*1024*1024){const e=Object.assign(new Error('Probe response too large'),{code:'PROBE_RESPONSE_TOO_LARGE'});finish({errorCode:e.code});res.destroy();req.destroy();return;}chunks.push(b);});
    res.once('end',()=>{let extra={};if(method==='GET'){try{const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(Array.isArray(json.data)){extra.modelCount=json.data.length;extra.configuredModelListed=json.data.some(m=>m.id===config.model);}const code=json.error?.code;if(typeof code==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(code)&&!code.startsWith('sk-')&&!code.startsWith('ark-'))extra.providerErrorCode=code;}catch{extra.responseFormat='non_json';}}finish({...extra,responseBytes:size});});
    res.once('error',e=>finish({errorCode:signal.aborted?'PROBE_TIMEOUT':errorCode(e)}));res.once('aborted',()=>finish({errorCode:signal.aborted?'PROBE_TIMEOUT':'ECONNRESET'}));
   });
   req.once('socket',socket=>{socket.once('lookup',()=>{result.timings.dnsMs=Date.now()-started;});socket.once('connect',()=>{result.timings.tcpMs=Date.now()-started;result.remoteFamily=socket.remoteFamily;});socket.once('secureConnect',()=>{result.timings.tlsMs=Date.now()-started;result.tlsAuthorized=socket.authorized===true;});});
   req.once('finish',()=>{result.timings.requestWrittenMs=Date.now()-started;});req.once('error',e=>finish({errorCode:signal.aborted?'PROBE_TIMEOUT':errorCode(e)}));req.end();
  });
 }
 run(){
  if(this.running)return this.running;
  if(this.last&&Date.now()-this.last.finishedMs<60000)return Promise.resolve({...this.last.report,cached:true});
  this.running=this.inspect().then(report=>{this.last={report,finishedMs:Date.now()};return report;}).finally(()=>this.running=null);return this.running;
 }
 async inspect(){
  const started=Date.now();let dns,timer;
  try{const addresses=await Promise.race([this.lookup(HOST,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DOMException('DNS timeout','TimeoutError')),3000);})]);dns={ok:true,ipv4Count:addresses.filter(a=>a.family===4).length,ipv6Count:addresses.filter(a=>a.family===6).length,elapsedMs:Date.now()-started};}catch(e){dns={ok:false,errorCode:errorCode(e),elapsedMs:Date.now()-started};}finally{clearTimeout(timer);}
  const checks=[];checks.push(await this.probe('GET','models',undefined,true));checks.push(await this.probe('GET','models',4,true));checks.push(await this.probe('HEAD','images/generations',4,false));if(dns.ipv6Count)checks.push(await this.probe('HEAD','images/generations',6,false));
  const config=this.config(),e=this.env;return {version:1,checkedAt:new Date().toISOString(),host:HOST,model:config.model,providerConfigured:!!config.apiKey,modelCalls:0,elapsedMs:Date.now()-started,dns,checks,environment:{httpProxyConfigured:!!(e.HTTP_PROXY||e.http_proxy),httpsProxyConfigured:!!(e.HTTPS_PROXY||e.https_proxy),allProxyConfigured:!!(e.ALL_PROXY||e.all_proxy),noProxyConfigured:!!(e.NO_PROXY||e.no_proxy),nodeUseEnvProxy:e.NODE_USE_ENV_PROXY==='1',nativeTransportUsesProxy:false,autoSelectFamily:getDefaultAutoSelectFamily()},runtime:{node:process.version,undici:process.versions.undici||null}};
 }
}
