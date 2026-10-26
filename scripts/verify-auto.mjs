import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';import {once} from 'node:events';import path from 'node:path';import os from 'node:os';
import {CaptureStore} from '../server/capture-store.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/allen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=await mkdtemp(path.join(os.tmpdir(),'catapp-auto-browser-')),input=path.join(root,'input'),data=path.join(root,'data');await mkdir(path.join(input,'cats-browser'),{recursive:true});
const fixture=await readFile(new URL('../public/mikan.jpg',import.meta.url));const records=[];
for(let i=0;i<2;i++){const file=path.join(input,'cats-browser',i+'.jpg');await writeFile(file,fixture);records.push({local_path:file,captured_at:`2026-10-20T09:0${i}:00+08:00`});}await writeFile(path.join(input,'cats-browser','photos.json'),JSON.stringify(records));
const store=await new CaptureStore({inputRoot:input,dataDir:data}).init();
const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4189',CAT_CAPTURE_DIR:input,CAT_DATA_DIR:data,CAT_CAMERA_HOST:'',DEEPSEEK_API_KEY:''},stdio:['ignore','pipe','pipe']});let browser;
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server failed');})]);
 const base='http://localhost:4189';browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#settings');await page.waitForSelector('#automation-form');await page.locator('#automation-form input').fill('5');await page.locator('#automation-form button').click();await page.waitForTimeout(300);
 let snapshot=await(await fetch(base+'/api/capture')).json();assert.equal(snapshot.settings.batchPhotoCount,5);assert.equal(snapshot.pending[0].target,3);
 await page.locator('[data-action="set-language"][data-language="en"]').click();await page.waitForSelector('text=Automatic diary settings');assert.equal(await page.locator('#api-key-form input').getAttribute('type'),'password');
 assert.equal((await fetch(base+'/api/settings',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({batchPhotoCount:1})})).status,403);
 assert.equal((await fetch(base+'/.data/secrets.json')).status,403);
 // Complete the frozen three-photo group, leaving the new five-photo target for the next one.
 const file=path.join(input,'cats-browser','2.jpg');await writeFile(file,fixture);records.push({local_path:file,captured_at:'2026-10-20T09:02:00+08:00'});await writeFile(path.join(input,'cats-browser','photos.json'),JSON.stringify(records));await fetch(base+'/api/capture/sync',{method:'POST'});
 await page.goto(base+'/#library');await page.waitForSelector('[data-work-status="ready_for_generation"]');assert.equal(await page.locator('[data-action="capture-export"]').count(),0);
 await page.locator('[data-action="capture-work"]').first().click();await page.waitForSelector('.modal');assert.ok((await page.locator('.modal').innerText()).includes('Illustration API will be configured later'));
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/auto-library-desktop.png',fullPage:true});await page.locator('[data-action="close-modal"]').first().click();await page.setViewportSize({width:390,height:844});await page.goto(base+'/#settings');await page.waitForSelector('#automation-form');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:'artifacts/auto-settings-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: settings persistence, frozen target, bilingual settings, password field, source import, honest pending library, CSRF, private-file denial, mobile layout and no browser errors');
}finally{await browser?.close();child.kill('SIGTERM');await once(child,'exit');await rm(root,{recursive:true,force:true});}
