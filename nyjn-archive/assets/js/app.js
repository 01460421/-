'use strict';
/* ---------- 檔案館：核心、大廳、年表、章節 ---------- */
(function(){
const $=id=>document.getElementById(id);
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const RM=document.documentElement.dataset.motion==='less'||!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const CH=FILM.filter(s=>/^c\d+$/.test(s.id));
const chOf=id=>CH.find(c=>c.id===id),chIx=id=>CH.findIndex(c=>c.id===id);
const ACTS=[['第一幕','生者與餘眾',0,7],['第二幕','旅行歸來',8,10],['第三幕','故事的根鬚',11,13]];
const pad=n=>String(n).padStart(2,'0');
const fmtDate=ts=>{const d=new Date(ts);return d.getFullYear()+'.'+(d.getMonth()+1)+'.'+d.getDate()};
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};
const yr=s=>parseInt(s,10);
const clip=(s,n)=>String(s==null?'':s).slice(0,n);
const hashStr=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
/* 事件：後面的檔案靠它接上來 */
const bus={},on=(n,f)=>{(bus[n]=bus[n]||[]).push(f)},emit=(n,d)=>{(bus[n]||[]).slice().forEach(f=>{try{f(d)}catch(e){console.error(e)}});return d};
/* 延伸欄位：後面的檔案各自放在 x 底下，這裡只確認它是乾淨的 JSON */
const cleanX=o=>{try{if(!o||typeof o!=='object'||Array.isArray(o))return{};const t=JSON.stringify(o);return t.length>4e5?{}:JSON.parse(t)}catch(e){return{}}};

/* 手提箱：存在這台裝置的瀏覽器裡 */
const KEY='nyjn.archive.v1';
const Case={ok:true,d:null,tm:0,
  blank(){return{v:1,name:'',since:Date.now(),visits:0,day:'',era:0,last:'',at:{},read:{},notes:{},pins:{},theories:{},choices:{},mine:null,works:[],relay:{},okey:'',ids:{},admin:'',x:{}}},
  clean(x){const b=this.blank();if(!x||typeof x!=='object'||x.v!==1)return b;
    const obj=(o,f)=>{const r={};if(o&&typeof o==='object')Object.keys(o).slice(0,400).forEach(k=>{const v=f(o[k]);if(v!==undefined)r[clip(k,24)]=v});return r};
    b.name=clip(x.name,16);b.since=+x.since||b.since;b.visits=Math.max(0,x.visits|0);b.day=clip(x.day,12);b.era=Math.min(10,Math.max(0,x.era|0));b.last=chOf(x.last)?x.last:'';
    b.at=obj(x.at,v=>Math.max(0,v|0));b.read=obj(x.read,v=>+v||undefined);b.notes=obj(x.notes,v=>typeof v==='string'&&v?clip(v,2000):undefined);
    b.pins=obj(x.pins,v=>+v||undefined);b.theories=obj(x.theories,v=>typeof v==='string'&&v?clip(v,1200):undefined);b.choices=obj(x.choices,v=>v==='a'||v==='b'?v:undefined);
    if(x.mine&&typeof x.mine==='object'){const m=x.mine;b.mine={name:clip(m.name,16),m:Math.min(12,Math.max(1,m.m|0)),d:Math.min(31,Math.max(1,m.d|0)),y:m.y?(m.y|0):0,item:clip(m.item,24),storm:Math.min(10,Math.max(0,m.storm|0)),sym:Math.min(SYM.length-1,Math.max(0,m.sym|0)),gap:Math.max(0,m.gap|0),ts:+m.ts||Date.now()}}
    if(Array.isArray(x.works))b.works=x.works.slice(0,200).filter(w=>w&&typeof w==='object'&&(w.kind==='piece'||w.kind==='card')).map(w=>{const o={id:+w.id||Date.now(),kind:w.kind,ts:+w.ts||Date.now()};
      if(w.kind==='piece'){o.title=clip(w.title,30);o.text=clip(w.text,1200);const r=w.ref;if(r&&r.type==='plate'&&chOf(r.ch))o.ref={type:'plate',ch:r.ch,shot:Math.max(0,r.shot|0)};else if(r&&r.type==='relay')o.ref={type:'relay',k:clip(r.k,8),by:clip(r.by,16),x:clip(r.x,240)};else o.ref=null}
      else{['name','alias','kind2','era','item','from','say'].forEach(k=>o[k]=clip(w[k],k==='say'?80:20));o.ch=chOf(w.ch)?w.ch:'c0';o.shot=Math.max(0,w.shot|0)}return o});
    if(x.relay&&typeof x.relay==='object')RELAYS.forEach(r=>{const a=x.relay[r.k];if(Array.isArray(a))b.relay[r.k]=a.slice(0,200).filter(l=>l&&typeof l.x==='string'&&l.x).map(l=>({t:+l.t||Date.now(),x:clip(l.x,240)}))});
    b.okey=/^[a-z0-9]{16,40}$/.test(x.okey||'')?x.okey:'';b.ids=obj(x.ids,v=>v?1:undefined);b.admin=clip(x.admin,80);b.x=cleanX(x.x);
    return b},
  load(){let raw=null;try{raw=localStorage.getItem(KEY);localStorage.setItem(KEY+'.t','1');localStorage.removeItem(KEY+'.t')}catch(e){this.ok=false}
    let x=null;try{x=raw?JSON.parse(raw):null}catch(e){}this.d=this.clean(x)},
  save(){clearTimeout(this.tm);this.tm=setTimeout(()=>this.flush(),220);badge();emit('save')},
  flush(){clearTimeout(this.tm);try{localStorage.setItem(KEY,JSON.stringify(this.d))}catch(e){this.ok=false}},
  code(){return 'NYJN1.'+btoa(unescape(encodeURIComponent(JSON.stringify(this.d))))},
  read(code){try{code=String(code||'').trim();if(code.slice(0,6)!=='NYJN1.')return false;const x=JSON.parse(decodeURIComponent(escape(atob(code.slice(6)))));if(!x||x.v!==1)return false;this.d=this.clean(x);this.flush();emit('import');return true}catch(e){return false}},
  count(){const d=this.d;return Object.keys(d.read).length+Object.keys(d.pins).length+Object.keys(d.notes).length+Object.keys(d.choices).length+d.works.length+(d.mine?1:0)+RELAYS.reduce((n,r)=>n+(d.relay[r.k]||[]).length,0)}};
function badge(){const c=$('case-cnt');if(c)c.textContent=Case.count()}

/* 提示與雨幕 */
let toastT=0;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2200)}
function veil(long){emit('veil',!!long);if(RM||document.documentElement.dataset.motion==='less')return;const v=$('veil');v.classList.remove('go','long');void v.offsetWidth;if(long)v.classList.add('long');v.classList.add('go')}
async function copyText(s,ta){try{await navigator.clipboard.writeText(s);toast('已複製');return true}catch(e){if(ta){ta.hidden=false;ta.value=s;ta.focus();ta.select();toast('請長按或按 Ctrl+C 複製')}else toast('這裡不能自動複製');return false}}

/* 底片：把紀錄片的畫家畫進方框 */
const Plates={m:new Map(),last:0,
  fit(cv){const r=cv.getBoundingClientRect();if(r.width<2||r.height<2)return null;const d=Math.min(window.devicePixelRatio||1,2,Math.sqrt(2.4e6/(r.width*r.height))),w=Math.round(r.width*d),h=Math.round(r.height*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}return r},
  paint(cv,shot,t){const c=cv.getContext('2d'),W=cv.width,H=cv.height,U=sqrt(W*H)/100,n=(shot.cues||[]).length||1,k=min(n-.001,t/5);
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.shadowBlur=0;c.setLineDash([]);c.fillStyle='#090d12';c.fillRect(0,0,W,H);c.save();
    try{(P[shot.p]||P.rain)(c,t,W,H,U,shot.a||{},k)}catch(e){}c.restore();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.shadowBlur=0;c.shadowColor='transparent';c.setLineDash([])},
  mount(cv,shot,period){this.m.set(cv,{shot,t0:performance.now(),period:period||max(10,((shot.cues||[]).length||1)*5+4)});if(cv.offsetParent!==null&&this.fit(cv))this.paint(cv,shot,RM?5:.05)},
  still(cv,shot,t){try{this.paint(cv,shot,t==null?5:t)}catch(e){}},
  tick(now,force){if(!force&&now-this.last<33)return;this.last=now;this.m.forEach((s,cv)=>{if(!cv.isConnected){this.m.delete(cv);return}if(cv.offsetParent===null)return;const r=this.fit(cv);if(!r||r.bottom<-40||r.top>innerHeight+40)return;
      const t=RM?5:((now-s.t0)/1000)%s.period;this.paint(cv,s.shot,t)})}};
function loop(now){if(!document.hidden)Plates.tick(now);requestAnimationFrame(loop)}
const stormShot=i=>({p:'storm',a:{from:yr(SD[i].f),to:yr(SD[i].t)},cues:[]});

/* ---------- 路由 ---------- */
const ROOMS=[
 ['chronicle','暴雨年表','十一場雨排成一條線，看日曆怎麼折返。'],
 ['chapters','章節檔案','序幕至第十三章。十四間展間，一間一間看。'],
 ['film','放映廳','紀錄片《逆雨紀年》。燈暗了就開始。'],
 ['choices','司辰的抉擇','八個時刻，換你站在她的位置。'],
 ['rain','你的暴雨','留下生日。雨在某一年等你。'],
 ['relay','接龍','前一位司辰停在哪裡，你就從哪裡接。'],
 ['studio','創作坊','替底片題字，替筆下的人立檔案。'],
 ['quiz','入館考核','十道題，考你還記得多少。'],
 ['index','名詞索引','八十五個詞。看不懂的，先來這裡查。'],
 ['questions','未解之謎','十二個主線還沒回答的問題。'],
 ['case','手提箱','你留下的，都在箱子裡。']];
