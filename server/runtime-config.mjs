import path from 'node:path';
import os from 'node:os';
export function runtimeConfig(root,env=process.env){
 const mode=env.CAT_MODE||'local';if(!['local','server'].includes(mode))throw new Error('CAT_MODE must be local or server');
 if(env.CAT_REQUIRE_LOGIN!==undefined&&!['true','false'].includes(env.CAT_REQUIRE_LOGIN))throw new Error('CAT_REQUIRE_LOGIN must be true or false');
 const requireLogin=mode==='server'&&env.CAT_REQUIRE_LOGIN==='true';
 const server=mode==='server',host=env.HOST||(server?'0.0.0.0':'127.0.0.1'),port=Number(env.PORT||4173);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 let origin=null;if(env.CAT_PUBLIC_URL){const u=new URL(env.CAT_PUBLIC_URL);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('CAT_PUBLIC_URL must be an HTTP origin without path');origin=u.origin;}
 if(server&&!origin)throw new Error('CAT_PUBLIC_URL is required in server mode');
 if(requireLogin&&(!env.CAT_ADMIN_PASSWORD||env.CAT_ADMIN_PASSWORD.length<12||env.CAT_ADMIN_PASSWORD.startsWith('REPLACE_')))throw new Error('Server mode requires CAT_ADMIN_PASSWORD of at least 12 characters');
 return {mode,server,requireLogin,host,port,origin,secure:origin?.startsWith('https:'),adminUser:env.CAT_ADMIN_USER||'admin',adminPassword:env.CAT_ADMIN_PASSWORD||'',dataDir:path.resolve(env.CAT_DATA_DIR||path.join(root,'.data')),inputRoot:server?null:env.CAT_CAPTURE_DIR||path.join(os.homedir(),'Desktop','reCamera猫观察')};
}
