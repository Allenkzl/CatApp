export const DEMO_DATE = '2026-10-19';
export const defaults = () => ({
  version:1,
  cats:[
    {id:'mikan',name:'橘子',tag:'阳台巡逻员',color:'#d89b54',image:'/public/mikan.jpg',features:'橘色长毛，胸前浅色绒毛，圆眼睛',voice:'认真巡视，偶尔碎碎念。'},
    {id:'sesame',name:'芝麻',tag:'慢生活观察家',color:'#63786e',image:'/public/sesame.jpg',features:'短毛虎斑，额头有深色条纹',voice:'慢悠悠的，喜欢用短句表达。'}
  ],
  events:[
    {id:'EV-001',date:DEMO_DATE,time:'08:12',duration:6,cat:'mikan',action:'入口停留',zone:'入口',note:'橘子在入口附近停留，随后沿通道走开。',confirmed:true,confidence:96},
    {id:'EV-002',date:DEMO_DATE,time:'09:05',duration:12,cat:'sesame',action:'静止休息',zone:'休息区',note:'芝麻在休息区保持低运动状态。',confirmed:true,confidence:94},
    {id:'EV-003',date:DEMO_DATE,time:'10:32',duration:4,cat:'mikan',action:'食盆区访问',zone:'食盆区',note:'橘子进入食盆区域，停留后离开。',confirmed:true,confidence:98},
    {id:'EV-004',date:DEMO_DATE,time:'10:38',duration:5,cat:'sesame',action:'食盆区访问',zone:'食盆区',note:'芝麻在橘子离开后进入食盆区域。',confirmed:true,confidence:93},
    {id:'EV-005',date:DEMO_DATE,time:'11:20',duration:8,cat:'mikan',action:'移动',zone:'通道',note:'橘子沿花盆旁的通道来回移动。',confirmed:true,confidence:91},
    {id:'EV-006',date:DEMO_DATE,time:'13:46',duration:18,cat:'sesame',action:'静止休息',zone:'休息区',note:'背光造成身份不确定，需要人工核对。',confirmed:false,confidence:68},
    {id:'EV-007',date:DEMO_DATE,time:'14:08',duration:3,cat:'unknown',action:'入口停留',zone:'入口',note:'画面部分遮挡，暂时无法关联猫咪身份。',confirmed:false,confidence:54},
    {id:'EV-008',date:DEMO_DATE,time:'15:25',duration:7,cat:'mikan',action:'移动',zone:'通道',note:'两只猫交错经过，轨迹关联需要确认。',confirmed:false,confidence:73}
  ],
  uploads:[], library:[], settings:{site:'Seeed 办公室阳台',question:'谁更喜欢待在入口？',minDuration:3},
  draft:{title:'阳台上的两种生活',style:'手账水彩',count:4,panels:[],approved:false},
});
export const ACTIONS = ['静止休息','移动','食盆区访问','入口停留'];
export const ZONES = ['入口','休息区','食盆区','通道'];
export const pages = [
 ['dashboard','grid','工作台'],['observations','camera','观测记录'],['cats','paw','猫咪档案'],['review','check','事件复核'],['insights','chart','习惯与画像'],['studio','spark','漫画工作室'],['library','book','作品库']
];