const SEC={hall:'r-hall',chronicle:'r-chronicle',chapters:'r-chapters',choices:'r-choices',rain:'r-rain',relay:'r-relay',studio:'r-studio',index:'r-index',questions:'r-questions',case:'r-case'};
const enter={};let cur='';
function show(secId,name){if(cur&&cur!==name)emit('leave',cur);document.querySelectorAll('.room').forEach(s=>{const on=s.id===secId;s.hidden=!on;s.classList.remove('in');if(on){void s.offsetWidth;s.classList.add('in')}});
  if(cur&&cur!==name)veil();const first=!cur;cur=name;if(!first)window.scrollTo(0,0);$('toc').hidden=true}
function route(){let h=(location.hash||'').slice(1),about=false;try{h=decodeURIComponent(h)}catch(e){}
  const sl=h.indexOf('/'),arg=sl<0?'':h.slice(sl+1);if(sl>=0)h=h.slice(0,sl);if(h==='about'){h='hall';about=true}
  if(/^c\d+$/.test(h)&&chOf(h)){show('r-chapter',h);enter.chapter(h,arg)}
  else{if(!SEC[h])h='hall';show(SEC[h],h);if(enter[h])enter[h](arg)}
  const navK=/^c\d+$/.test(cur)?'chapters':cur;document.querySelectorAll('#nav-links a').forEach(x=>{if(x.dataset.k===navK)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});
  if(about)setTimeout(()=>{const a=$('about');if(a)a.scrollIntoView()},60);
  emit('route',{name:cur,arg});
  try{if(window.claude&&window.claude.hot&&window.claude.hot.snapshot)window.claude.hot.snapshot(()=>({route:cur}))}catch(e){}}
function statusOf(id){const d=Case.d;
  if(id==='chapters'){const n=Object.keys(d.read).length;return n?'已記錄 '+n+'／14':''}
  if(id==='choices'){const n=Object.keys(d.choices).length;return n?'已選 '+n+'／8':''}
  if(id==='rain')return d.mine?ORD[d.mine.storm]+'暴雨':'';
  if(id==='relay'){const n=RELAYS.reduce((a,r)=>a+(d.relay[r.k]||[]).length,0);return n?'你寫了 '+n+' 段':''}
  if(id==='studio')return d.works.length?d.works.length+' 件作品':'';
  if(id==='questions'){const n=Object.keys(d.pins).length;return n?'收藏 '+n:''}
  if(id==='case'){const n=Case.count();return n?n+' 件':''}
  if(id==='chronicle')return ORD[d.era];return emit('status',{id,s:''}).s}
function roomRows(box,cls){box.textContent='';ROOMS.forEach((r,i)=>{const li=el('li'),a=el('a');a.href='#'+r[0];a.append(el('span','n',pad(i+1)),el('span','t',r[1]));if(cls==='rooms')a.append(el('span','d',r[2]));a.append(el('span','s',statusOf(r[0])));li.append(a);box.append(li)});
  if(cls!=='rooms'){const l2=el('li'),b=el('a');b.href='#about';b.append(el('span','n','—'),el('span','t','關於本館'),el('span','s',''));l2.append(b);box.append(l2)}}

/* ---------- 首頁 ---------- */
let hallBuilt=false;
function lookCard(c,i){const a=el('a','look');a.href='#'+c.id;a.dataset.id=c.id;const ph=el('div','ph'),cv=el('canvas');cv.width=420;cv.height=560;ph.append(cv,el('span','num',pad(i)));a.append(ph,el('span','m',c.no+' · '+c.meta),el('span','t',c.zh),el('span','e',c.en));
  setTimeout(()=>Plates.still(cv,{p:c.bg[0],a:c.bg[1]||{},cues:[]}),60+45*i);return a}
function lookStamps(root){root.querySelectorAll('.look[data-id]').forEach(a=>{const old=a.querySelector('.stamp');if(old)old.remove();const ts=Case.d.read[a.dataset.id];if(ts)a.querySelector('.ph').append(stampEl(ts))});emit('looks',root)}
const TILES=[['choices','Decisions','司辰的抉擇','八個時刻，換你站在她的位置。',{p:'umbrella',a:{},cues:[]},6],
 ['rain','Your Storm','你的暴雨','留下生日。雨在某一年等你。',{p:'storm',a:{from:1999,to:1929},cues:[]},3.1],
 ['relay','The Relay','接龍','前一位司辰停在哪裡，你就從哪裡接。',{p:'pages',a:{lines:['THE RELAY','','She wrote the next','line, and passed','the page on.'],book:1},cues:[]},7],
 ['studio','Atelier','創作坊','替底片題字，替筆下的人立檔案。',{p:'gallery',a:{circle:1},cues:[]},6],
 ['quiz','Examination','入館考核','十道題，考你還記得多少。',{p:'school',a:{},cues:[]},6]];
function eraPaint(){const i=Case.d.era,s=SD[i];$('era-n').textContent=ORD[i]+'暴雨';$('era-span').textContent=s.f+' → '+s.t;$('era-note').textContent=s.note;$('era-prev').disabled=i===0;$('era-next').disabled=i===SD.length-1;Plates.mount($('era-cv'),stormShot(i),9)}
function setEra(i,quiet){i=min(SD.length-1,max(0,i));if(i===Case.d.era&&!quiet)return;Case.d.era=i;Case.save();if(cur==='hall'){eraPaint();veil(true)}if(cur==='chronicle')stormPaint();emit('era',i)}
enter.hall=function(){const d=Case.d;if(!hallBuilt){hallBuilt=true;const rail=$('rail');CH.forEach((c,i)=>rail.append(lookCard(c,i)));
    const step=()=>{const f=rail.querySelector('.look');return f?f.getBoundingClientRect().width+18:300};$('rail-p').onclick=()=>rail.scrollBy({left:-step()*2,behavior:RM?'auto':'smooth'});$('rail-n').onclick=()=>rail.scrollBy({left:step()*2,behavior:RM?'auto':'smooth'});
    const tiles=$('tiles');TILES.forEach((t,i)=>{const a=el('a','tile');a.href='#'+t[0];a.dataset.id=t[0];const cv=el('canvas');cv.width=480;cv.height=600;const tx=el('div','tx');tx.append(el('span','kick',t[1]),el('b','',t[2]),el('span','d',t[3]));a.append(cv,el('span','st',''),tx);tiles.append(a);setTimeout(()=>Plates.still(cv,t[4],t[5]),500+90*i)});
    const j=$('journal');QS.slice(0,3).forEach((q,i)=>{const a=el('a');a.href='#questions';a.append(el('span','qn','Q.'+pad(i+1)),el('b','',q.q),el('span','c',q.cl[0]));j.append(a)});
    const band=$('band'),ys=[yr(SD[0].f)].concat(SD.map(x=>yr(x.t)));for(let rep=0;rep<2;rep++)ys.forEach((y,i)=>{band.append(el('span',i===0||i===ys.length-1?'f':'',String(y)));band.append(el('i','',i<ys.length-1?'→':'·'))});
    Plates.mount($('hero-cv'),{p:'rain',a:{big:'1999',peel:1},cues:[]},40)}
  eraPaint();lookStamps($('rail'));document.querySelectorAll('#tiles .tile').forEach(a=>{a.querySelector('.st').textContent=statusOf(a.dataset.id)});
  $('visit-lab').textContent=(d.name?d.name+' · ':'')+'第 '+d.visits+' 天來訪';
  const r=$('resume'),c=chOf(d.last);if(c){r.hidden=false;$('resume-t').textContent=(c.no+'　'+c.zh)+'　底片 '+pad((d.at[c.id]||0)+1);$('resume-a').href='#'+c.id}else r.hidden=true;emit('hall')};

/* ---------- 年表 ---------- */
const NS='http://www.w3.org/2000/svg',sv=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
function chartDraw(){const svg=$('chart'),w=max(280,svg.parentNode.clientWidth-12),h=round(min(420,max(250,w*.5))),L=42,R=10,T=26,B=30,n=SD.length,step=(w-L-R)/n;
  const X=i=>L+(i+.5)*step,Y=y=>T+(2003-y)/(2003-1905)*(h-T-B);svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.textContent='';
  [1999,1966,1935,1912].forEach(y=>{svg.append(sv('line',{class:'ax',x1:L,x2:w-R,y1:Y(y),y2:Y(y)}));const t=sv('text',{x:L-6,y:Y(y)+4,'text-anchor':'end','font-size':11});t.textContent=y;svg.append(t)});
  for(let i=0;i<n-1;i++)svg.append(sv('line',{class:'live',x1:X(i),y1:Y(yr(SD[i].t)),x2:X(i+1),y2:Y(yr(SD[i+1].f))}));
  SD.forEach((s,i)=>{const g=sv('g',{class:'st'+(i===Case.d.era?' on':''),'data-i':i,tabindex:0,role:'button','aria-label':ORD[i]+'暴雨，'+s.f+' 到 '+s.t}),a=Y(yr(s.f)),b=Y(yr(s.t)),up=yr(s.t)>yr(s.f),x=X(i);
    g.append(sv('line',{class:'drop'+(up?' up':''),x1:x,x2:x,y1:a,y2:b}));g.append(sv('rect',{class:'dot',x:x-3,y:a-3,width:6,height:6}));
    g.append(sv('path',{class:'dot',d:'M'+(x-5)+' '+(b+(up?7:-7))+' L'+x+' '+b+' L'+(x+5)+' '+(b+(up?7:-7))+' Z'}));
    const t1=sv('text',{x,y:T-10,'text-anchor':'middle','font-size':11});t1.textContent=i+1;g.append(t1);
    const t2=sv('text',{x,y:h-9,'text-anchor':'middle','font-size':w<520?9.5:11});t2.textContent="'"+pad(REALY[i]%100);g.append(t2);
    g.append(sv('rect',{class:'hit',x:x-step/2,y:0,width:step,height:h}));svg.append(g)})}
