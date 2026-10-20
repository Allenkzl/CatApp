import {html, t} from './i18n.js';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = (name, size=20) => {
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    camera:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
    paw:'<ellipse cx="12" cy="16" rx="6" ry="4"/><ellipse cx="4" cy="10" rx="2" ry="3"/><ellipse cx="9" cy="5" rx="2" ry="3"/><ellipse cx="15" cy="5" rx="2" ry="3"/><ellipse cx="20" cy="10" rx="2" ry="3"/>',
    check:'<path d="m8 12 3 3 5-6"/><rect x="4" y="3" width="16" height="19" rx="3"/>',
    chart:'<path d="M4 3v17h17M8 15v-4m5 4V6m5 9V9"/>',
    spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4m-2-2h4"/>',
    book:'<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v16"/>',
    arrow:'<path d="M4 12h15m-5-5 5 5-5 5"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    down:'<path d="m7 9 5 5 5-5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    settings:'<path d="m12 2 3 3 4 1 1 4 2 2-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-2 1-4 4-1Z"/><circle cx="12" cy="12" r="3"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    play:'<path d="m9 5 10 7-10 7Z"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    leaf:'<path d="M20 3C4 1 0 15 7 19S23 16 20 3ZM5 21l10-12"/>',
    edit:'<path d="m15 4 5 5M4 16 16 4q2-2 4 0t0 4L8 20H4Z"/>',
    refresh:'<path d="M20 9A8 8 0 0 0 5 6L2 9m0-6v6h6M4 15a8 8 0 0 0 15 3l3-3m0 6v-6h-6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    folder:'<path d="M3 7V4h6l3 3h9v13H3Z"/>',
  };
  return html`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.paw}</svg>`;
};
function cat(x,y,scale=1,dark=false,pose=0) {
  const fur=dark?'#777d70':'#dea15d',stripe=dark?'#4a5149':'#bd7c40';
  return html`<g transform="translate(${x} ${y}) scale(${scale})" stroke="#554d40" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M34 61Q90 27 96 65q2 18-25 12" stroke="${stripe}" stroke-width="13" fill="none"/>
    <ellipse cx="21" cy="58" rx="35" ry="27" fill="${fur}"/>
    ${pose%3===1?'<path d="M-5 76H9m21 0h16" stroke-width="8"/>':'<path d="M-1 68v15m27-15v15" stroke-width="9"/>'}
    <path d="M-22 26-28-7-6 9Q5 3 17 9L37-7 33 26Q43 57 7 59-30 55-22 26Z" fill="${fur}"/>
    <path d="m-22 1 3 17 9-5m39-12-3 17-9-5" fill="#e8b6a0" stroke="none"/>
    <path d="M-6 12 0 22m8-11 1 11m10-10-5 12" stroke="${stripe}" stroke-width="4"/>
    ${pose%3===2?'<path d="m-12 34 8-2m17 0 8 2"/>':'<ellipse cx="-8" cy="33" rx="2" ry="3.5" fill="#474636"/><ellipse cx="20" cy="33" rx="2" ry="3.5" fill="#474636"/>'}
    <path d="m3 40 4 3 4-3Z" fill="#b5796f" stroke="none"/><path d="M7 43v4m0 0-5 2m5-2 5 2M-15 43l-18-3m18 9-18 1m58-7 18-3m-18 9 18 1" stroke-width="1.5"/>
    <path d="M-9 57q15 14 29 0" fill="#f6e9d2" stroke="none"/>
  </g>`;
}
export function balconyScene(mode=0, dark=false, palette=t('手账水彩')) {
  const bg=palette==='复古版画'?'#e6debf':palette==='清新线稿'?'#e8f0ea':'#f3e6c9';
  return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280" role="img" aria-label="模拟阳台猫咪插画"><defs><pattern id="grain${mode}" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".5" fill="#8b7858" opacity=".12"/></pattern></defs>
    <rect width="500" height="280" fill="${bg}"/><circle cx="403" cy="60" r="35" fill="#e6bf68" opacity=".55"/>
    <path d="M0 122H500M0 133H500M35 122v109m57-109v109m57-109v109m57-109v109m57-109v109m57-109v109m57-109v109m57-109v109m57-109v109" stroke="#788b75" stroke-width="5" opacity=".55"/>
    <path d="M0 231H500V280H0Z" fill="#dfcfb3"/><path d="M0 253H500M80 231 45 280m155-49-12 49m140-49 14 49m101-49 35 49" stroke="#bbae93" opacity=".6"/>
    <g fill="#647d58" stroke="#4f6849" stroke-width="2"><path d="M426 185v-81m0 44q-45-5-27-35 28 1 27 35m0-14q39 0 29-30-26 1-29 30m0-17q-25-19-8-35 20 8 8 35"/><path d="M404 184h47l-8 47h-31Z" fill="#bf8663"/></g>
    ${mode%4===0?'<ellipse cx="112" cy="241" rx="48" ry="9" fill="#a4a68e" opacity=".3"/>':mode%4===1?'<rect x="50" y="217" width="139" height="24" rx="12" fill="#90a398"/>':mode%4===2?'<path d="m89 218 12 22h47l11-22Z" fill="#70978c" stroke="#526f66" stroke-width="2"/><ellipse cx="124" cy="218" rx="35" ry="8" fill="#dedac4"/>':'<path d="M36 112h66v121H36Z" fill="#bba27e" opacity=".5"/>'}
    ${cat(mode%4===2?225:mode%4===1?160:235,mode%4===1?170:154, .85,dark,mode)}
    <rect width="500" height="280" fill="url(#grain${mode})"/>
    ${mode%2===0?'<path d="m329 76 6-12m4 19 13-4" fill="none" stroke="#b39155" stroke-width="3" stroke-linecap="round"/>':''}
  </svg>`;
}
export function mapArt() {
 return html`<svg viewBox="0 0 580 240" role="img" aria-label="模拟阳台区域示意，虚线路径为演示轨迹"><defs><pattern id="tiles" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" stroke="#dcded4" fill="none"/></pattern></defs><rect x="10" y="10" width="560" height="215" rx="12" fill="#f1f0e7" stroke="#d4d9cd"/><rect x="10" y="10" width="560" height="215" rx="12" fill="url(#tiles)"/><rect x="28" y="27" width="130" height="66" rx="10" fill="#e2e8d7"/><rect x="397" y="28" width="150" height="70" rx="10" fill="#e7e1ce"/><rect x="406" y="155" width="140" height="50" rx="9" fill="#e0e7df"/><path d="M35 222v-55h60v55" fill="#ddcbbb"/><g fill="#6f7a61"><circle cx="200" cy="38" r="12"/><circle cx="242" cy="38" r="12"/><circle cx="284" cy="38" r="12"/><circle cx="326" cy="38" r="12"/></g><g font-family="sans-serif" font-size="13" fill="#7b8172"><text x="66" y="66">休息区</text><text x="450" y="66">食盆区</text><text x="450" y="185">入口</text><text x="260" y="204">通 道</text></g><path d="M470 175C390 165 350 110 260 125S150 175 104 65" stroke="#ca9654" stroke-width="3" stroke-dasharray="6 6" fill="none"/><path d="M115 61C180 91 240 93 310 68S410 88 467 65" stroke="#688579" stroke-width="3" stroke-dasharray="6 6" fill="none"/><circle cx="260" cy="125" r="16" fill="#dba05c"/><circle cx="310" cy="68" r="16" fill="#6e897b"/><g fill="white" font-size="12" font-family="sans-serif" text-anchor="middle"><text x="260" y="130">橘</text><text x="310" y="73">芝</text></g></svg>`;
}
export function activityChart() {
 const a=[18,12,24,36,59,44,19,23,39,56,41,25], b=[8,13,16,24,35,23,12,37,48,28,19,13];
 return html`<svg class="activity-svg" viewBox="0 0 650 180" role="img" aria-label="模拟每小时活动分布图"><g stroke="#eceee7" stroke-dasharray="3 4">${[25,65,105,145].map(y=>html`<path d="M30 ${y}H640"/>`).join('')}</g><g fill="#9caa9b" font-size="10" font-family="sans-serif"><text x="2" y="28">${t('60 分钟')}</text><text x="2" y="108">${t('20 分钟')}</text>${a.map((_,i)=>html`<text x="${44+i*49}" y="173">${String(i+7).padStart(2,'0')}</text>`).join('')}</g>${a.map((v,i)=>html`<rect x="${42+i*49}" y="${145-v*1.7}" width="12" height="${v*1.7}" rx="3" fill="#d5a66b"/><rect x="${57+i*49}" y="${145-b[i]*1.7}" width="12" height="${b[i]*1.7}" rx="3" fill="#739385"/>`).join('')}</svg>`;
}
