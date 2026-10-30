export const DEMO_DATE = '2026-10-19';
export const defaults = () => ({
  version:2,
  cats:[
    {id:'xixi',name:'Xixi',tag:'阳台巡逻员',color:'#7d8fa0',image:'/public/xixi.jpg',credit:'Kikku33 / Wikimedia Commons (CC BY-SA 4.0)',creditUrl:'https://commons.wikimedia.org/wiki/File:A_stray_cat_relaxed_on_a_bench.jpg',features:'蓝白短毛，圆脸，琥珀色眼睛，胸口和爪子是白色',voice:'爱巡逻、爱探头，走路带风。',summary:'更活泼：白天多次沿通道和食盆区移动，喜欢巡视入口。'},
    {id:'didi',name:'Didi',tag:'慢生活观察家',color:'#63786e',image:'/public/sesame.jpg',credit:'Unsplash',features:'短毛虎斑，额头有深色条纹，身形紧凑',voice:'不慌不忙，喜欢在休息区看风景。',summary:'更慵懒：长时间停留在休息区，行动慢，露面较少。'}
  ],
  events:[
    {id:'EV-001',date:DEMO_DATE,time:'08:12',duration:6,cat:'xixi',action:'入口停留',zone:'入口',note:'Xixi 在入口附近停留，随后沿通道走开。',confirmed:true,confidence:96},
    {id:'EV-002',date:DEMO_DATE,time:'09:05',duration:12,cat:'didi',action:'静止休息',zone:'休息区',note:'Didi 在休息区保持低运动状态。',confirmed:true,confidence:94},
    {id:'EV-003',date:DEMO_DATE,time:'10:32',duration:4,cat:'xixi',action:'食盆区访问',zone:'食盆区',note:'Xixi 进入食盆区域，停留后离开。',confirmed:true,confidence:98},
    {id:'EV-004',date:DEMO_DATE,time:'10:38',duration:5,cat:'didi',action:'食盆区访问',zone:'食盆区',note:'Didi 在 Xixi 离开后进入食盆区域。',confirmed:true,confidence:93},
    {id:'EV-005',date:DEMO_DATE,time:'11:20',duration:8,cat:'xixi',action:'移动',zone:'通道',note:'Xixi 沿花盆旁的通道来回移动。',confirmed:true,confidence:91},
    {id:'EV-006',date:DEMO_DATE,time:'13:46',duration:18,cat:'didi',action:'静止休息',zone:'休息区',note:'背光造成身份不确定，需要人工核对。',confirmed:false,confidence:68},
    {id:'EV-007',date:DEMO_DATE,time:'14:08',duration:3,cat:'unknown',action:'入口停留',zone:'入口',note:'画面部分遮挡，暂时无法关联猫咪身份。',confirmed:false,confidence:54},
    {id:'EV-008',date:DEMO_DATE,time:'15:25',duration:7,cat:'xixi',action:'移动',zone:'通道',note:'两只猫交错经过，轨迹关联需要确认。',confirmed:false,confidence:73}
  ],
  uploads:[], library:[], settings:{site:'Seeed 办公室阳台',question:'Xixi 和 Didi，谁更爱在阳台巡逻？',minDuration:3},
  draft:{title:'阳台上的两种生活',style:'手账水彩',count:4,panels:[],approved:false},
});
export const ACTIONS = ['静止休息','移动','食盆区访问','入口停留'];
export const ZONES = ['入口','休息区','食盆区','通道'];
export const pages = [
 ['dashboard','grid','工作台'],['observations','camera','观测记录'],['cats','paw','猫咪档案'],
 // 暂停人工复核入口，保留页面与业务实现供后续恢复。
 // ['review','check','事件复核'],
 ['insights','chart','习惯与画像'],
 // 暂停工作室入口，当前改为每三张抓拍自动排版。
 // ['studio','spark','漫画工作室'],
 ['library','book','作品库']
];