function stormPaint(){const i=Case.d.era,s=SD[i],d=yr(s.t)-yr(s.f);document.querySelectorAll('#chart .st').forEach(g=>g.classList.toggle('on',+g.dataset.i===i));
  $('st-real').textContent='世界真正的年份　約 '+REALY[i];$('st-n').textContent=ORD[i]+'暴雨';$('st-span').textContent=s.f+' → '+s.t;$('st-note').textContent=s.note;
  const dl=$('st-dl');dl.textContent='';[['方向',d<0?'往回 '+(-d)+' 年':'往前 '+d+' 年'],['之後',i<SD.length-1?'在那個年代待到 '+SD[i+1].f:'主線目前停在這個年代']].forEach(r=>{dl.append(el('dt','',r[0]),el('dd','',r[1]))});
  $('st-prev').disabled=i===0;$('st-next').disabled=i===SD.length-1;const a=$('st-ch');if(s.ch){a.hidden=false;a.href='#'+s.ch;a.textContent='讀'+chOf(s.ch).no}else a.hidden=true;Plates.mount($('storm-cv'),stormShot(i),9)}
enter.chronicle=function(){chartDraw();stormPaint();emit('chronicle')};

/* ---------- 章節目錄 ---------- */
let listBuilt=false;
function stampEl(ts,hit){const s=el('span','stamp'+(hit?' hit':''),'已記錄');s.append(el('small','',fmtDate(ts)));return s}
enter.chapters=function(){const box=$('ch-list');if(!listBuilt){listBuilt=true;ACTS.forEach((a,k)=>{const h=el('div','act-h');h.append(el('b','',a[0]+'　'+a[1]),el('span','lab',CH[a[2]].no+' — '+CH[a[3]].no));box.append(h);const g=el('div','looks');
      for(let i=a[2];i<=a[3];i++)g.append(lookCard(CH[i],i));
      if(k===ACTS.length-1){const so=el('div','look soon'),ph=el('div','ph'),cv=el('canvas');cv.width=420;cv.height=560;ph.append(cv,el('span','num','14'));so.append(ph,el('span','m','第十四章 · 尚未抵達台版'),el('span','t','應門者'),el('span','e','4.0「未選擇的路」'));g.append(so);setTimeout(()=>Plates.still(cv,{p:'castle',a:{},cues:[]}),900)}box.append(g)})}
  lookStamps(box)};

/* ---------- 展間 ---------- */
let room=null;
enter.chapter=function(id,arg){const c=chOf(id),ix=chIx(id),shots=c.shots.filter(s=>s.cues&&s.cues.length),box=$('ch-room');box.textContent='';Case.d.last=id;Case.save();
  const back=el('a','back','‹ 章節檔案');back.href='#chapters';box.append(back);
  const head=el('div','ch-head'),side=el('div','side');side.append(el('span','lab',c.no+' · '+c.meta),el('div','en',c.en),el('p','epi',c.epi));const h2=el('h2','',c.zh);if(c.zh.length>5)h2.style.maxHeight=(Math.ceil(c.zh.length/2)*1.09+.15)+'em';head.append(side,h2);box.append(head);
  const viewer=el('div','viewer'),left=el('div'),fig=el('figure','plate'),cv=el('canvas');cv.width=960;cv.height=600;cv.setAttribute('aria-label',c.zh+' 的底片');fig.append(cv);
  const cap=el('div','cap'),capL=el('span'),capR=el('span');cap.append(capL,capR);
  const vctl=el('div','vctl'),bp=el('button','btn sm','‹ 上一張'),pos=el('span','pos'),bn=el('button','btn sm pri','下一張 ›');vctl.append(bp,pos,bn);
  const strip=el('div','strip');shots.forEach((s,i)=>{const b=el('button');b.setAttribute('aria-label','底片 '+(i+1));const t=el('canvas');t.width=240;t.height=150;b.append(t);b.onclick=()=>go(i);strip.append(b);setTimeout(()=>Plates.still(t,s),60+50*i)});
  left.append(fig,cap,vctl,strip);const narr=el('div','narr');viewer.append(left,narr);box.append(viewer);
  let at=min(shots.length-1,max(0,/^\d+$/.test(arg||'')?+arg-1:(Case.d.at[id]||0)));
  function go(i){at=min(shots.length-1,max(0,i));const s=shots[at];Case.d.at[id]=at;Case.save();Plates.mount(cv,s);capL.textContent='PL. '+pad(at+1)+' ／ '+pad(shots.length);capR.textContent=[s.loc,s.date].filter(Boolean).join(' · ');
    pos.textContent=pad(at+1)+' ／ '+pad(shots.length);bp.disabled=at===0;bn.disabled=at===shots.length-1;narr.textContent='';
    if(s.loc||s.date)narr.append(el('div','where',[s.loc,s.date].filter(Boolean).join('　')));s.cues.forEach(t=>narr.append(el('p','',t)));
    if(s.storm){const tg=el('div','stormtag',s.storm.n);tg.append(el('span','',s.storm.span[0]+' → '+s.storm.span[1]));narr.append(tg)}
    const mk=el('button','tiny','用這張底片創作');mk.onclick=()=>{window.__studioRef={ch:id,shot:at};location.hash='studio'};narr.append(mk);
    strip.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-current',j===at?'true':'false'));const curB=strip.children[at];if(curB&&strip.scrollWidth>strip.clientWidth)strip.scrollLeft=curB.offsetLeft-strip.clientWidth/2+40;
    try{history.replaceState(null,'','#'+id+'/'+(at+1))}catch(e){}emit('plate',{id,c,at,shot:s,shots,narr,cv,fig,cap,vctl,go})}
  bp.onclick=()=>go(at-1);bn.onclick=()=>go(at+1);room={id,go:d=>go(at+d),to:go,get at(){return at},n:shots.length};emit('viewer',{id,c,shots,viewer,left,fig,cv,vctl,strip,narr,room});go(at);
  const end=el('div','ch-end'),rec=el('div'),recRow=el('div','record');rec.append(el('h3','','記錄這一章'),recRow);
  function recPaint(hit){recRow.textContent='';const ts=Case.d.read[id];if(ts){recRow.append(stampEl(ts,hit));const u=el('button','tiny','取消戳記');u.onclick=()=>{delete Case.d.read[id];Case.save();recPaint()};recRow.append(u)}
    else{const b=el('button','btn pri','蓋章：我讀完了');b.onclick=()=>{Case.d.read[id]=Date.now();Case.save();recPaint(true);toast('戳記已收進手提箱');emit('stamp',{id})};recRow.append(b)}}
  recPaint();const fl=el('p','hint');const fa=el('a','lnk','在放映廳看這一章');fa.href='#film/'+id;fl.append(fa);rec.append(fl);
  const nt=el('div');nt.append(el('h3','','你的手記'));const ta=el('textarea','field');ta.id='note-'+id;ta.rows=5;ta.maxLength=2000;ta.placeholder='看完這一章，想到什麼就寫。箱子替你收著。';ta.value=Case.d.notes[id]||'';ta.setAttribute('aria-label','你的手記');
  const hint=el('p','hint','只存在這台裝置。');ta.oninput=()=>{const v=ta.value.trim();if(v)Case.d.notes[id]=ta.value.slice(0,2000);else delete Case.d.notes[id];Case.save();hint.textContent='已存入手提箱。'};nt.append(ta,hint);end.append(rec,nt);box.append(end);
  const nav=el('div','ch-nav');if(ix>0){const a=el('a','btn','‹ '+CH[ix-1].no+'　'+CH[ix-1].zh);a.href='#'+CH[ix-1].id;nav.append(a)}else nav.append(el('span'));
  if(ix<CH.length-1){const a=el('a','btn pri',CH[ix+1].no+'　'+CH[ix+1].zh+' ›');a.href='#'+CH[ix+1].id;nav.append(a)}else{const a=el('a','btn','第十四章尚未抵達，回章節檔案');a.href='#chapters';nav.append(a)}box.append(nav);emit('chapter',{id,c,box,shots,end,rec,nav})};
document.addEventListener('keydown',e=>{if(cur&&/^c\d+$/.test(cur)&&room&&!/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)){if(e.key==='ArrowRight')room.go(1);else if(e.key==='ArrowLeft')room.go(-1)}
  if(e.key==='Escape'&&!$('toc').hidden)$('toc').hidden=true});

/* 給後面幾個檔案用 */
const A={$,el,RM,CH,chOf,chIx,pad,fmtDate,dayKey,yr,clip,hashStr,Case,toast,veil,copyText,Plates,stormShot,enter,setEra,stampEl,statusOf,roomRows,route,loop,badge,on,emit,ROOMS,SEC,ACTS,lookCard,
  addRoom(name,secId,fn){SEC[name]=secId;enter[name]=fn},get cur(){return cur},get room(){return room}};
