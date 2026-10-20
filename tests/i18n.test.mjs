import test from 'node:test';
import assert from 'node:assert/strict';
import {htmlFor, translate, demoText, originalField, workTitle, setLanguage} from '../src/i18n.js';

test('template localization preserves interpolated user content and private paths verbatim',()=>{
 const raw='阳台猫观察室 /Users/猫咪/照片/入口.jpg';
 const rendered=htmlFor('en')`<p>观测记录</p><span>${raw}</span>`;
 assert.equal(rendered,`<p>Observations</p><span>${raw}</span>`);
 assert.equal(translate('THE DAILY CAT DIARY','zh'),'每日猫咪日记');
});
test('saving unchanged localized seed fields keeps canonical data, while custom fields remain original',()=>{
 setLanguage('en');
 const cat={name:'橘子',tag:'阳台巡逻员'};
 assert.equal(demoText(cat.name),'Mikan');
 assert.equal(originalField(cat,'name','Mikan'),'橘子');
 assert.equal(originalField(cat,'name','我家的猫'),'我家的猫');
 assert.equal(demoText('工作台'),'工作台');
 setLanguage('zh');
 assert.equal(demoText(cat.name),'橘子');
});
test('daily titles translate deterministically without mutating persisted work metadata',()=>{
 const work={title:'每日漫画 · 2026.10.20 / 第 2 篇'};
 assert.equal(workTitle(work,'en'),'Daily photo story · 2026.10.20 / No. 2');
 assert.equal(workTitle(work,'zh'),'每日漫画 · 2026.10.20 / 第 2 篇');
 assert.equal(workTitle({title:'我写的标题'},'en'),'我写的标题');
});
