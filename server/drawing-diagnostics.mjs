// Store only bounded, structured diagnostics. Never persist raw errors, headers,
// provider bodies, prompts, image data, credentials or local filesystem paths.
export const safeRequestId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&!v.startsWith('sk-')&&!v.startsWith('ark-')?v:null;
const knownCodes=new Set(['UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ENOENT','EACCES','EPERM','ENOSPC','EROFS','SEEDREAM_NO_IMAGE']);
export function drawingFailure(error,stage){
 let code=null,at=error;for(let n=0;n<4&&at;n++,at=at.cause)if(knownCodes.has(at.code)){code=at.code;break;}
 const http=/^Seedream request failed \(HTTP (\d{3})(?:, ([A-Za-z0-9_.-]{1,100}))?\)$/.exec(error?.message||'');
 let message;
 if(http)message=`Seedream rejected the request (HTTP ${http[1]}${http[2]?', '+http[2]:''}).`;
 else if(code==='UND_ERR_HEADERS_TIMEOUT')message='The Node HTTP client timed out waiting for Seedream response headers (UND_ERR_HEADERS_TIMEOUT). The 10-minute application timeout does not override this network timeout.';
 else if(code==='UND_ERR_BODY_TIMEOUT')message='The Node HTTP client timed out while receiving the Seedream image (UND_ERR_BODY_TIMEOUT).';
 else if(code)message=`Drawing failed at ${stage} (${code}).`;
 else if(error?.name==='TimeoutError')message='Seedream timed out after 10 minutes. Story is saved; confirm provider billing before retrying.';
 else if(error?.name==='SyntaxError'&&['provider_response','decoding_response'].includes(stage))message='Seedream response was not valid JSON.';
 else if(stage==='checking_cache')message='Saved drawing output is incomplete or unreadable. Inspect the cache before requesting another paid image.';
 else if(stage==='publishing'&&publicationFailure(error))message='Publication validation failed: '+publicationFailure(error);
 else if(stage==='publishing')message='The drawing reached publication but could not be published. Inspect the saved image and metadata; do not request another paid image yet.';
 else message=`Drawing failed at ${stage}. Check the read-only drawing diagnostics before retrying.`;
 return {stage,code:code||(error?.name==='TimeoutError'?'APPLICATION_TIMEOUT':null),...(http?{httpStatus:Number(http[1]),providerCode:http[2]||null}:{}),message};
}

export function publicationFailure(error){const message=error?.message||'';return /^(English, reviewed, fictional-story metadata is required|Source photos must exactly match this batch, in order|Panel count exceeds this work target|Panel source photo does not match its position|(?:Title|Summary|Caption|Dialogue|Observation|Uncertainty|Generation prompt|Model) must be nonempty English text|PNG image data is required \(maximum 24 MB\)|A complete PNG is required|PNG dimensions are unsupported)$/.test(message)?message:null;}