window.__A=A;
/* ---------- 名詞索引 ---------- */
let termsBuilt=false,termG='全部';
function termFilter(){const q=$('term-q').value.trim().toLowerCase();let n=0;document.querySelectorAll('#terms .term').forEach(t=>{const ok=(termG==='全部'||t.dataset.g===termG)&&(!q||t.dataset.s.indexOf(q)>=0);t.hidden=!ok;if(ok)n++});$('term-count').textContent='顯示 '+n+' ／ '+TERMS.length+(n?'':'　索引裡沒有這個詞。換個字試試。')}
enter.index=function(arg){if(!termsBuilt){termsBuilt=true;const tabs=$('term-tabs');['全部','術語','組織','人物','地點'].forEach(g=>{const b=el('button','',g);b.setAttribute('aria-pressed',g===termG?'true':'false');b.onclick=()=>{termG=g;tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));termFilter()};tabs.append(b)});
    const box=$('terms');TERMS.forEach((t,ti)=>{const d=el('div','term');d.dataset.g=t.g;d.dataset.i=ti;d.dataset.s=(t.t+' '+t.d).toLowerCase();const th=el('div','th');th.append(el('b','',t.t),el('span','g',t.g));d.append(th,el('p','',t.d));
      if(t.c.length){const r=el('div','refs');t.c.forEach(c=>{const a=el('a','',CHS[chIx(c)]);a.href='#'+c;a.title=chOf(c).no+' '+chOf(c).zh;r.append(a)});d.append(r)}box.append(d)});
    $('term-q').addEventListener('input',termFilter)}
  if(arg){termG='全部';$('term-tabs').querySelectorAll('button').forEach((x,i)=>x.setAttribute('aria-pressed',i===0?'true':'false'));$('term-q').value=arg}termFilter();emit('index',{arg})};

/* ---------- 未解之謎 ---------- */
let qsBuilt=false;
enter.questions=function(){if(qsBuilt){emit('questions');return}qsBuilt=true;const box=$('qs');QS.forEach((q,i)=>{const c=el('article','q'+(Case.d.pins[q.id]?' pinned':''));c.append(el('span','qn','Q.'+pad(i+1)),el('h3','',q.q));const ul=el('ul');q.cl.forEach(x=>ul.append(el('li','',x)));c.append(ul);
    const acts=el('div','acts'),refs=el('div','refs');q.c.forEach(k=>{const a=el('a','',CHS[chIx(k)]);a.href='#'+k;a.title=chOf(k).no+' '+chOf(k).zh;refs.append(a)});
    const pin=el('button','btn sm');const paint=()=>{const on=!!Case.d.pins[q.id];pin.textContent=on?'已收藏　取出':'收進手提箱';pin.setAttribute('aria-pressed',on?'true':'false');c.classList.toggle('pinned',on)};
    pin.onclick=()=>{if(Case.d.pins[q.id])delete Case.d.pins[q.id];else{Case.d.pins[q.id]=Date.now();toast('已收進手提箱')}Case.save();paint()};paint();acts.append(refs,pin);c.append(acts);
    const ta=el('textarea','field');ta.id='th-'+q.id;ta.rows=2;ta.maxLength=1200;ta.placeholder='我的推測';ta.setAttribute('aria-label','我的推測：'+q.q);ta.value=Case.d.theories[q.id]||'';
    ta.oninput=()=>{if(ta.value.trim())Case.d.theories[q.id]=ta.value.slice(0,1200);else delete Case.d.theories[q.id];Case.save()};c.append(ta);box.append(c);emit('question',{q,i,card:c,ta})});emit('questions')};

/* ---------- 司辰的抉擇 ---------- */
let scAt=-1;
function scShot(s){return chOf(s.ch).shots[s.shot]}
function scPaint(){const d=Case.d,steps=$('steps');steps.textContent='';SC.forEach((s,i)=>{const b=el('button',d.choices[s.id]?'done':'',String(i+1));b.setAttribute('aria-label','第 '+(i+1)+' 個時刻'+(d.choices[s.id]?'，已選':''));b.setAttribute('aria-current',i===scAt?'true':'false');b.onclick=()=>{scAt=i;scPaint()};steps.append(b)});
  const s=SC[scAt],box=$('scene');box.textContent='';const fig=el('figure','plate'),cv=el('canvas');cv.width=960;cv.height=600;cv.setAttribute('aria-label','這個時刻的底片');fig.append(cv);const L=el('div');L.append(fig);const cp=el('div','cap');cp.append(el('span','',chOf(s.ch).no+'　'+chOf(s.ch).zh),el('span','',s.when));L.append(cp);
  const R=el('div','scene-text');R.append(el('span','lab','時刻 '+pad(scAt+1)+' ／ '+pad(SC.length)+'　'+s.when));s.setup.forEach(t=>R.append(el('p','',t)));
  const opts=el('div','opts'),pick=d.choices[s.id];[['a',s.a,'甲'],['b',s.b,'乙']].forEach(o=>{const b=el('button','opt'+(pick&&pick!==o[0]?' dim':''));b.append(el('i','',o[2]),el('span','',o[1]));b.setAttribute('aria-pressed',pick===o[0]?'true':'false');
    b.onclick=()=>{Case.d.choices[s.id]=o[0];Case.save();emit('choice',{s,pick:o[0]});scPaint();if(!pick)toast('已記下你的選擇')};opts.append(b)});R.append(opts);
  if(pick){const rv=el('div','reveal');rv.append(el('span','lab',s.canon?'主線裡':'沒有答案的一題'),el('p','',s.reveal));if(s.canon)rv.append(el('span','same',pick===s.canon?'這一次，你和她走了同一條路。':'這一次，你走了另一條路。'));R.append(rv);emit('reveal',{s,pick,rv})}
  const nav=el('div','scene-nav');if(scAt<SC.length-1){const n=el('button','btn'+(pick?' pri':''),'下一個時刻 ›');n.onclick=()=>{scAt++;scPaint();window.scrollTo(0,0)};nav.append(n)}const rd=el('a','lnk','讀'+chOf(s.ch).no);rd.href='#'+s.ch;nav.append(rd);R.append(nav);
  box.append(L,R);Plates.mount(cv,scShot(s));
  const done=SC.every(x=>d.choices[x.id]),tl=$('tally');tl.hidden=!done;if(done){tl.textContent='';const cmp=SC.filter(x=>x.canon),same=cmp.filter(x=>d.choices[x.id]===x.canon).length;
    tl.append(el('span','lab','八個時刻都選完了'),el('b','','七次可以對照的抉擇裡，你有 '+same+' 次和她走了同一條路。'));const ul=el('ul');SC.forEach((x,i)=>{const li=el('li');li.append(el('span','',pad(i+1)+'　'+(d.choices[x.id]==='a'?x.a:x.b)),el('span','',!x.canon?'你的':d.choices[x.id]===x.canon?'同一條路':'另一條路'));ul.append(li)});tl.append(ul);
    const again=el('button','btn','全部重選');again.onclick=()=>{Case.d.choices={};Case.save();emit('choice',{reset:true});scAt=0;scPaint();window.scrollTo(0,0)};const sr=el('div','save-row');sr.append(again);tl.append(sr);emit('tally',{tl,sr,same,n:cmp.length})}}
enter.choices=function(){if(scAt<0){const i=SC.findIndex(s=>!Case.d.choices[s.id]);scAt=i<0?0:i}scPaint()};

/* ---------- 你的暴雨 ---------- */
let mineRun=0,mineBuilt=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function nearestStorm(m,d){const doy=(mm,dd)=>Math.round((Date.UTC(2001,mm-1,dd)-Date.UTC(2001,0,1))/864e5);const me=doy(m,d);let best=-1,gap=999;SD.forEach((s,i)=>{if(!s.md)return;let g=abs(doy(s.md[0],s.md[1])-me);g=min(g,365-g);if(g<gap){gap=g;best=i}});return{i:best,gap}}
function mineLine(t,keep){const box=$('mine-lines');if(!keep)box.textContent='';box.append(el('span','',t))}
function mineCard(){const r=Case.d.mine,out=$('mine-out');out.textContent='';if(!r){out.hidden=true;return}out.hidden=false;const s=SD[r.storm],c=el('div','record-card');
  c.append(el('span','lab','暴雨紀錄　'+fmtDate(r.ts)),el('h3','',(r.name||'無名的記錄員')+' 的'+ORD[r.storm]+'暴雨'),el('div','span',s.f+' → '+s.t));
  const dl=el('dl');[['離你的生日',r.gap===0?'就在同一天':'相隔 '+r.gap+' 天（'+r.m+' 月 '+r.d+' 日）'],['症候',SYM[r.sym]],['放進手提箱',r.item],['雨停之後','日期是 '+s.t]].forEach(x=>dl.append(el('dt','',x[0]),el('dd','',x[1])));
  if(r.y){const a=REALY[r.storm]-r.y;dl.append(el('dt','','那一年'),el('dd','',a>=0?'世界真正的年份大約是 '+REALY[r.storm]+'，你 '+a+' 歲。':'世界真正的年份大約是 '+REALY[r.storm]+'，你還沒出生。'))}c.append(dl);
  c.append(el('p','',s.note),el('p','fine','症候由本館編寫，是同好的遊戲，不是遊戲設定。'));
  const row=el('div','save-row'),cp=el('button','btn','複製這份紀錄'),ag=el('button','btn','再走一次');
  cp.onclick=()=>copyText('【逆雨檔案館｜暴雨紀錄】\n'+(r.name||'無名的記錄員')+' 的'+ORD[r.storm]+'暴雨\n'+s.f+' → '+s.t+'\n症候：'+SYM[r.sym]+'\n放進手提箱：'+r.item+'\n雨停之後，日期是 '+s.t);
  ag.onclick=()=>{$('mine-form').hidden=false;out.hidden=true;Plates.mount($('mine-cv'),{p:'rain',a:{peel:1,big:String(new Date().getFullYear())},cues:[]});$('mine-lines').textContent='';$('mine-name').focus()};row.append(cp,ag);
  if(s.ch){const a=el('a','btn pri','讀'+chOf(s.ch).no);a.href='#'+s.ch;row.append(a)}c.append(row);out.append(c);emit('mineCard',{r,s,card:c,row})}
