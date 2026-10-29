import http from 'node:http';
import https from 'node:https';

// Drawing can take longer than fetch/Undici's 300-second response-header limit.
// Use native HTTP(S), with one caller-owned deadline covering headers AND body.
// Never follow redirects or retry a possibly billed request.
export function drawingFetch(url,{method='POST',headers={},body,signal,maxResponseBytes=40*1024*1024}={}){
 const target=new URL(url);
 const requestHeaders={...headers};if(body!==undefined&&!Object.keys(requestHeaders).some(k=>k.toLowerCase()==='content-length'))requestHeaders['Content-Length']=Buffer.byteLength(body);
 if(!['https:','http:'].includes(target.protocol))throw new Error('Unsupported drawing protocol');
 if(!signal)throw new Error('A drawing deadline is required');
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  let rejectBody;const started=Date.now(),transport={requestBytes:body===undefined?0:Buffer.byteLength(body),uploadComplete:false};
  const fail=error=>{const reason=signal.aborted?signal.reason:error;try{reason.drawingTransport={...transport,bytesWritten:req.socket?.bytesWritten||0,bufferedBytes:req.socket?.writableLength||0};}catch{}rejectBody?.(reason);reject(reason);};
  const req=(target.protocol==='https:'?https:http).request(target,{method,headers:requestHeaders,signal,agent:false,timeout:0},res=>{
   transport.responseHeadersMs=Date.now()-started;
   let size=0;const chunks=[];
   const content=new Promise((done,failed)=>{
    rejectBody=failed;
    const tooLarge=()=>{const error=new Error('Drawing response exceeds the size limit');error.code='DRAWING_RESPONSE_TOO_LARGE';fail(error);req.destroy(error);res.destroy(error);};
    res.on('data',chunk=>{size+=chunk.length;if(size>maxResponseBytes){tooLarge();return;}chunks.push(chunk);});
    res.once('end',()=>done(Buffer.concat(chunks).toString('utf8')));
    res.once('error',fail);
    res.once('aborted',()=>{const error=new Error('Drawing response was interrupted');error.code='ECONNRESET';fail(error);});
    if(Number(res.headers['content-length'])>maxResponseBytes)tooLarge();
   });
   // The caller may be saving its response-header checkpoint before reading JSON.
   // Keep early body errors handled without losing the rejection for json().
   content.catch(()=>{});
   resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:{get(name){const v=res.headers[name.toLowerCase()];return Array.isArray(v)?v.join(', '):v??null;}},json:async()=>JSON.parse(await content)});
  });
  req.once('socket',socket=>{socket.once('lookup',()=>transport.dnsMs=Date.now()-started);socket.once('connect',()=>{transport.tcpMs=Date.now()-started;transport.remoteFamily=socket.remoteFamily;});socket.once('secureConnect',()=>{transport.tlsMs=Date.now()-started;transport.tlsAuthorized=socket.authorized===true;});});
  req.once('finish',()=>{transport.uploadComplete=true;transport.uploadFinishedMs=Date.now()-started;});
  req.once('error',fail);
  req.end(body);
 });
}