async function mineGo(r,fast){const run=++mineRun,cv=$('mine-cv'),s=SD[r.storm],now=new Date(),yNow=now.getFullYear(),alive=()=>run===mineRun&&A.cur==='rain';$('mine-form').hidden=true;$('mine-out').hidden=true;
  const skip=$('mine-skip');let skipped=!!fast||RM;const nap=async ms=>{if(skipped)return;const t0=performance.now();while(performance.now()-t0<ms&&!skipped&&alive())await wait(80)};
  if(!skipped){skip.hidden=false;$('mine-form').hidden=false;[...$('mine-form').children].forEach(x=>{if(!x.classList.contains('save-row'))x.hidden=true});$('mine-form').querySelector('button[type=submit]').hidden=true;skip.onclick=()=>{skipped=true}}
  Plates.mount(cv,{p:'rain',a:{peel:1,big:String(yNow)},cues:[]});mineLine((r.name||'記錄員')+'，今天是 '+yNow+'.'+(now.getMonth()+1)+'.'+now.getDate()+'。');await nap(2600);if(!alive())return;
  mineLine('症候出現了：'+SYM[r.sym]+'。',true);await nap(3200);if(!alive())return;
  mineLine('你把「'+r.item+'」放進手提箱。');await nap(2600);if(!alive())return;
  Plates.mount(cv,{p:'storm',a:{from:yNow,to:yr(s.t)},cues:[]},60);if(!skipped)veil(true);mineLine('雨向上落。');await nap(5600);if(!alive())return;
  const dest=s.ch?chOf(s.ch):null;Plates.mount(cv,dest&&r.storm>=6&&r.storm<10?{p:CH[chIx(s.ch)+1].bg[0],a:CH[chIx(s.ch)+1].bg[1]||{},cues:[]}:{p:'rain',a:{big:String(yr(s.t)),seed:r.sym+3},cues:[]});
  mineLine('雨停了。日期是 '+s.t+'。');await nap(2600);if(!alive())return;mineLine('手提箱裡還有：「'+r.item+'」。',true);await nap(1800);if(!alive())return;mineLine('其他的，留在雨的另一邊。',true);await nap(1600);if(!alive())return;
  skip.hidden=true;[...$('mine-form').children].forEach(x=>x.hidden=false);$('mine-form').querySelector('button[type=submit]').hidden=false;skip.hidden=true;$('mine-form').hidden=true;mineCard()}
enter.rain=function(){const d=Case.d;if(!mineBuilt){mineBuilt=true;const m=$('mine-m'),dd=$('mine-d');for(let i=1;i<=12;i++){const o=el('option','',i+' 月');o.value=i;m.append(o)}for(let i=1;i<=31;i++){const o=el('option','',i+' 日');o.value=i;dd.append(o)}
    KEEP.forEach(k=>{const b=el('button','',k);b.type='button';b.onclick=()=>{$('mine-item').value=k};$('mine-chips').append(b)});
    $('mine-form').addEventListener('submit',e=>{e.preventDefault();const name=$('mine-name').value.trim().slice(0,16),mm=+m.value,dv=min(+dd.value,[31,29,31,30,31,30,31,31,30,31,30,31][mm-1]),y=+$('mine-y').value||0,item=($('mine-item').value.trim()||KEEP[0]).slice(0,24);
      const ns=nearestStorm(mm,dv),r={name,m:mm,d:dv,y:y>=1900&&y<=2030?y:0,item,storm:ns.i,gap:ns.gap,sym:hashStr(name+'|'+mm+'|'+dv+'|'+item)%SYM.length,ts:Date.now()};
      Case.d.mine=r;if(name&&!Case.d.name)Case.d.name=name;Case.save();emit('mine',r);mineGo(r)})}
  mineRun++;$('mine-skip').hidden=true;$('mine-lines').textContent='';[...$('mine-form').children].forEach(x=>x.hidden=false);$('mine-form').querySelector('button[type=submit]').hidden=false;$('mine-skip').hidden=true;
  $('mine-name').value=d.mine?d.mine.name:d.name;if(d.mine){$('mine-m').value=d.mine.m;$('mine-d').value=d.mine.d;$('mine-y').value=d.mine.y||'';$('mine-item').value=d.mine.item;$('mine-form').hidden=true;Plates.mount($('mine-cv'),stormShot(d.mine.storm),9);mineCard()}
  else{$('mine-form').hidden=false;$('mine-out').hidden=true;Plates.mount($('mine-cv'),{p:'rain',a:{peel:1,big:String(new Date().getFullYear())},cues:[]})}};
/* ---------- 共用的本子：自己的後端 → Claude 內建儲存 → 只存本機 ---------- */
const okey=()=>{if(!Case.d.okey){let s='';const a='abcdefghijklmnopqrstuvwxyz0123456789';for(let i=0;i<28;i++)s+=a[Math.floor(Math.random()*36)];Case.d.okey=s;Case.save()}return Case.d.okey};
const CHAN=RELAYS.map(r=>r.k).concat(['gallery']);
function cleanWork(w){if(!w||typeof w!=='object')return null;if(w.kind==='piece')return{kind:'piece',title:clip(w.title,30),text:clip(w.text,1200),ref:w.ref&&w.ref.type==='plate'&&chOf(w.ref.ch)?{type:'plate',ch:w.ref.ch,shot:Math.max(0,w.ref.shot|0)}:w.ref&&w.ref.type==='relay'?{type:'relay',k:clip(w.ref.k,8),by:clip(w.ref.by,16),x:clip(w.ref.x,240)}:null};
  if(w.kind==='card'){const o={kind:'card'};['name','alias','kind2','era','item','from'].forEach(k=>o[k]=clip(w[k],20));o.say=clip(w.say,80);o.ch=chOf(w.ch)?w.ch:'c0';o.shot=Math.max(0,w.shot|0);return o}return null}
/* 自己的後端（v2）。每個請求都有逾時；錯誤帶著後端給的 code。 */
const Api={base:null,v:0,info:null,etag:{},
  async call(path,opt){opt=opt||{};const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),opt.timeout||9000),h=Object.assign({},opt.headers);let body;
    if(opt.body!==undefined){h['content-type']='application/json';body=JSON.stringify(opt.body)}
    let r;try{r=await fetch(this.base+path,{method:opt.method||'GET',headers:h,body,signal:ctl.signal,cache:'no-store'})}catch(e){clearTimeout(tm);const er=new Error('連不上後端，稍後再試');er.code='network';throw er}clearTimeout(tm);
    if(r.status===304)return{status:304,etag:r.headers.get('etag')};const j=await r.json().catch(()=>({}));
    if(!r.ok){const er=new Error(j.error||'後端出了點狀況，稍後再試');er.code=j.code||'server';er.status=r.status;er.data=j;throw er}j.__etag=r.headers.get('etag');return j},
  async probe(){const c=[];try{if(/^https?:$/.test(location.protocol))c.push('')}catch(e){}if(typeof API_URL==='string'&&API_URL)c.push(API_URL.replace(/\/+$/,''));
    for(const b of c){this.base=b;try{const j=await this.call('/api/health',{timeout:6000});if(j&&j.ok&&j.api>=2){this.v=2;this.info=j;return true}}catch(e){}
      try{const j=await this.call('/api/board?k=h33',{timeout:6000});if(j&&Array.isArray(j.items)){this.v=1;this.info={features:['board']};return true}}catch(e){}}this.base=null;return false},
  has(f){return!!(this.info&&Array.isArray(this.info.features)&&this.info.features.indexOf(f)>=0)},
  async list(k,fresh){const h={};if(!fresh&&this.etag[k])h['if-none-match']=this.etag[k];const j=await this.call('/api/board?k='+encodeURIComponent(k)+(fresh?'&fresh='+encodeURIComponent(fresh):''),{headers:h});if(j.status===304)return null;if(j.__etag)this.etag[k]=j.__etag;return Array.isArray(j.items)?j.items:[]},
  async post(k,body){const j=await this.call('/api/board',{method:'POST',body:Object.assign({k,name:clip(Case.d.name,16),o:okey(),hp:''},body)});return j.item},
  async del(k,id){const h={'x-owner':okey()};if(Case.d.admin)h['x-admin-key']=Case.d.admin;await this.call('/api/board?k='+encodeURIComponent(k)+'&id='+encodeURIComponent(id)+(this.v<2?'&o='+encodeURIComponent(okey()):''),{method:'DELETE',headers:h})},
  react(k,id,r){return this.call('/api/react',{method:'POST',body:{k,id,o:okey(),r}})},
  report(k,id){return this.call('/api/report',{method:'POST',body:{k,id,o:okey()}})},
  pulse(){return this.call('/api/pulse')},
  vote(body){return this.call('/api/vote',{method:'POST',body:Object.assign({o:okey()},body)})},
  admin(view){return this.call('/api/admin?view='+encodeURIComponent(view),{headers:{'x-admin-key':Case.d.admin||''}})},
  adminAct(body){return this.call('/api/admin',{method:'POST',headers:{'x-admin-key':Case.d.admin||''},body})}};
const Cl={db:null,uid:null,can:null,owner:false,docs:new Map(),chain:Promise.resolve(),
  async init(){try{if(!window.claude||typeof window.claude.use!=='function')return false;const got=await Promise.all([window.claude.use('db'),window.claude.use('user')]),db=got[0],user=got[1];if(!db)return false;this.db=db;
      if(user){this.uid=await user.id();this.can=await user.can('data.write');this.owner=await user.isOwner()}
      return await new Promise(res=>{let done=false;const fin=v=>{if(!done){done=true;res(v)}},tm=setTimeout(()=>fin(false),10000);
        try{db.collection('board').onSnapshot(snap=>{this.docs.clear();snap.docs.forEach(d=>{const b=d.data();if(b)this.docs.set(d.id,b)});clearTimeout(tm);fin(true);Board.changed()},()=>{clearTimeout(tm);fin(false)})}catch(e){clearTimeout(tm);fin(false)}})}catch(e){return false}},
  items(k){const out=[];this.docs.forEach((b,doc)=>{const name=clip(b&&b.name,16),arr=b&&Array.isArray(b.items)?b.items.slice(0,400):[];arr.forEach(it=>{if(!it||it.k!==k||typeof it.t!=='number')return;const o={id:doc+':'+it.t,k,t:it.t,name,doc,mine:doc===this.uid,src:'claude'};if(k==='gallery'){o.w=cleanWork(it.w);if(!o.w)return}else{if(typeof it.x!=='string'||!it.x)return;o.x=clip(it.x,240)}out.push(o)})});return out},
  write(doc,mut){const run=async()=>{const cur=this.docs.get(doc),items=cur&&Array.isArray(cur.items)?cur.items.slice():[],next=mut(items);await this.db.doc('board/'+doc).set({name:doc===this.uid?clip(Case.d.name,16):clip(cur&&cur.name,16),items:next})};this.chain=this.chain.then(run,run);return this.chain}};
const Board={mode:'local',ready:false,cache:{},subs:new Set(),err:'',gone:{},
  changed(){this.subs.forEach(f=>{try{f()}catch(e){}})},
  async init(){try{if(await Api.probe())this.mode='api';else if(await Cl.init())this.mode='claude'}catch(e){}this.ready=true;this.changed();emit('board',this)},
  canWrite(){return this.mode==='api'||(this.mode==='claude'&&!!Cl.uid&&Cl.can!==false)},
  canMod(it){return it.mine||(this.mode==='api'&&!!Case.d.admin)||(this.mode==='claude'&&Cl.owner)},
  has(f){return this.mode==='api'&&Api.has(f)},
  async load(k,fresh){if(this.mode!=='api')return;try{const r=await Api.list(k,fresh);if(r){this.cache[k]=r;this.err='';this.changed();emit('loaded',k)}else if(this.err){this.err='';this.changed()}}catch(e){this.err='暫時讀不到共用的本子，稍後再試。';this.changed()}},
  shared(k){if(this.mode==='api')return(this.cache[k]||[]).map(it=>{if(this.gone[it.id])return null;const o={id:String(it.id),k,t:+it.t||0,name:clip(it.name,16),mine:!!Case.d.ids[it.id],src:'api',pin:it.pin?1:0};
      if(it.r&&typeof it.r==='object')o.r={a:it.r.a|0,b:it.r.b|0,c:it.r.c|0};if(k==='gallery'){o.w=cleanWork(it.w);if(!o.w)return null}else{if(typeof it.x!=='string'||!it.x)return null;o.x=clip(it.x,k==='theory'?400:240);if(k==='theory')o.q=clip(it.q,4)}return o}).filter(Boolean);
    if(this.mode==='claude')return Cl.items(k);return[]},
  async post(k,body){if(this.mode==='api'){const it=await Api.post(k,body);if(it&&it.id){Case.d.ids[it.id]=1;Case.save()}await this.load(k,(it&&it.id)||Date.now());emit('posted',{k,item:it});return it}
    if(this.mode==='claude'){if(!Cl.uid)throw new Error('這個連結沒有給你身分，沒辦法寫進共用的本子。');try{await Cl.write(Cl.uid,items=>items.concat([Object.assign({k,t:Date.now()},body)]).slice(-400))}catch(e){if(e&&e.code==='invalid_argument'){Cl.can=false;this.changed();throw new Error('你目前只能閱讀共用的本子。')}throw new Error('寫入失敗，請稍後再試。')}return}
    throw new Error('local')},
  async remove(it){if(it.src==='api'){await Api.del(it.k,it.id);delete Case.d.ids[it.id];Case.save();this.gone[it.id]=1;this.changed();await this.load(it.k,'d'+Date.now())}else if(it.src==='claude'){await Cl.write(it.doc,items=>items.filter(x=>!(x&&x.k===it.k&&x.t===it.t)))}},
  patch(k,id,f){const a=this.cache[k];if(!a)return;const it=a.find(x=>String(x.id)===String(id));if(it){f(it);this.changed()}}};

/* ---------- 接龍 ---------- */
let relayK=RELAYS[0].k,relayBuilt=false;
function relayMode(){const p=$('relay-mode');p.classList.toggle('live',Board.mode!=='local');
  p.textContent=!Board.ready?'正在找共用的接龍本…':Board.mode==='local'?'單機模式。你寫的段落只留在這台裝置；館方接上共用的本子之後，才輪得到別人接。':Board.canWrite()?'共用的本子接上了。你寫下的，進館的人都讀得到。':'共用的本子接上了，但你目前只能讀。寫下的先留在這台裝置。';if(Board.err)p.textContent+='　'+Board.err}
function relayPaint(){if(A.cur!=='relay')return;relayMode();const R=RELAYS.find(r=>r.k===relayK),box=$('chain');$('relay-t').textContent=R.t;$('relay-meta').textContent=R.meta;box.textContent='';
  const seed=el('li','seed'),sb=el('div'),sw=el('div','who');sw.append(el('b','','館方開頭'));sb.append(sw,el('p','',R.seed));seed.append(sb);box.append(seed);
  const all=Board.shared(relayK).concat((Case.d.relay[relayK]||[]).map(l=>({id:'L'+l.t,k:relayK,t:l.t,x:l.x,name:Case.d.name,mine:true,src:'local'}))).sort((a,b)=>a.t-b.t);emit('relayHead',{k:relayK,R,all});
  all.forEach(it=>{const li=el('li'),b=el('div'),w=el('div','who');w.append(el('b','',it.name||'無名的司辰'),el('span','',fmtDate(it.t)));if(it.src==='local')w.append(el('span','tagx','只在這台裝置'));else if(it.mine)w.append(el('span','tagx','你'));
    const ops=el('div','ops'),dv=el('button','tiny','拿去創作坊衍生');dv.onclick=()=>{window.__studioRef={relay:relayK,by:it.name||'無名的司辰',x:it.x};location.hash='studio'};ops.append(dv);
    if(Board.canMod(it)||it.src==='local'){const rm=el('button','tiny','刪除');rm.onclick=async()=>{if(rm.dataset.sure!=='1'){rm.dataset.sure='1';rm.textContent='確定刪除';return}try{if(it.src==='local'){Case.d.relay[relayK]=(Case.d.relay[relayK]||[]).filter(l=>l.t!==it.t);Case.save();relayPaint()}else await Board.remove(it);toast('已刪除')}catch(e){toast(e.message||'刪除失敗')}};ops.append(rm)}
    b.append(w,el('p','',it.x),ops);li.append(b);li.dataset.id=it.id;box.append(li);emit('item',{it,li,body:b,ops,kind:'relay'})});emit('relayPainted',{k:relayK,n:all.length})}
enter.relay=function(arg){if(arg&&RELAYS.some(r=>r.k===arg))relayK=arg;
  if(!relayBuilt){relayBuilt=true;const tabs=$('relay-tabs');RELAYS.forEach(r=>{const b=el('button','',r.t);b.dataset.k=r.k;b.onclick=()=>{relayK=r.k;tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));relayPaint();Board.load(relayK)};tabs.append(b)});
    const ta=$('relay-x');ta.addEventListener('input',()=>{$('relay-n').textContent=ta.value.length+' ／ 240'});
    $('relay-form').addEventListener('submit',async e=>{e.preventDefault();const x=ta.value.trim().slice(0,240);if(!x){toast('先寫下一段');ta.focus();return}const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
      let keep=false;try{if(Board.canWrite()){await Board.post(relayK,{x});toast('接上了')}else throw new Error('local')}catch(err){const c=err&&err.code;
        if(c==='rate_limited'||c==='duplicate'||c==='banned'||c==='too_large'){keep=true;toast(err.message)}
        else{(Case.d.relay[relayK]=Case.d.relay[relayK]||[]).push({t:Date.now(),x});Case.save();toast(err.message==='local'?'接上了，存在這台裝置':err.message+' 這一段先存在這台裝置。')}}
      if(!keep){ta.value='';$('relay-n').textContent='0 ／ 240';emit('relaySent',{k:relayK})}btn.disabled=false;relayPaint()});Board.subs.add(relayPaint)}
  $('relay-tabs').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===relayK?'true':'false'));relayPaint();Board.load(relayK)};

/* ---------- 創作坊 ---------- */
let stTab='write',stBuilt=false,stRef=null;
const refLine=r=>!r?'':r.type==='plate'?'底片　'+chOf(r.ch).no+'〈'+chOf(r.ch).zh+'〉PL.'+pad(r.shot+1):'衍生自　'+(r.k==='gallery'?'展牆':'接龍〈'+((RELAYS.find(x=>x.k===r.k)||{}).t||'')+'〉')+'　'+(r.by||'無名的司辰');
const shotsOf=id=>chOf(id).shots.filter(s=>s.cues&&s.cues.length);
function workEl(w){if(w.kind==='card'){const c=el('div','ocard'),cv=el('canvas');cv.width=400;cv.height=440;const b=el('div','body');b.append(el('span','fno','FILE NO. '+(hashStr((w.name||'')+(w.alias||''))%9000+1000)+'　'+(w.era||'')),el('h4','',w.name||'未命名'));if(w.alias)b.append(el('div','alias',w.alias));
    const dl=el('dl');[['身分',w.kind2],['來自',w.from],['隨身物',w.item]].forEach(x=>{if(x[1])dl.append(el('dt','',x[0]),el('dd','',x[1]))});b.append(dl);if(w.say)b.append(el('p','say',w.say));c.append(cv,b);const sh=shotsOf(w.ch),s=sh[min(sh.length-1,w.shot|0)];setTimeout(()=>Plates.still(cv,s),30);return c}
  const p=el('div','piece');p.append(el('h4','',w.title||'無題'));if(w.ref)p.append(el('div','ref',refLine(w.ref)));if(w.ref&&w.ref.type==='relay'&&w.ref.x)p.append(el('div','quote',w.ref.x));p.append(el('p','',w.text));return p}
const workText=w=>w.kind==='card'?'【人物檔案】'+(w.name||'未命名')+(w.alias?'（'+w.alias+'）':'')+'\n年代：'+(w.era||'')+'\n身分：'+(w.kind2||'')+'\n來自：'+(w.from||'')+'\n隨身物：'+(w.item||'')+'\n'+(w.say||''):'《'+(w.title||'無題')+'》\n'+(w.ref?refLine(w.ref)+'\n':'')+'\n'+w.text;
function selCh(id){const s=el('select','inp');s.id=id;CH.forEach(c=>{const o=el('option','',c.no+'　'+c.zh);o.value=c.id;s.append(o)});return s}
function selShot(id,ch){const s=el('select','inp');s.id=id;fillShots(s,ch);return s}
function fillShots(s,ch){s.textContent='';shotsOf(ch).forEach((x,i)=>{const o=el('option','','PL.'+pad(i+1)+'　'+clip(x.cues[0],14)+'…');o.value=i;s.append(o)})}
const fld=(label,node)=>{const l=el('label','fld',label);l.htmlFor=node.id;const w=el('div','fld');w.append(l,node);return w};
function studioPaint(){if(A.cur!=='studio')return;const tabs=$('studio-tabs'),body=$('studio-body');tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.t===stTab?'true':'false'));body.textContent='';
  if(stTab==='write'){const wrap=el('div','studio'),L=el('div'),F=el('form');let ref=stRef&&stRef.relay?{type:'relay',k:stRef.relay,by:stRef.by,x:stRef.x}:{type:'plate',ch:(stRef&&stRef.ch)||Case.d.last||'c0',shot:(stRef&&stRef.shot)||0};
    const fig=el('figure','plate'),cv=el('canvas');cv.width=960;cv.height=600;fig.append(cv);const cap=el('div','cap'),capL=el('span');cap.append(capL);
    const drawRef=()=>{L.textContent='';if(ref.type==='plate'){L.append(fig,cap);const sh=shotsOf(ref.ch);ref.shot=min(sh.length-1,ref.shot);Plates.mount(cv,sh[ref.shot]);capL.textContent=refLine(ref)}else{L.append(el('span','lab',refLine(ref)),el('div','quote',ref.x));const sw=el('button','tiny','改成題寫底片');sw.type='button';sw.onclick=()=>{stRef=null;studioPaint()};L.append(sw)}};
    if(ref.type==='plate'){const sc=selCh('w-ch'),ss=selShot('w-shot',ref.ch);sc.value=ref.ch;ss.value=ref.shot;sc.onchange=()=>{ref.ch=sc.value;ref.shot=0;fillShots(ss,ref.ch);drawRef()};ss.onchange=()=>{ref.shot=+ss.value;drawRef()};const r2=el('div','row-2');r2.append(fld('章節',sc),fld('底片',ss));F.append(r2)}
    const ti=el('input','inp');ti.id='w-title';ti.maxLength=30;ti.placeholder='標題';ti.autocomplete='off';const tx=el('textarea','field');tx.id='w-text';tx.rows=8;tx.maxLength=1200;tx.placeholder=ref.type==='plate'?'看著這張底片，寫你的版本。一段獨白，一封信，一個沒被記下的瞬間。':'從這一段往下寫。';
    const sv=el('button','btn pri','收進創作本');sv.type='submit';const row=el('div','save-row');row.append(sv);F.append(fld('標題',ti),fld('內文',tx),row);
    F.addEventListener('submit',e=>{e.preventDefault();const text=tx.value.trim();if(!text){toast('內文還是空的');tx.focus();return}Case.d.works.unshift({id:Date.now(),kind:'piece',ts:Date.now(),title:ti.value.trim().slice(0,30),text:text.slice(0,1200),ref:Object.assign({},ref)});Case.save();stRef=null;stTab='book';toast('已收進創作本');emit('made',{kind:'piece'});studioPaint()});
    wrap.append(L,F);body.append(wrap);drawRef();return}
  if(stTab==='card'){const wrap=el('div','studio'),L=el('div'),F=el('form'),w={kind:'card',name:'',alias:'',kind2:'神秘學家',era:ERAS[3],item:'',from:'',say:'',ch:'c1',shot:0};
    const inp=(id,ph,max,key)=>{const i=el('input','inp');i.id=id;i.placeholder=ph;i.maxLength=max;i.autocomplete='off';i.oninput=()=>{w[key]=i.value.trim();prev()};return i};
    const k2=el('select','inp');k2.id='c-kind';['神秘學家','人類','還不確定'].forEach(x=>k2.append(el('option','',x)));k2.onchange=()=>{w.kind2=k2.value;prev()};
    const er=el('select','inp');er.id='c-era';ERAS.forEach(x=>er.append(el('option','',x)));er.value=w.era;er.onchange=()=>{w.era=er.value;prev()};
    const sc=selCh('c-ch'),ss=selShot('c-shot',w.ch);sc.value=w.ch;sc.onchange=()=>{w.ch=sc.value;w.shot=0;fillShots(ss,w.ch);prev()};ss.onchange=()=>{w.shot=+ss.value;prev()};
    const r1=el('div','row-2');r1.append(fld('名字',inp('c-name','名字',12,'name')),fld('代號或稱號',inp('c-alias','例如：守夜人',16,'alias')));const r2=el('div','row-2');r2.append(fld('身分',k2),fld('年代',er));
    const r3=el('div','row-2');r3.append(fld('來自',inp('c-from','地點',20,'from')),fld('隨身物',inp('c-item','一樣東西',20,'item')));const r4=el('div','row-2');r4.append(fld('封面：章節',sc),fld('封面：底片',ss));
    const sv=el('button','btn pri','收進創作本');sv.type='submit';const row=el('div','save-row');row.append(sv);F.append(r1,r2,r3,fld('一句話',inp('c-say','這個人最常說的話，或別人怎麼形容他',80,'say')),r4,row,el('p','hint','自創人物是你的創作，不屬於遊戲設定。'));
    function prev(){L.textContent='';L.append(workEl(w))}
    F.addEventListener('submit',e=>{e.preventDefault();if(!w.name){toast('先替他取個名字');$('c-name').focus();return}Case.d.works.unshift(Object.assign({id:Date.now(),ts:Date.now()},w));Case.save();stTab='book';toast('檔案卡已收進創作本');emit('made',{kind:'card'});studioPaint()});
    wrap.append(L,F);body.append(wrap);prev();return}
  if(stTab==='book'){const ws=Case.d.works;if(!ws.length){body.append(el('p','empty','創作本還是空的。從「題寫底片」或「人物檔案卡」開始。'));return}const grid=el('div','works');
    ws.forEach(w=>{const box=el('div','work');box.append(workEl(w));const ops=el('div','ops'),cp=el('button','tiny','複製文字'),rm=el('button','tiny','刪除');cp.onclick=()=>copyText(workText(w));
      rm.onclick=()=>{if(rm.dataset.sure!=='1'){rm.dataset.sure='1';rm.textContent='確定刪除';return}Case.d.works=Case.d.works.filter(x=>x.id!==w.id);Case.save();studioPaint()};ops.append(cp);
      if(Board.canWrite()){const pb=el('button','tiny','展出到展牆');pb.onclick=async()=>{pb.disabled=true;try{await Board.post('gallery',{w:cleanWork(w)});toast('已展出')}catch(e){toast(e.message||'展出失敗')}pb.disabled=false};ops.append(pb)}ops.append(rm);box.append(ops);grid.append(box);emit('work',{w,box,ops})});body.append(grid);return}
  const note=el('p','mode'+(Board.mode!=='local'?' live':''),!Board.ready?'正在找共用的展牆…':Board.mode==='local'?'展牆要等共用的後端接上。眼下是單機，作品先收在你的創作本。':'牆上是各位司辰掛出來的作品。想掛自己的，到創作本按「展出到展牆」。');body.append(note);
  const items=Board.shared('gallery').sort((a,b)=>(b.pin-a.pin)||(b.t-a.t));emit('wallHead',{body,items});if(Board.mode!=='local'&&!items.length)body.append(el('p','empty','牆還是空的。'));const grid=el('div','works');
  items.forEach(it=>{const box=el('div','work');box.append(el('span','lab',(it.name||'無名的司辰')+'　'+fmtDate(it.t)),workEl(it.w));const ops=el('div','ops'),dv=el('button','tiny','衍生一篇');
    dv.onclick=()=>{stRef={relay:'gallery',by:it.name||'無名的司辰',x:it.w.kind==='card'?'人物檔案：'+it.w.name+(it.w.say?'　'+it.w.say:''):(it.w.title?'《'+it.w.title+'》':'')+clip(it.w.text,200)};stTab='write';studioPaint();window.scrollTo(0,0)};ops.append(dv);
    if(Board.canMod(it)){const rm=el('button','tiny','撤下');rm.onclick=async()=>{if(rm.dataset.sure!=='1'){rm.dataset.sure='1';rm.textContent='確定撤下';return}try{await Board.remove(it);toast('已撤下')}catch(e){toast(e.message||'撤下失敗')}};ops.append(rm)}box.append(ops);grid.append(box);emit('item',{it,li:box,body:box,ops,kind:'wall'})});body.append(grid)}
enter.studio=function(arg){if(['write','card','book','wall'].indexOf(arg)>=0)stTab=arg;if(!stBuilt){stBuilt=true;const tabs=$('studio-tabs');[['write','題寫底片'],['card','人物檔案卡'],['book','創作本'],['wall','展牆']].forEach(t=>{const b=el('button','',t[1]);b.dataset.t=t[0];b.onclick=()=>{stTab=t[0];if(stTab==='wall')Board.load('gallery');studioPaint()};tabs.append(b)});Board.subs.add(()=>{if(stTab==='wall'||stTab==='book')studioPaint()})}
  if(window.__studioRef){stRef=window.__studioRef;window.__studioRef=null;stTab='write'}studioPaint();if(stTab==='wall')Board.load('gallery')};

/* ---------- 手提箱 ---------- */
let caseBuilt=false;
function casePaint(){const d=Case.d;$('id-no').textContent='NO. '+String(d.since).slice(-6);$('id-name').value=d.name;const dl=$('id-dl');dl.textContent='';
  [['到任',fmtDate(d.since)],['來訪',d.visits+' 天'],['所屬雨次',d.mine?ORD[d.mine.storm]:'尚未測定'],['章節戳記',Object.keys(d.read).length+' ／ 14']].forEach(x=>{const w=el('div');w.append(el('dt','',x[0]),el('dd','',x[1]));dl.append(w)});
  const st=$('stamps');st.textContent='';CH.forEach(c=>{const a=el('a',d.read[c.id]?'got':'',c.no);a.href='#'+c.id;a.append(el('small','',d.read[c.id]?fmtDate(d.read[c.id]):c.zh.slice(0,5)));a.title=c.no+' '+c.zh;st.append(a)});
  const li=(k,t,href,sub)=>{const l=el('li');l.append(el('span','k',k));const a=href?el('a','',t):el('span','',t);if(href)a.href=href;l.append(a);if(sub)l.append(el('span','',sub));return l};
  const pins=$('case-pins');pins.textContent='';const pk=QS.filter(q=>d.pins[q.id]);if(!pk.length)pins.append(el('li','empty','還沒有收藏。到「未解之謎」挑幾張卡片。'));pk.forEach(q=>pins.append(li('Q.'+pad(QS.indexOf(q)+1),q.q,'#questions',d.theories[q.id]?'我的推測：'+d.theories[q.id]:'')));
  const play=$('case-play');play.textContent='';if(d.mine)play.append(li('你的暴雨',ORD[d.mine.storm]+'暴雨　'+SD[d.mine.storm].f+' → '+SD[d.mine.storm].t,'#rain','帶走的是：'+d.mine.item));else play.append(li('你的暴雨','還沒有紀錄','#rain'));
  const nc=Object.keys(d.choices).length,same=SC.filter(s=>s.canon&&d.choices[s.id]===s.canon).length;play.append(li('司辰的抉擇',nc?'已選 '+nc+' ／ 8':'還沒開始','#choices',nc===SC.length?'七次可對照的抉擇裡，'+same+' 次和她走了同一條路。':''));
  const notes=$('case-notes');notes.textContent='';const nk=CH.filter(c=>d.notes[c.id]);if(!nk.length)notes.append(el('li','empty','還沒有手記。每一間展間的最底下，都留了一格。'));nk.forEach(c=>notes.append(li(c.no,c.zh,'#'+c.id,d.notes[c.id])));
  const wk=$('case-works');wk.textContent='';wk.append(li('創作本',d.works.length?d.works.length+' 件作品':'還是空的','#studio'));const rn=RELAYS.reduce((n,r)=>n+(d.relay[r.k]||[]).length,0);wk.append(li('接龍',rn?'存在這台裝置的有 '+rn+' 段':'還沒有只存在本機的段落','#relay'));
  $('store-note').textContent=Case.ok?'箱子放在這台裝置的瀏覽器裡。要換裝置，或要清瀏覽資料，先產生存檔代碼帶走。':'這個瀏覽器不讓本館存東西。頁面一關，箱子就空了。走之前，先產生存檔代碼帶走。';emit('case',{d})}
enter.case=function(){if(!caseBuilt){caseBuilt=true;$('id-name').addEventListener('input',e=>{Case.d.name=e.target.value.trim().slice(0,16);Case.save()});
    $('exp-btn').onclick=()=>{const t=$('exp-code');t.hidden=false;t.value=Case.code();$('exp-copy').hidden=false};$('exp-copy').onclick=()=>copyText($('exp-code').value,$('exp-code'));
    $('imp-btn').onclick=()=>{const ok=Case.read($('imp-code').value);$('imp-msg').textContent=ok?'匯入完成。':'這不是有效的存檔代碼。';if(ok){$('imp-code').value='';badge();casePaint();veil(true)}};
    const w=$('wipe-btn'),y=$('wipe-yes'),n=$('wipe-no'),set=on=>{w.hidden=on;y.hidden=!on;n.hidden=!on};w.onclick=()=>set(true);n.onclick=()=>set(false);
    y.onclick=()=>{const keep={okey:Case.d.okey,ids:Case.d.ids,admin:Case.d.admin,x:{}};emit('wipe',{keep,old:Case.d});Case.d=Object.assign(Case.blank(),keep,{visits:1,day:dayKey()});Case.flush();set(false);badge();veil(true);casePaint();toast('手提箱清空了')}}
  casePaint()};

/* ---------- 開機 ---------- */
[['chronicle','年表'],['chapters','章節'],['film','放映'],['choices','抉擇'],['rain','你的暴雨'],['relay','接龍'],['studio','創作坊'],['quiz','考核'],['index','索引'],['questions','謎題']].forEach(n=>{const x=el('a','',n[1]);x.href='#'+n[0];x.dataset.k=n[0];$('nav-links').append(x)});
$('b-toc').onclick=()=>{roomRows($('toc-list'),'toc');$('toc').hidden=false;$('toc-x').focus()};$('toc-x').onclick=()=>{$('toc').hidden=true;$('b-toc').focus()};
$('toc-list').addEventListener('click',e=>{if(e.target.closest('a'))$('toc').hidden=true});
$('era-prev').onclick=()=>setEra(Case.d.era-1);$('era-next').onclick=()=>setEra(Case.d.era+1);$('st-prev').onclick=()=>setEra(Case.d.era-1);$('st-next').onclick=()=>setEra(Case.d.era+1);
$('chart').addEventListener('click',e=>{const g=e.target.closest('.st');if(g)setEra(+g.dataset.i)});$('chart').addEventListener('keydown',e=>{const g=e.target.closest('.st');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setEra(+g.dataset.i)}});
let rsT=0;window.addEventListener('resize',()=>{clearTimeout(rsT);rsT=setTimeout(()=>{if(A.cur==='chronicle'){chartDraw();stormPaint()}},150)});
window.addEventListener('hashchange',route);window.addEventListener('pagehide',()=>Case.flush());
function boot(data){Case.load();const k=dayKey();if(Case.d.day!==k){Case.d.day=k;Case.d.visits++;Case.save()}badge();emit('ready');if(data&&data.route&&!location.hash)try{history.replaceState(null,'','#'+data.route)}catch(e){}route();requestAnimationFrame(loop);Board.init()}
Object.assign(A,{Board,Api,Cl,okey,cleanWork,workEl,workText,refLine,shotsOf,relayPaint,studioPaint,scPaint,casePaint,chartDraw,stormPaint,nearestStorm});
Object.defineProperty(A,'relayK',{get:()=>relayK});
/* 開機交給最後一個檔案（boot.js），讓其他檔案先掛上事件 */
A.start=function(){if(A.started)return;A.started=true;if(window.claude&&window.claude.hot&&window.claude.hot.ready)window.claude.hot.ready(boot);else boot((window.claude&&window.claude.hot&&window.claude.hot.data)||{})};
})();
