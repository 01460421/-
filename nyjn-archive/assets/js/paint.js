'use strict';
/* ---------- 繪圖工具 ---------- */
const TAU=Math.PI*2,{sin,cos,abs,min,max,floor,round,pow,sqrt,PI,atan2}=Math;
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
const sm=t=>{t=clamp(t);return t*t*(3-2*t)}, eo=t=>1-pow(1-clamp(t),3);
const fr=x=>x-floor(x), hh=(i,k=0)=>fr(sin(i*127.1+k*311.7+1.3)*43758.5453), mod=(a,n)=>((a%n)+n)%n;
const _rg={};
const rgba=(h,a)=>{let v=_rg[h];if(!v){const n=parseInt(h.slice(1),16);v=_rg[h]=[(n>>16)&255,(n>>8)&255,n&255].join(',')}return 'rgba('+v+','+clamp(a)+')'};
const MONO='"Courier Prime","Courier New",monospace',SERIF='"NiYu","Noto Serif TC","Noto Serif CJK TC",serif',FELL='"IM Fell English",Georgia,serif';

function sky(c,W,H,cols,y0=0,y1=H){const g=c.createLinearGradient(0,y0,0,y1);cols.forEach((k,i)=>g.addColorStop(i/(cols.length-1),k));c.fillStyle=g;c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2)}
function glow(c,x,y,r,col,al=1){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(col,al));g.addColorStop(.4,rgba(col,al*.35));g.addColorStop(1,rgba(col,0));c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
function poly(c,p,fill,stroke,lw){c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke()}}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function line(c,x0,y0,x1,y1,col,lw){c.strokeStyle=col;c.lineWidth=lw;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke()}
function txt(c,s,x,y,px,col,o={}){c.font=(o.w||400)+' '+(o.it?'italic ':'')+max(4,round(px))+'px '+(o.f||MONO);c.textAlign=o.al||'center';c.textBaseline=o.bl||'middle';c.fillStyle=col;c.fillText(s,x,y)}

function rain(c,off,W,H,u,o={}){const n=o.n||150,L=(o.len||7)*u,sp=(o.sp||1)*H*.85,col=o.col||'#bfe6ee',al=o.al??.5,wd=o.wind||0,sd=o.seed||0;
  c.lineCap='round';
  for(let b=0;b<3;b++){c.beginPath();c.strokeStyle=rgba(col,al*(.3+.35*b));c.lineWidth=u*(.07+.06*b);
    for(let i=b;i<n;i+=3){const z=.4+hh(i,sd+4)*.6+b*.2,x=hh(i,sd+1)*W*1.2-W*.1,l=L*z,v=sp*(.55+hh(i,sd+2)*.7)*z;
      const y=mod(hh(i,sd+3)*(H+l*2)+off*v,H+l*2)-l;c.moveTo(x,y);c.lineTo(x+wd*l,y+l)}
    c.stroke()}}
function stars(c,t,W,H,u,o={}){const n=o.n||120,sd=o.seed||7,col=o.col||'#ffffff',yb=(o.y1??.7)*H;
  for(let i=0;i<n;i++){const x=hh(i,sd)*W*1.1-W*.05,y=hh(i,sd+1)*yb,s=hh(i,sd+2),a=(.25+.75*s)*(.6+.4*sin(t*(.6+s*2)+i))*(o.al??1);
    c.fillStyle=rgba(col,a);const r=u*(.06+.14*s*s);c.fillRect(x-r,y-r,r*2,r*2)}}
function snow(c,t,W,H,u,o={}){const n=o.n||120,sd=o.seed||11,col=o.col||'#ffffff',sp=o.sp||1,wd=o.wind||0;
  for(let i=0;i<n;i++){const z=.3+hh(i,sd)*.7,v=H*.09*sp*(.5+z),y=mod(hh(i,sd+1)*H+t*v*(o.dir||1),H*1.04)-H*.02,
      x=mod(hh(i,sd+2)*W+sin(t*.7+i)*u*2+t*wd*W*.05*z,W*1.04)-W*.02;c.fillStyle=rgba(col,(o.al??.8)*z);c.beginPath();c.arc(x,y,u*(.08+.16*z),0,TAU);c.fill()}}
function embers(c,t,W,H,u,o={}){const n=o.n||60,sd=o.seed||5,col=o.col||'#ffb45a',x0=o.x0??0,x1=o.x1??W,yb=o.y??H;
  for(let i=0;i<n;i++){const life=fr(hh(i,sd)+t*(.05+hh(i,sd+1)*.12)),x=lerp(x0,x1,hh(i,sd+2))+sin(t*1.3+i*2)*u*3*life,y=yb-life*H*(o.h||.6);
    c.fillStyle=rgba(col,(1-life)*(o.al??.9));const r=u*(.08+.12*hh(i,sd+3));c.fillRect(x-r,y-r,2*r,2*r)}}
function skyline(c,t,W,H,u,o){const base=o.base,sd=o.seed||1,col=o.col||'#04070b';let x=-u*8,i=0;
  while(x<W+u*8&&i<400){const w=lerp(o.minW||4,o.maxW||10,hh(i,sd))*u,h=lerp(o.minH||6,o.maxH||28,pow(hh(i,sd+1),o.pw||1.6))*u,top=base-h;
    c.fillStyle=col;c.fillRect(x,top,w+1,h+(o.drop||0));
    if(o.deco){const k=hh(i,sd+2);if(k>.45)c.fillRect(x+w*.18,top-h*.12,w*.64,h*.12+1);if(k>.72){c.fillRect(x+w*.34,top-h*.22,w*.32,h*.12);c.fillRect(x+w*.48,top-h*.4,max(1,w*.05),h*.19)}}
    if(o.dome&&hh(i,sd+5)>.78){c.beginPath();c.arc(x+w/2,top,w*.4,PI,0);c.fill();c.fillRect(x+w/2-u*.1,top-w*.8,u*.2,w*.45)}
    if(o.gable&&hh(i,sd+5)<=.78)poly(c,[x-1,top+1,x+w/2,top-w*.38,x+w+1,top+1],col);
    if(o.win){const cw=u*1.15,ch=u*1.6;c.fillStyle=o.win;let wi=0;
      for(let wx=x+cw*.6;wx<x+w-cw*.8;wx+=cw)for(let wy=top+ch*.7;wy<base-ch*.6;wy+=ch){const id=i*197+(wi++);
        if(hh(id,sd+3)<(o.lit||.25)){c.globalAlpha=(o.wa||.9)*(.6+.4*sin(t*.4+id))*(hh(id,9)>.96?(.5+.5*sin(t*9+id)):1);c.fillRect(wx,wy,cw*.42,ch*.5)}}
      c.globalAlpha=1}
    if(o.peel){for(let k=0;k<3;k++){const ph=fr(hh(i*3+k,sd+6)+t*(.08+.07*hh(i,k+20))),px=x+hh(i*3+k,sd+7)*w,py=top-ph*H*.35,s=u*(.9-.6*ph);c.fillStyle=rgba(o.pc||'#0a0f14',1-ph);c.fillRect(px,py,s,s*1.3)}}
    x+=w+(o.gap||0)*u*hh(i,sd+8);i++}}
function ridge(c,W,H,o){const b=o.base,a=o.amp,sd=o.seed||1,f=o.f||1;c.beginPath();c.moveTo(-W*.1,H*1.2);
  for(let x=-W*.1;x<=W*1.11;x+=W/70){const n=x/W*f;c.lineTo(x,b-a*(.5*sin(n*3.1+sd)+.3*sin(n*7.3+sd*2.1)+.2*sin(n*15.7+sd*3.7)+(o.sharp?.3*abs(sin(n*11+sd)):0)))}
  c.lineTo(W*1.1,H*1.2);c.closePath();c.fillStyle=o.col;c.fill()}
function fog(c,t,W,H,o){const n=o.n||5,col=o.col||'#ffffff',sd=o.seed||2;for(let i=0;i<n;i++){const y=o.y+(hh(i,sd)-.5)*o.h,x=mod(hh(i,sd+1)*W*1.6+t*W*.012*(.5+hh(i,3))*(o.sp||1),W*1.8)-W*.4,rx=W*(.35+.4*hh(i,4)),ry=o.h*(.35+.3*hh(i,5));
    c.save();c.translate(x,y);c.scale(1,ry/rx);const g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,rgba(col,o.al||.18));g.addColorStop(1,rgba(col,0));c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore()}}
function water(c,t,W,H,u,o){const y=o.y,g=c.createLinearGradient(0,y,0,H);g.addColorStop(0,o.c1);g.addColorStop(1,o.c2);c.fillStyle=g;c.fillRect(-W*.1,y,W*1.2,H*1.2-y);
  const n=o.n||70;c.fillStyle=o.gl||'#ffffff';for(let i=0;i<n;i++){const d=pow(hh(i,31),1.8),yy=y+d*(H-y),w=u*(1+6*d)*(.4+hh(i,32)),x=mod(hh(i,33)*W+sin(t*.5+i)*u*4+t*u*(o.flow||0)*(1+d*3),W*1.1)-W*.05;c.globalAlpha=(o.al||.25)*(.3+.7*abs(sin(t*(.8+hh(i,34))+i)));c.fillRect(x,yy,w,max(1,u*.08*(1+d*2)))}c.globalAlpha=1}
function birds(c,t,W,H,u,o){const n=o.n||9;c.strokeStyle=o.col||'#111111';c.lineWidth=u*.16;c.lineCap='round';c.beginPath();
  for(let i=0;i<n;i++){const a=t*(.25+hh(i,41)*.3)*(o.sp||1)+i*2.4,r=o.r*(.4+hh(i,42)*.9),x=o.x+cos(a)*r,y=o.y+sin(a*1.3)*r*.35,s=u*(.5+hh(i,43)*.6)*(o.s||1),f=sin(t*7+i)*.5;
    c.moveTo(x-s,y-s*f);c.quadraticCurveTo(x-s*.4,y-s*.5*f-s*.2,x,y);c.quadraticCurveTo(x+s*.4,y-s*.5*f-s*.2,x+s,y-s*f)}c.stroke()}
function flame(c,x,y,s,t,i=0,col='#ffcf7a',stretch=1){const f=(1+.12*sin(t*9+i*3)+.08*sin(t*17+i))*stretch,w=s*.45*(1+.1*sin(t*13+i));glow(c,x,y-s*.5,s*4.5,col,.3);
  c.fillStyle=col;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x-w,y-s*.3,x-w*.6,y-s*.8*f,x+sin(t*5+i)*s*.08,y-s*1.5*f);c.bezierCurveTo(x+w*.6,y-s*.8*f,x+w,y-s*.3,x,y);c.fill();
  c.fillStyle='#fff6dc';c.beginPath();c.ellipse(x,y-s*.35,w*.35,s*.3,0,0,TAU);c.fill()}
function cloud(c,x,y,s,col,edge){for(let k=0;k<7;k++){const a=k/6,cx=x+(a-.5)*s*2.4,r=s*(.45+.4*sin(a*PI)+.12*hh(k,x|0));if(edge){c.fillStyle=edge;c.beginPath();c.arc(cx,y-r*.55,r*1.04,0,TAU);c.fill()}c.fillStyle=col;c.beginPath();c.arc(cx,y-r*.5,r,0,TAU);c.fill()}c.fillStyle=col;c.fillRect(x-s*1.5,y-s*.5,s*3,s*.5)}
function tree(c,x,y,s,col,seed=1,dead){c.strokeStyle=col;c.lineCap='round';const br=(x0,y0,a,l,w,d)=>{const x1=x0+cos(a)*l,y1=y0+sin(a)*l;c.lineWidth=w;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();if(d>0){const k=hh(d*7+seed,x0|0);br(x1,y1,a-.35-.3*k,l*.68,w*.62,d-1);br(x1,y1,a+.3+.3*(1-k),l*.62,w*.6,d-1)}};
  br(x,y,-PI/2+(hh(seed,3)-.5)*.2,s,s*.13,dead?3:4)}
const P={};
/* ---------- 場景：片頭至第四章 ---------- */
function wetGround(c,t,W,H,u,hz,c1='#081116',c2='#020405',rc='#9fd3dc'){const g=c.createLinearGradient(0,hz,0,H);g.addColorStop(0,c1);g.addColorStop(1,c2);c.fillStyle=g;c.fillRect(-W*.1,hz,W*1.2,H*1.2-hz);
  c.lineWidth=u*.08;for(let i=0;i<26;i++){const ph=fr(hh(i,71)+t*(.25+.2*hh(i,72))),d=pow(hh(i,73),1.5),x=hh(i,74)*W,y=hz+u+d*(H-hz),r=u*(1+7*d)*ph;c.strokeStyle=rgba(rc,(1-ph)*.35);c.beginPath();c.ellipse(x,y,r,r*.25,0,0,TAU);c.stroke()}}
function maskDraw(c,cx,cy,s,t,rib){c.fillStyle='#e8e0cf';c.beginPath();c.ellipse(cx,cy,s*.72,s,0,0,TAU);c.fill();
  c.fillStyle='rgba(90,78,62,.38)';c.beginPath();c.ellipse(cx+s*.2,cy,s*.52,s*.98,0,-PI/2,PI/2);c.fill();
  c.fillStyle='#120406';[-1,1].forEach(d=>{c.beginPath();c.ellipse(cx+d*s*.3,cy-s*.18,s*.2,s*.075,d*.18,0,TAU);c.fill()});
  c.strokeStyle='rgba(18,4,6,.55)';c.lineWidth=max(1,s*.03);c.beginPath();c.moveTo(cx,cy-s);c.lineTo(cx-s*.06,cy-s*.55);c.lineTo(cx+s*.03,cy-s*.32);c.stroke();c.beginPath();c.moveTo(cx-s*.14,cy+s*.5);c.lineTo(cx+s*.14,cy+s*.5);c.stroke();
  if(rib){c.strokeStyle='#5a1016';c.lineWidth=s*.07;[-1,1].forEach(d=>{c.beginPath();c.moveTo(cx+d*s*.7,cy-s*.15);c.quadraticCurveTo(cx+d*s*1.5,cy+s*.2+sin(t+d)*s*.1,cx+d*s*1.2,cy+s*1.5);c.stroke()})}}
function gear(c,x,y,r,n,rot,col){c.fillStyle=col;c.beginPath();for(let k=0;k<n*2;k++){const an=k/(n*2)*TAU+rot,q=k%2?r:r*.72;k?c.lineTo(x+cos(an)*q,y+sin(an)*q):c.moveTo(x+cos(an)*q,y+sin(an)*q)}c.closePath();c.fill()}
function dove(c,x,y,s,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,s*.6,s*.34,-.2,0,TAU);c.fill();c.beginPath();c.arc(x+s*.5,y-s*.32,s*.2,0,TAU);c.fill();poly(c,[x-s*.5,y-s*.05,x-s*1.1,y+s*.05,x-s*1.0,y+s*.3,x-s*.4,y+s*.2],col);poly(c,[x+s*.68,y-s*.32,x+s*.9,y-s*.27,x+s*.68,y-s*.24],'#d9a646');c.fillStyle='rgba(0,0,0,.12)';c.beginPath();c.ellipse(x-s*.05,y+s*.02,s*.36,s*.18,-.3,0,TAU);c.fill()}
function whiteTower(c,x,by,s,t,u){ // 高處的白色建築
  const g=c.createLinearGradient(x-s*.3,0,x+s*.3,0);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#c9cdd0');
  poly(c,[x-s*.24,by,x-s*.17,by-s*2.5,x+s*.17,by-s*2.5,x+s*.24,by],g);poly(c,[x-s*.3,by-s*2.5,x,by-s*3.15,x+s*.3,by-s*2.5],'#eef0f0');c.fillStyle='#d9dcdc';c.fillRect(x-s*.3,by-s*2.56,s*.6,s*.08);
  c.fillStyle='#39424a';for(let r=0;r<6;r++)for(let q=0;q<2;q++){const hx=x-s*.09+q*s*.18,hy=by-s*2.25+r*s*.34;c.beginPath();c.moveTo(hx-s*.035,hy+s*.09);c.lineTo(hx-s*.035,hy);c.arc(hx,hy,s*.035,PI,0);c.lineTo(hx+s*.035,hy+s*.09);c.fill()}
  c.fillStyle='#39424a';c.beginPath();c.moveTo(x-s*.07,by);c.lineTo(x-s*.07,by-s*.2);c.arc(x,by-s*.2,s*.07,PI,0);c.lineTo(x+s*.07,by);c.fill();
  birds(c,t,0,0,u,{n:8,x,y:by-s*2.6,r:s*1.1,col:'#ffffff',s:1.1,sp:1.4})}

P.rain=(c,t,W,H,u,a)=>{const hz=H*(a.hz||.74);sky(c,W,H,a.pal||['#04070b','#0a171e','#16323a']);
  glow(c,W*.5,hz,max(W,H)*.7,a.glow||'#2c5661',.4);
  if(a.big){c.globalAlpha=.11+.03*sin(t*.5);txt(c,a.big,W*.5,H*.4-(t%60)*u*.25,min(W*.36,H*.3),'#bfe6ee',{f:SERIF,w:900});c.globalAlpha=1}
  if(a.city!==false){skyline(c,t,W,H,u,{base:hz-u*2,seed:(a.seed||3)+40,minH:4,maxH:20,minW:3,maxW:8,col:'#0b1b22'});
    skyline(c,t,W,H,u,{base:hz,seed:a.seed||3,minH:5,maxH:30,col:'#03060a',win:a.win||'#f1c27a',lit:a.lit??.22,peel:a.peel,pc:'#0c151b',deco:a.deco})}
  wetGround(c,t,W,H,u,hz);
  rain(c,(a.dir??-1)*t,W,H,u,{n:a.n||170,col:a.rc||'#bfe6ee',al:a.ra??.55,len:a.len||7,sp:a.sp||1})};

P.nye=(c,t,W,H,u,a)=>{const hz=H*.74,t0=5.2,T=3;let off;if(t<t0)off=t;else if(t<t0+T){const s=(t-t0)/T;off=t0+T*(s-2*s*s*s+s*s*s*s)}else off=t0-(t-t0-T);
  sky(c,W,H,['#05070d','#0b1626','#1a2b3c']);stars(c,t,W,H,u,{n:60,y1:.5,al:.6});
  for(let k=0;k<3;k++){const bt=t0-2.4+k*.9,rev=t>t0+T;const e=rev?clamp(1-(t-t0-T-k*.3)/1.6):clamp((t-bt)/1.6);if(e<=0)continue;
    const fx=W*(.22+.28*k),fy=H*(.17+.08*(k%2)),R=u*(9+2*k)*eo(e),col=['#f6c56b','#e8785a','#9fd3dc'][k];
    c.strokeStyle=rgba(col,rev?.8*e:.85*(1-.45*e));c.lineWidth=u*.11;c.beginPath();for(let j=0;j<24;j++){const an=j/24*TAU+k;c.moveTo(fx+cos(an)*R*.5,fy+sin(an)*R*.5);c.lineTo(fx+cos(an)*R,fy+sin(an)*R+R*.14*e)}c.stroke();glow(c,fx,fy,R*1.5,col,.12*e)}
  glow(c,W*.5,hz,max(W,H)*.6,'#31465a',.4);
  skyline(c,t,W,H,u,{base:hz-u*2,seed:43,minH:4,maxH:20,minW:3,maxW:8,col:'#101c2a'});
  skyline(c,t,W,H,u,{base:hz,seed:5,minH:5,maxH:28,col:'#03060a',win:'#f6cf8a',lit:.38});
  wetGround(c,t,W,H,u,hz);
  let s;if(t<t0)s='23:59:'+(54+min(5,floor(t/t0*6)));else if(t<t0+.9)s=(floor(t*14)%2)?'24:00:00':'00:00:00';else{const k=59-min(59,floor((t-t0-.9)*1.6));s='23:59:'+(k<10?'0'+k:k)}
  const sz=min(W*.15,H*.085),cy=H*.39;txt(c,'88:88:88',W/2,cy,sz,rgba('#ff8a3c',.07),{w:700});
  c.save();c.shadowColor='#ff7a2c';c.shadowBlur=u*3;txt(c,s,W/2,cy,sz,'#ffd09a',{w:700});c.restore();
  txt(c,'1999 . 12 . 31',W/2,cy-sz*.95,sz*.3,rgba('#ffd09a',.7),{w:400});
  rain(c,off,W,H,u,{n:170,al:.5})};

P.storm=(c,t,W,H,u,a)=>{sky(c,W,H,['#030507','#081219','#0f242b']);const cx=W/2,cy=H*.47,fw=a.to>a.from;
  glow(c,cx,cy,max(W,H)*.55,fw?'#3f7a70':'#27505b',.5);
  for(let i=0;i<5;i++){const ph=fr(t*.16+i/5),r=ph*max(W,H)*.7;c.strokeStyle=rgba('#9fd3dc',(1-ph)*.22);c.lineWidth=u*.1;c.beginPath();c.ellipse(cx,cy,r,r*.42,0,0,TAU);c.stroke()}
  const e=sm((t-1)/3.4),yr=round(lerp(a.from,a.to,e)),sz=min(W*.3,H*.2),mv=e>0&&e<1;
  if(mv){c.globalAlpha=.16;txt(c,String(round(lerp(a.from,a.to,max(0,e-.07)))),cx,cy+sz*.18*(fw?1:-1),sz,'#ffb86b',{f:SERIF,w:900});c.globalAlpha=1}
  c.save();c.shadowColor='#ff8a3c';c.shadowBlur=u*4;txt(c,String(yr),cx+(mv?sin(t*43)*sz*.012:0),cy,sz,'#ffd29a',{f:SERIF,w:900});c.restore();
  rain(c,-(t+4.2*(1-cos(PI*e))/2),W,H,u,{n:230,al:.6,len:9+9*sin(PI*e)})};

P.umbrella=(c,t,W,H,u,a)=>{const hz=H*.64;sky(c,W,H,['#05090d','#0b1a21','#183038']);glow(c,W*.5,hz,max(W,H)*.6,'#2f5a66',.4);
  skyline(c,t,W,H,u,{base:hz,seed:21,minH:3,maxH:14,col:'#060d12',win:'#e9bd78',lit:.12,peel:1});wetGround(c,t,W,H,u,hz);
  const x=W*.5,y=hz+min(H*.2,u*24),s=min(W*.25,H*.17);glow(c,x,y-s*1.2,s*2.8,'#6fa6b3',.32);rain(c,-t,W,H,u,{n:180,al:.55});
  glow(c,x,y-s*.6,s*1.5,'#04070a',.85);c.fillStyle='rgba(0,0,0,.55)';c.beginPath();c.ellipse(x,y,s*.9,s*.1,0,0,TAU);c.fill();
  c.save();c.translate(x,y);c.rotate(-.1+.02*sin(t*.8));const g=c.createLinearGradient(-s,0,s,0);g.addColorStop(0,'#0c171d');g.addColorStop(.55,'#010203');g.addColorStop(1,'#0e1a20');c.fillStyle=g;
  c.beginPath();c.moveTo(-s,-s*1.05);c.quadraticCurveTo(0,-s*2.15,s,-s*1.05);for(let k=4;k>0;k--){const x1=-s+(k-1)*s*.5,x0=x1+s*.5;c.quadraticCurveTo((x0+x1)/2,-s*1.25,x1,-s*1.05)}c.closePath();c.fill();
  c.strokeStyle=rgba('#bfe6ee',.75);c.lineWidth=u*.16;c.beginPath();c.moveTo(-s,-s*1.05);c.quadraticCurveTo(0,-s*2.15,s,-s*1.05);c.stroke();
  c.strokeStyle=rgba('#bfe6ee',.2);c.lineWidth=u*.1;for(let k=1;k<4;k++){const xx=-s+k*s*.5;c.beginPath();c.moveTo(0,-s*1.6);c.quadraticCurveTo(xx*.6,-s*1.45,xx,-s*1.05);c.stroke()}
  c.strokeStyle=rgba('#bfe6ee',.6);c.lineWidth=u*.09;for(let k=0;k<5;k++){const xx=-s+k*s*.5,ph=fr(t*.7+k*.31);c.globalAlpha=1-ph;c.beginPath();c.moveTo(xx,-s*1.05-ph*s*.5);c.lineTo(xx,-s*1.05-ph*s*.5-s*.12);c.stroke()}c.globalAlpha=1;
  c.strokeStyle='#010203';c.lineWidth=u*.4;c.lineCap='round';c.beginPath();c.moveTo(0,-s*1.82);c.lineTo(0,-s*.1);c.quadraticCurveTo(0,s*.1,s*.17,s*.06);c.stroke();
  c.strokeStyle=rgba('#bfe6ee',.3);c.lineWidth=u*.08;c.beginPath();c.moveTo(u*.2,-s*1.0);c.lineTo(u*.2,-s*.12);c.stroke();c.restore()};

P.case=(c,t,W,H,u,a)=>{const hz=H*.66;sky(c,W,H,['#05090d','#0b1a21','#183038']);glow(c,W*.5,hz,max(W,H)*.6,'#2f5a66',.35);
  skyline(c,t,W,H,u,{base:hz,seed:27,minH:3,maxH:12,col:'#060d12'});wetGround(c,t,W,H,u,hz);rain(c,-t,W,H,u,{n:170,al:.5});
  const x=W*.5,y=hz+u*15,w=u*19,h=u*11,op=sm((t-1.2)/5);
  glow(c,x,y-h*1.1,u*30*(.4+.6*op),'#ffd08a',.42*op+.08);
  const g=c.createLinearGradient(0,y-h,0,y-h-u*34);g.addColorStop(0,rgba('#ffdca0',.6*op));g.addColorStop(1,rgba('#ffdca0',0));poly(c,[x-w*.47,y-h,x+w*.47,y-h,x+w*(.5+.8*op),y-h-u*34,x-w*(.5+.8*op),y-h-u*34],g);
  c.fillStyle='rgba(0,0,0,.55)';c.beginPath();c.ellipse(x,y+u*.3,w*.6,u*1.1,0,0,TAU);c.fill();
  // lid (hinged at the back)
  const lh=h*.2+h*.55*op;poly(c,[x-w*.5,y-h,x+w*.5,y-h,x+w*.47,y-h-lh,x-w*.47,y-h-lh],'#120b07','#5a3b22',u*.16);
  c.fillStyle=rgba('#ffe2a8',.75*op);c.fillRect(x-w*.44,y-h-lh*.16,w*.88,lh*.16);
  // body
  c.fillStyle='#1d130c';rr(c,x-w/2,y-h,w,h,u*.8);c.fill();c.strokeStyle='#6a4526';c.lineWidth=u*.2;c.stroke();
  c.fillStyle='#2e1e13';c.fillRect(x-w*.3,y-h,w*.08,h);c.fillRect(x+w*.22,y-h,w*.08,h);
  c.fillStyle='#b8893f';c.fillRect(x-w*.3-u*.2,y-h+u*.5,w*.08+u*.4,u*1.3);c.fillRect(x+w*.22-u*.2,y-h+u*.5,w*.08+u*.4,u*1.3);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy])=>{c.beginPath();c.arc(x+sx*(w/2-u*.9),y-h/2+sy*(h/2-u*.9),u*.9,0,TAU);c.fill()});
  c.strokeStyle='#3a2616';c.lineWidth=u*.5;c.beginPath();c.moveTo(x-u*2.4,y-h*.5);c.quadraticCurveTo(x,y-h*.5+u*2.2,x+u*2.4,y-h*.5);c.stroke();
  // what the case keeps: motes that do not rise with the rain
  for(let i=0;i<34;i++){const an=hh(i,7)*TAU+t*.2*(hh(i,8)-.5),r=u*(3+16*hh(i,9))*op;c.fillStyle=rgba('#ffe9bd',(.3+.5*hh(i,10))*op);c.fillRect(x+cos(an)*r,y-h-u*4-abs(sin(an))*r*1.2,u*.18,u*.18)}};

P.duality=(c,t,W,H,u,a)=>{const hz=H*.62;
  c.save();c.beginPath();c.rect(-W*.1,-H*.1,W*.6,H*1.2);c.clip();sky(c,W,H,['#14100c','#3a2415','#8a5424'],0,hz);glow(c,W*.2,hz,W*.6,'#e39a4a',.35);
  for(let i=0;i<5;i++){const x=W*(.03+.095*i),h=u*(15+9*hh(i,3)),w=u*(1.6+hh(i,4));c.fillStyle='#0c0907';c.fillRect(x,hz-h,w,h);c.fillRect(x-w*.15,hz-h,w*1.3,u*.6);
    for(let k=0;k<5;k++){const ph=fr(t*.07+k/5+hh(i,6)),sx=x+w/2+ph*u*9+sin(t+k+i)*u,sy=hz-h-ph*u*14;c.fillStyle=rgba('#2a1d14',(1-ph)*.6);c.beginPath();c.arc(sx,sy,u*(1+ph*4),0,TAU);c.fill()}}
  skyline(c,t,W,H,u,{base:hz,seed:61,minH:3,maxH:9,col:'#0c0907',win:'#ffc679',lit:.32});
  c.strokeStyle='#0c0907';for(let i=0;i<4;i++){const x=W*(.05+.13*i);c.lineWidth=u*.22;c.beginPath();c.moveTo(x,hz+u*4);c.lineTo(x,hz-u*12);c.moveTo(x-u*1.6,hz-u*11);c.lineTo(x+u*1.6,hz-u*11);c.stroke();c.lineWidth=u*.07;c.beginPath();c.moveTo(x-u*1.6,hz-u*11);c.quadraticCurveTo(x+W*.065,hz-u*9,x+W*.13-u*1.6,hz-u*11);c.stroke()}
  gear(c,W*.4,hz-u*20,u*5,12,t*.3,'rgba(12,9,7,.55)');gear(c,W*.4+u*6.6,hz-u*16,u*3,8,-t*.45,'rgba(12,9,7,.55)');
  c.restore();
  c.save();c.beginPath();c.rect(W*.5,-H*.1,W*.6,H*1.2);c.clip();sky(c,W,H,['#060a14','#101c33','#1f3a4d'],0,hz);stars(c,t,W,H,u,{n:110,y1:.6});
  for(let i=0;i<5;i++){const x=W*(.58+.085*i),y=H*.13,r=u*1.5;c.fillStyle='#dfe7ee';c.beginPath();c.arc(x,y,r,0,TAU);c.fill();if(i!=2){c.fillStyle='#0b1426';c.beginPath();c.arc(x+(2-i)*r*.75,y,r*1.02,0,TAU);c.fill()}}
  const cs=[];for(let i=0;i<7;i++)cs.push([W*(.56+.4*hh(i,81)),H*(.2+.26*hh(i,82))]);c.strokeStyle=rgba('#9fc0e0',.35);c.lineWidth=u*.07;c.beginPath();cs.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();cs.forEach(([x,y],i)=>glow(c,x,y,u*1.6,'#dff0ff',.6+.3*sin(t*2+i)));
  ridge(c,W,H,{base:hz+u*2,amp:u*5,seed:5,col:'#0a1320'});
  for(let i=0;i<6;i++){const x=W*(.555+.075*i),h=u*(6+6*hh(i,91)),w=u*(1.8+hh(i,92));poly(c,[x,hz+u*4,x+w*.12,hz-h,x+w*.7,hz-h-u*.7,x+w,hz+u*4],'#04070d')}
  for(let i=0;i<4;i++)flame(c,W*(.6+.1*i),hz+u*(4.5+hh(i,5)),u*.9,t,i,'#9fe0ff');
  c.restore();
  c.fillStyle='#050608';c.fillRect(-W*.1,hz+u*4,W*1.2,H);
  const g=c.createLinearGradient(W*.5-u*6,0,W*.5+u*6,0);g.addColorStop(0,'rgba(2,3,4,0)');g.addColorStop(.5,'rgba(2,3,4,.9)');g.addColorStop(1,'rgba(2,3,4,0)');c.fillStyle=g;c.fillRect(W*.5-u*6,-H*.1,u*12,H*1.2);
  const ty=hz+u*13;[[.06,'#2a1b10','#ffcf7a'],[.56,'#101c2c','#9fe0ff']].forEach(([px,col,fc],j)=>{const x0=W*px,tw=W*.38;c.fillStyle=col;c.fillRect(x0,ty,tw,u*.9);c.fillRect(x0+u,ty,u*.6,u*7);c.fillRect(x0+tw-u*1.6,ty,u*.6,u*7);
    for(let k=0;k<3;k++){const x=x0+tw*(.2+.3*k);c.fillStyle='#090a0c';rr(c,x-u*1.5,ty-u*5.5,u*3,u*5,u*.5);c.fill();c.fillStyle='#d8cdb4';c.beginPath();c.ellipse(x,ty-u*.1,u*1.3,u*.3,0,0,TAU);c.fill()}
    flame(c,x0+tw*.5-(j?1:-1)*tw*.15,ty-u*1.4,u*.7,t,j,fc);c.fillStyle='#d8cdb4';c.fillRect(x0+tw*.5-(j?1:-1)*tw*.15-u*.12,ty-u*1.4,u*.24,u*1.4)})};

P.factions=(c,t,W,H,u,a,k=0)=>{sky(c,W,H,['#05070a','#080b10','#0b0f14']);const vert=H>W*1.15,ci=min(3,floor(k)),f=sm(fr(k)*4),pi=ci==3?0:ci;
  for(let i=0;i<3;i++){const x=vert?W*.07:W*(.035+.32*i),y=vert?H*(.085+.265*i):H*.12,w=vert?W*.86:W*.29,h=vert?H*.245:H*.6;
    const br=i==pi?lerp(k<i+.001?.1:.45,1,f):(ci>i||k>=3?lerp(i==ci-1||(ci==3&&i==2)?1:.42,.42,f):.1);
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();const cx=x+w/2,s=min(w,h)*.3;
    if(i==0){const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#0b1420');g.addColorStop(1,'#213a4f');c.fillStyle=g;c.fillRect(x,y,w,h);const by=y+h*.82;
      for(let j=0;j<2;j++){const an=-PI/2+(j?1:-1)*(.55+.22*sin(t*.4+j));const gg=c.createLinearGradient(cx,by-s*1.3,cx+cos(an)*s*3.4,by-s*1.3+sin(an)*s*3.4);gg.addColorStop(0,rgba('#cfe3f2',.3));gg.addColorStop(1,rgba('#cfe3f2',0));poly(c,[cx,by-s*1.3,cx+cos(an-.08)*s*3.4,by-s*1.3+sin(an-.08)*s*3.4,cx+cos(an+.08)*s*3.4,by-s*1.3+sin(an+.08)*s*3.4],gg)}
      c.fillStyle='#060b11';c.fillRect(cx-s*1.3,by-s*.12,s*2.6,s*.3);c.fillRect(cx-s*1.14,by-s*.24,s*2.28,s*.13);for(let j=0;j<6;j++)c.fillRect(cx-s+j*s*.372,by-s*.9,s*.14,s*.68);
      c.fillRect(cx-s*1.08,by-s*1.0,s*2.16,s*.12);poly(c,[cx-s*1.08,by-s,cx,by-s*1.36,cx+s*1.08,by-s],'#060b11');c.beginPath();c.arc(cx,by-s*1.3,s*.4,PI,0);c.fill();c.fillRect(cx-s*.02,by-s*2.0,s*.04,s*.34);
      poly(c,[cx+s*.02,by-s*2.0,cx+s*.32,by-s*1.93+sin(t*2)*s*.02,cx+s*.02,by-s*1.84],'#9db7cc');c.fillStyle='#ffd08a';c.fillRect(cx-s*.07,by-s*.5,s*.14,s*.28);
      txt(c,'ST. PAVLOV FOUNDATION',cx,y+h*.1,max(u*1.7,s*.2),rgba('#cfe3f2',.75),{f:FELL});
      if(k>=3){const e=sm((k-3)*4);c.globalAlpha=e;const zx=x+w*.18,lx=x+w*.82,zy=y+h*.42;gear(c,zx,zy,s*.3,10,t*.4,'#8fa9bd');c.fillStyle='#213a4f';c.beginPath();c.arc(zx,zy,s*.12,0,TAU);c.fill();txt(c,'ZENO',zx,zy+s*.52,max(u*1.5,s*.17),'#cfe3f2',{f:FELL});
        c.strokeStyle='#8fa9bd';c.lineWidth=u*.14;for(let j=0;j<3;j++){c.beginPath();c.ellipse(lx,zy,s*.34,s*.12,j*PI/3+t*.2,0,TAU);c.stroke()}c.fillStyle='#ffd08a';c.beginPath();c.arc(lx,zy,s*.06,0,TAU);c.fill();txt(c,'LAPLACE',lx,zy+s*.52,max(u*1.5,s*.17),'#cfe3f2',{f:FELL});c.globalAlpha=1}}
    else if(i==1){const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#110405');g.addColorStop(1,'#430d13');c.fillStyle=g;c.fillRect(x,y,w,h);
      for(let j=0;j<14;j++){const xx=x+w*j/14,ww=w/14,gg=c.createLinearGradient(xx,0,xx+ww,0);gg.addColorStop(0,'rgba(0,0,0,.4)');gg.addColorStop(.5,'rgba(150,26,36,.16)');gg.addColorStop(1,'rgba(0,0,0,.4)');c.fillStyle=gg;c.fillRect(xx,y,ww+1,h)}
      const cy=y+h*.54;glow(c,cx,cy,s*3,'#c22a36',.3);maskDraw(c,cx,cy+sin(t*.8)*s*.04,s*.8,t,1);txt(c,'MANUS VINDICTAE',cx,y+h*.1,max(u*1.7,s*.2),rgba('#f0c9c2',.75),{f:FELL})}
    else{const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#8fa6b6');g.addColorStop(1,'#ebe6d6');c.fillStyle=g;c.fillRect(x,y,w,h);glow(c,cx+s*.9,y+h*.3,s*2.2,'#fff4d6',.7);
      whiteTower(c,cx,y+h*.86,s*.92,t,u);for(let j=0;j<5;j++)cloud(c,x+w*(j/4)+sin(t*.2+j)*u*2,y+h*(.9+.05*(j%2)),s*.5,'#f6f4ec','#ffffff');
      txt(c,'THE PAX HOUSE',cx,y+h*.1,max(u*1.7,s*.2),rgba('#23303a',.8),{f:FELL})}
    c.fillStyle=rgba('#05070a',1-br);c.fillRect(x,y,w,h);c.restore();
    c.strokeStyle=rgba('#ece4d2',.12+.3*br);c.lineWidth=1;c.strokeRect(x+.5,y+.5,w-1,h-1)}};

P.sea=(c,t,W,H,u,a)=>{const hz=H*.6,v=a.v||'radio';sky(c,W,H,['#03050b','#0a1428','#1b2f47'],0,hz);stars(c,t,W,H,u,{n:110,y1:.56});
  const mx=W*.76,my=H*.2;glow(c,mx,my,u*18,'#dfe9f2',.25);c.fillStyle='#e6edf2';c.beginPath();c.arc(mx,my,u*2.6,0,TAU);c.fill();c.fillStyle='rgba(160,175,190,.5)';c.beginPath();c.arc(mx-u*.7,my-u*.5,u*.5,0,TAU);c.arc(mx+u*.8,my+u*.6,u*.7,0,TAU);c.fill();
  fog(c,t,W,H,{y:hz-u*2,h:u*8,col:'#6f8aa3',al:.12,n:4});
  water(c,t,W,H,u,{y:hz,c1:'#0c1a2c',c2:'#020409',gl:'#bcd4e6',al:.3,n:90});
  for(let i=0;i<26;i++){const d=i/26,yy=hz+d*(H-hz)*.9,w=u*(1+5*d)*(.5+hh(i,3));c.fillStyle=rgba('#dfe9f2',.3*(1-d)*(.5+.5*sin(t*1.5+i)));c.fillRect(mx-w/2+sin(t+i)*u,yy,w,u*.14)}
  const sx=W*.4+sin(t*.2)*u,sy=hz+u*2.4,s=max(u*7,min(W*.13,H*.1)),sink=v=='chase'?sm((t-4.5)/8):0;
  if(v=='chase'){[[-.06,1],[1.06,-1]].forEach(([px,d],j)=>{const ox=W*px,oy=hz+u*1.2,an=(d>0?-.16:PI+.16)+sin(t*.5+j*2)*.13,g=c.createLinearGradient(ox,oy,ox+cos(an)*W,oy+sin(an)*W);g.addColorStop(0,rgba(j?'#ff9a8a':'#cfe6ff',.36));g.addColorStop(1,rgba('#cfe6ff',0));
      poly(c,[ox,oy,ox+cos(an-.07)*W*1.2,oy+sin(an-.07)*W*1.2,ox+cos(an+.07)*W*1.2,oy+sin(an+.07)*W*1.2],g);
      poly(c,[ox-d*u,oy+u*.6,ox+d*u*10,oy+u*.6,ox+d*u*8,oy+u*2,ox-d*u,oy+u*2],'#020306');c.fillStyle='#020306';c.fillRect(d>0?ox+u*2:ox-u*5,oy-u*.9,u*3,u*1.6)})}
  c.save();c.translate(sx,sy+sink*s*.5);c.rotate(sin(t*.9)*.03+sink*.45);
  poly(c,[-s,-s*.18,s*1.05,-s*.18,s*.8,s*.14,-s*.85,s*.14],'#020306');c.fillStyle='#020306';c.fillRect(-s*.45,-s*.42,s*.7,s*.26);c.fillRect(-s*.2,-s*.6,s*.3,s*.2);c.fillRect(s*.36,-s*.52,s*.1,s*.36);
  c.fillRect(-s*.02,-s*1.9,s*.04,s*1.5);c.lineWidth=u*.07;c.strokeStyle='#020306';c.beginPath();c.moveTo(0,-s*1.9);c.lineTo(-s*.9,-s*.2);c.moveTo(0,-s*1.9);c.lineTo(s*.95,-s*.2);c.moveTo(-s*.25,-s*1.45);c.lineTo(s*.25,-s*1.45);c.moveTo(-s*.16,-s*1.65);c.lineTo(s*.16,-s*1.65);c.stroke();
  c.fillStyle='#ffd08a';for(let i=0;i<5;i++){c.globalAlpha=(1-sink)*(.6+.4*sin(t*3+i));c.fillRect(-s*.4+i*s*.14,-s*.34,s*.06,s*.07)}c.globalAlpha=1;
  glow(c,0,-s*1.9,u*3,'#ff5a4a',.8*(.5+.5*sin(t*4))*(1-sink));c.restore();
  const q=v=='chase'?clamp(1-(t-3.5)/2.5):1;if(q>0){c.lineWidth=u*.1;for(let i=0;i<6;i++){const ph=fr(t*.22+i/6),r=ph*max(W,H)*.55;c.strokeStyle=rgba('#ffcf8a',(1-ph)*.55*q);c.beginPath();c.arc(sx,sy-s*1.9,r,PI*1.05,PI*1.95);c.stroke()}
    c.strokeStyle=rgba('#ffcf8a',.7*q);c.lineWidth=u*.14;c.beginPath();for(let x=0;x<=W;x+=u*.6){const p=x/u*.4,y=H*.4+sin(p+t*7)*sin(p*.11+t*.6)*u*2.2;x?c.lineTo(x,y):c.moveTo(x,y)}c.stroke()}
  if(v=='chase'){const e=clamp((t-4)/1.3);if(e>0&&e<1)glow(c,sx+u*2,sy-u*2,u*26*e,'#ffb45a',1-e);embers(c,t,W,H,u,{n:30,x0:sx-u*5,x1:sx+u*6,y:sy,h:.22,al:.8*clamp((t-4)/1)})}};

P.collage=(c,t,W,H,u,a)=>{const e=sm(t/10);c.fillStyle='#efe6cf';c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);const cols=['#e9482f','#f4c21f','#1f9bb8','#e86aa5','#1a1a1a','#2c6e49','#f08a24'];
  for(let i=0;i<9;i++){const x=W*hh(i,101),y=H*hh(i,102)*.8,s=u*(14+22*hh(i,103)),rot=hh(i,104)*TAU+sin(t*.15+i)*.06,n=3+floor(hh(i,105)*4);
    c.save();c.translate(x+sin(t*.2+i)*u*1.5,y+cos(t*.17+i)*u);c.rotate(rot);c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=u*1.2;c.shadowOffsetY=u*.5;c.fillStyle=cols[i%cols.length];c.beginPath();
    for(let j=0;j<n;j++){const an=j/n*TAU,r=s*(.6+.4*hh(i*9+j,106));j?c.lineTo(cos(an)*r,sin(an)*r):c.moveTo(cos(an)*r,sin(an)*r)}c.closePath();c.fill();c.restore()}
  c.fillStyle='#1a1a1a';const gs=u*2.2;for(let gx=0;gx<W*.62;gx+=gs)for(let gy=H*.08;gy<H*.48;gy+=gs){const r=gs*.44*clamp(.12+.88*(gx/(W*.62))*(.6+.4*sin(gy*.02+t*.6)));c.beginPath();c.arc(gx+((gy/gs|0)%2)*gs*.5,gy,r,0,TAU);c.fill()}
  c.save();c.translate(W*.66,H*.16);c.rotate(-.12);for(let i=0;i<9;i++){c.fillStyle=i%2?'#f4c21f':'#1a1a1a';c.fillRect(0,i*u*1.6,W*.4,u*1.6)}c.restore();
  const hz=H*.72;skyline(c,t,W,H,u,{base:hz,seed:131,minH:6,maxH:26,col:'#141414',deco:1,dome:1});c.fillStyle='#141414';c.fillRect(-W*.1,hz-1,W*1.2,H);
  for(let i=0;i<50;i++){const x=hh(i,141)*W,w=u*(.6+1.7*hh(i,142)),top=hz-u*(5+20*hh(i,143)),len=u*(4+30*hh(i,144))*e*(.6+.4*sin(t*.7+i));c.fillStyle=cols[(i*3)%4];rr(c,x,top-len,w,len+u,w/2);c.fill();c.beginPath();c.arc(x+w/2,top-len,w*.78,0,TAU);c.fill()}
  for(let i=0;i<3;i++){const x=W*(.2+.3*i),y=H*(.54+.06*(i%2)),R=u*(4.5+hh(i,151)*2)*(1+.06*sin(t*3+i));c.fillStyle=i==1?'#e9482f':'#ffffff';c.strokeStyle='#1a1a1a';c.lineWidth=u*.25;c.beginPath();for(let j=0;j<24;j++){const an=j/24*TAU+t*.1,r=j%2?R:R*.62;j?c.lineTo(x+cos(an)*r,y+sin(an)*r):c.moveTo(x+cos(an)*r,y+sin(an)*r)}c.closePath();c.fill();c.stroke()}
  c.fillStyle='rgba(60,30,10,.14)';c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2)};

P.deco=(c,t,W,H,u,a)=>{const hz=H*.76;sky(c,W,H,['#05070f','#101a30','#3a2a2a','#8a5226'],0,hz);stars(c,t,W,H,u,{n:50,y1:.4,al:.5});glow(c,W*.5,hz,max(W,H)*.55,'#c97a3a',.28);
  for(let j=0;j<2;j++){const ox=W*(.25+.5*j),an=-PI/2+sin(t*.3+j*2)*.5,g=c.createLinearGradient(ox,hz,ox+cos(an)*H,hz+sin(an)*H);g.addColorStop(0,rgba('#ffe2b0',.22));g.addColorStop(1,rgba('#ffe2b0',0));poly(c,[ox,hz,ox+cos(an-.04)*H,hz+sin(an-.04)*H,ox+cos(an+.04)*H,hz+sin(an+.04)*H],g)}
  skyline(c,t,W,H,u,{base:hz-u*3,seed:201,minH:10,maxH:36,minW:4,maxW:9,col:'#161c2c',deco:1,win:'#c98f52',lit:.12,wa:.5});
  skyline(c,t,W,H,u,{base:hz,seed:207,minH:6,maxH:28,col:'#05070c',deco:1,win:'#ffc878',lit:.3});
  const ty=hz-u*5;c.fillStyle='#020305';c.fillRect(-W*.1,ty,W*1.2,u*.7);c.strokeStyle='#020305';c.lineWidth=u*.14;for(let x=-u*2;x<W+u*4;x+=u*6){c.fillRect(x,ty,u*.5,u*6);c.beginPath();c.moveTo(x,ty+u*3);c.lineTo(x+u*6,ty+u*.7);c.moveTo(x+u*6,ty+u*3);c.lineTo(x,ty+u*.7);c.stroke()}
  const tx=mod(t*W*.11,W*1.9)-W*.6;for(let k=0;k<4;k++){const x=tx+k*u*11.4;c.fillStyle='#07090e';rr(c,x,ty-u*3.1,u*11,u*3.1,u*.5);c.fill();c.fillStyle='#ffd597';for(let j=0;j<6;j++)c.fillRect(x+u*.9+j*u*1.6,ty-u*2.4,u*1.05,u*1.1)}
  c.fillStyle='#030406';c.fillRect(-W*.1,hz,W*1.2,H);const g=c.createLinearGradient(0,hz,0,H);g.addColorStop(0,rgba('#c9d3e0',.14));g.addColorStop(1,rgba('#c9d3e0',0));c.fillStyle=g;c.fillRect(-W*.1,hz,W*1.2,H-hz);
  for(let i=0;i<5;i++){const x=W*(.1+.2*i),y=hz+u*3;line(c,x,y+u*30,x,y-u*3,'#020305',u*.25);glow(c,x,y-u*3,u*6,'#ffcf8a',.5);c.fillStyle='#ffe6b8';c.beginPath();c.arc(x,y-u*3,u*.45,0,TAU);c.fill()}
  snow(c,t,W,H,u,{n:150,al:.75});
  if(a.shots)for(let k=0;k<3;k++){const f=fr(t*.9+k*.37);if(f<.08)glow(c,W*(.3+.2*k),hz+u*2,u*10,'#fff0c8',.9*(1-f/.08))}};

const OBJ={
  orange(c,x,y,s){glow(c,x,y-s*.5,s*1.8,'#ff9a2e',.18);const g=c.createRadialGradient(x-s*.2,y-s*.7,s*.05,x,y-s*.5,s*.6);g.addColorStop(0,'#ffc15a');g.addColorStop(.6,'#ee7d1c');g.addColorStop(1,'#8a3a08');c.fillStyle=g;c.beginPath();c.arc(x,y-s*.5,s*.5,0,TAU);c.fill();c.fillStyle='#2f5a2a';c.beginPath();c.ellipse(x+s*.12,y-s*1.02,s*.2,s*.08,-.5,0,TAU);c.fill();c.fillStyle='#3a2a18';c.fillRect(x-s*.02,y-s*1.04,s*.05,s*.08)},
  half(c,x,y,s){c.fillStyle='#ee7d1c';c.beginPath();c.arc(x,y-s*.42,s*.46,0,TAU);c.fill();c.fillStyle='#ffe3a6';c.beginPath();c.arc(x,y-s*.42,s*.4,0,TAU);c.fill();c.fillStyle='#f39a33';for(let k=0;k<8;k++){c.beginPath();c.moveTo(x,y-s*.42);c.arc(x,y-s*.42,s*.36,k/8*TAU+.07,(k+1)/8*TAU-.07);c.closePath();c.fill()}},
  coins(c,x,y,s,t,i){const n=5+i%3*2;for(let k=0;k<n;k++){const yy=y-k*s*.11-s*.06;c.fillStyle='#8a6a22';c.beginPath();c.ellipse(x,yy+s*.05,s*.36,s*.12,0,0,TAU);c.fill();c.fillStyle=k%2?'#e2bb55':'#d0a640';c.beginPath();c.ellipse(x,yy,s*.36,s*.12,0,0,TAU);c.fill()}c.fillStyle='rgba(255,246,210,.7)';c.beginPath();c.ellipse(x-s*.1,y-n*s*.11+s*.05,s*.12,s*.03,0,0,TAU);c.fill()},
  mask(c,x,y,s,t){maskDraw(c,x,y-s*.78,s*.6,t,1)},
  radio(c,x,y,s,t){c.fillStyle='#2a1a10';rr(c,x-s*.7,y-s*.9,s*1.4,s*.9,s*.1);c.fill();c.strokeStyle='#6b4a2a';c.lineWidth=s*.03;c.stroke();c.strokeStyle='#0d0805';c.lineWidth=s*.035;for(let k=0;k<7;k++){c.beginPath();c.moveTo(x-s*.58,y-s*.78+k*s*.09);c.lineTo(x-s*.05,y-s*.78+k*s*.09);c.stroke()}
    glow(c,x+s*.33,y-s*.52,s*.8,'#ffb04a',.5+.2*sin(t*5));c.fillStyle='#ffd58a';c.beginPath();c.arc(x+s*.33,y-s*.52,s*.22,0,TAU);c.fill();line(c,x+s*.33,y-s*.52,x+s*.33+cos(t*.6)*s*.18,y-s*.52+sin(t*.6)*s*.18,'#3a1a08',s*.03);
    c.fillStyle='#b8893f';c.beginPath();c.arc(x+s*.15,y-s*.16,s*.06,0,TAU);c.arc(x+s*.5,y-s*.16,s*.06,0,TAU);c.fill();line(c,x+s*.55,y-s*.9,x+s*.9,y-s*1.9,'#8a8a8a',s*.025);
    for(let k=0;k<3;k++){const ph=fr(t*.5+k/3);c.strokeStyle=rgba('#ffcf8a',(1-ph)*.55);c.lineWidth=s*.025;c.beginPath();c.arc(x-s*.3,y-s*.45,s*(.5+ph*1.5),PI*.75,PI*1.25);c.stroke()}
    txt(c,'1999',x+s*.33,y-s*.52,s*.11,'#3a1a08',{w:700})},
  crate(c,x,y,s){c.fillStyle='#3b2a1a';c.fillRect(x-s*.8,y-s*.95,s*1.6,s*.95);c.strokeStyle='#1c130b';c.lineWidth=s*.035;for(let k=0;k<4;k++)c.strokeRect(x-s*.8,y-s*.95+k*s*.2375,s*1.6,s*.2375);c.fillStyle='#22170e';c.fillRect(x-s*.8,y-s*.95,s*.12,s*.95);c.fillRect(x+s*.68,y-s*.95,s*.12,s*.95);
    c.save();c.translate(x+s*.04,y-s*.5);c.rotate(-.06);c.fillStyle='#e6dcc3';c.fillRect(-s*.5,-s*.14,s,s*.28);txt(c,'VERTIN',0,s*.01,s*.2,'#2a1a10',{w:700});c.restore()},
  cake(c,x,y,s,t,i){c.fillStyle='#d9cdb2';c.beginPath();c.ellipse(x,y-s*.04,s*.75,s*.14,0,0,TAU);c.fill();c.fillStyle='#6b3a22';c.fillRect(x-s*.5,y-s*.5,s,s*.44);c.beginPath();c.ellipse(x,y-s*.06,s*.5,s*.12,0,0,TAU);c.fill();c.fillStyle='#f0e6d0';c.beginPath();c.ellipse(x,y-s*.5,s*.5,s*.12,0,0,TAU);c.fill();c.fillStyle='#e9482f';c.fillRect(x-s*.025,y-s*.82,s*.05,s*.32);flame(c,x,y-s*.82,s*.2,t,i)},
  candle(c,x,y,s,t,i){c.fillStyle='#e6dcc3';c.fillRect(x-s*.07,y-s*.8,s*.14,s*.8);c.fillStyle='#8a6a22';c.fillRect(x-s*.2,y-s*.06,s*.4,s*.06);flame(c,x,y-s*.8,s*.22,t,i)},
  toy(c,x,y,s,t,i,o){const br=o&&o.broken?sm((t-(o.at||3))/1.2):0;c.fillStyle='#7a1f24';rr(c,x-s*.5,y-s*.8,s,s*.8,s*.08);c.fill();c.fillStyle='#d9b25a';c.fillRect(x-s*.5,y-s*.8,s,s*.1);c.fillRect(x-s*.5,y-s*.1,s,s*.1);
    c.strokeStyle='#d9b25a';c.lineWidth=s*.03;for(let k=0;k<4;k++){c.beginPath();c.moveTo(x-s*.5+k*s*.25,y-s*.7);c.lineTo(x-s*.375+k*s*.25,y-s*.1);c.lineTo(x-s*.25+k*s*.25,y-s*.7);c.stroke()}
    c.save();c.translate(x+s*.5,y-s*.45);c.rotate(br?1.2*br:sin(t*2)*.5);c.strokeStyle='#c9a24a';c.lineWidth=s*.06;c.beginPath();c.moveTo(0,0);c.lineTo(s*.3,0);c.stroke();c.beginPath();c.ellipse(s*.42,-s*.13,s*.12,s*.1,0,0,TAU);c.stroke();c.beginPath();c.ellipse(s*.42,s*.13,s*.12,s*.1,0,0,TAU);c.stroke();c.restore();
    if(br>0){c.strokeStyle='#0a0607';c.lineWidth=s*.04;c.beginPath();c.moveTo(x-s*.1,y-s*.8);c.lineTo(x+s*.05,y-s*.55);c.lineTo(x-s*.12,y-s*.35);c.lineTo(x+s*.08,y);c.stroke();glow(c,x,y-s*.4,s*2.4,'#ffe6b0',.6*(1-br)+.12);
      for(let k=0;k<8;k++){const an=k/8*TAU+.4,d=br*s*(.7+hh(k,7));gear(c,x+cos(an)*d,y-s*.4+sin(an)*d*.7-br*s*.2,s*.1,6,t+k,'#c9a24a')}}},
  dice(c,x,y,s,t){[[-.35,.2],[.3,-.3]].forEach(([dx,r],k)=>{c.save();c.translate(x+dx*s,y-s*.3-abs(sin(t*2+k))*s*.1);c.rotate(r+sin(t*.8+k)*.2);c.fillStyle='#ece4d2';rr(c,-s*.26,-s*.26,s*.52,s*.52,s*.07);c.fill();c.fillStyle='#16110c';(k?[[-1,-1],[1,1],[0,0],[-1,1],[1,-1]]:[[-1,-1],[1,1],[0,0]]).forEach(([px,py])=>{c.beginPath();c.arc(px*s*.13,py*s*.13,s*.045,0,TAU);c.fill()});c.restore()})},
  book(c,x,y,s,t){poly(c,[x-s*.95,y-s*.08,x,y-s*.02,x+s*.95,y-s*.08,x+s*.95,y,x,y+s*.06,x-s*.95,y],'#2a1710');c.fillStyle='#e9e0c8';for(const d of[-1,1]){c.beginPath();c.moveTo(x,y-s*.04);c.quadraticCurveTo(x+d*s*.45,y-s*.34,x+d*s*.9,y-s*.14);c.lineTo(x+d*s*.9,y-s*.06);c.quadraticCurveTo(x+d*s*.45,y-s*.2,x,y);c.closePath();c.fill()}
    c.strokeStyle='rgba(60,45,30,.5)';c.lineWidth=s*.012;for(let k=0;k<4;k++)for(const d of[-1,1]){c.beginPath();c.moveTo(x+d*s*.12,y-s*(.1+k*.03));c.quadraticCurveTo(x+d*s*.45,y-s*(.28+k*.02),x+d*s*.8,y-s*(.15+k*.02));c.stroke()}glow(c,x,y-s*.3,s*1.5,'#ffe6b0',.2+.08*sin(t*2))},
  tags(c,x,y,s,t,i){c.save();c.translate(x,y-s*1.5);c.rotate(sin(t*1.2+i)*.12);c.strokeStyle='#8f9499';c.lineWidth=s*.02;c.beginPath();c.moveTo(0,0);c.lineTo(0,s*.9);c.stroke();[[-.08,-.1],[.08,.12]].forEach(([dx,r],k)=>{c.save();c.translate(dx*s,s*.9);c.rotate(r);c.fillStyle=k?'#b9bec3':'#9aa0a6';rr(c,-s*.14,0,s*.28,s*.44,s*.08);c.fill();c.fillStyle='#3a3f44';c.fillRect(-s*.09,s*.14,s*.18,s*.025);c.fillRect(-s*.09,s*.22,s*.14,s*.025);c.fillRect(-s*.09,s*.3,s*.16,s*.025);c.restore()});c.restore()},
  urn(c,x,y,s,t,i){c.fillStyle='#1c1a1a';c.beginPath();c.moveTo(x-s*.2,y);c.bezierCurveTo(x-s*.6,y-s*.3,x-s*.5,y-s*.9,x-s*.16,y-s);c.lineTo(x+s*.16,y-s);c.bezierCurveTo(x+s*.5,y-s*.9,x+s*.6,y-s*.3,x+s*.2,y);c.closePath();c.fill();c.fillRect(x-s*.22,y-s*1.1,s*.44,s*.1);c.strokeStyle=rgba('#b8893f',.7);c.lineWidth=s*.03;c.beginPath();c.moveTo(x-s*.42,y-s*.6);c.lineTo(x+s*.42,y-s*.6);c.stroke();embers(c,t,0,s*6,s/8,{n:12,x0:x-s*.2,x1:x+s*.2,y:y-s*1.1,h:.3,col:'#b9b4aa',al:.55,seed:i+3})},
  record(c,x,y,s,t){c.save();c.translate(x,y-s*.5);c.scale(1,.42);c.rotate(t*1.2);c.fillStyle='#0b0b0d';c.beginPath();c.arc(0,0,s*.9,0,TAU);c.fill();c.strokeStyle='rgba(255,255,255,.14)';c.lineWidth=s*.012;for(let k=3;k<9;k++){c.beginPath();c.arc(0,0,s*k*.1,0,TAU);c.stroke()}c.fillStyle='#e3a646';c.beginPath();c.arc(0,0,s*.26,0,TAU);c.fill();c.fillStyle='#0b0b0d';c.fillRect(-s*.2,-s*.02,s*.15,s*.04);c.beginPath();c.arc(0,0,s*.03,0,TAU);c.fill();c.restore();glow(c,x,y-s*.5,s*1.6,'#e3a646',.12)},
  letter(c,x,y,s){c.save();c.translate(x,y-s*.04);c.rotate(-.08);c.fillStyle='#e6dcc3';c.fillRect(-s*.7,-s*.5,s*1.4,s*.5);c.strokeStyle='#a89c82';c.lineWidth=s*.02;c.beginPath();c.moveTo(-s*.7,-s*.5);c.lineTo(0,-s*.2);c.lineTo(s*.7,-s*.5);c.stroke();c.fillStyle='#8e1f1f';c.beginPath();c.arc(0,-s*.2,s*.07,0,TAU);c.fill();c.restore()}
};
P.still=(c,t,W,H,u,a)=>{const ty=H*.66,lamp=a.lamp||a.glow||'#ffd9a0';sky(c,W,H,a.pal||['#07080a','#15110d','#2a1d12']);glow(c,W*.5,ty-u*10,max(W,H)*.6,a.glow||'#c98a4a',.22);
  if(a.bars){c.fillStyle='rgba(0,0,0,.28)';for(let i=0;i<14;i++)c.fillRect(-W*.1,H*.05+i*u*4,W*1.2,u*1.6)}
  const g=c.createLinearGradient(0,ty,0,H);g.addColorStop(0,a.tc||'#3a2415');g.addColorStop(1,'#0a0705');c.fillStyle=g;c.fillRect(-W*.1,ty,W*1.2,H);c.fillStyle=rgba('#ffd9a0',.2);c.fillRect(-W*.1,ty,W*1.2,u*.18);
  c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=u*.08;for(let i=0;i<8;i++){const y=ty+u*(2+i*3.2);c.beginPath();c.moveTo(-W*.1,y);c.bezierCurveTo(W*.3,y+u*hh(i,5),W*.6,y-u*hh(i,6),W*1.1,y+u*.5);c.stroke()}
  const lx=W*.5+sin(t*.5)*u*1.5,ly=H*.17;line(c,W*.5,-H*.1,lx,ly-u*2.4,'#050404',u*.2);const lg=c.createLinearGradient(0,ly,0,ty+u*8);lg.addColorStop(0,rgba(lamp,.3));lg.addColorStop(1,rgba(lamp,0));poly(c,[lx-u*2.6,ly,lx+u*2.6,ly,lx+W*.5,ty+u*8,lx-W*.5,ty+u*8],lg);
  poly(c,[lx-u*1.2,ly-u*2.4,lx+u*1.2,ly-u*2.4,lx+u*3.4,ly,lx-u*3.4,ly],'#0a0807');glow(c,lx,ly+u*.6,u*8,lamp,.7);c.fillStyle='#fff3d6';c.beginPath();c.ellipse(lx,ly+u*.2,u*1.6,u*.6,0,0,TAU);c.fill();
  c.fillStyle=rgba(lamp,.1);c.beginPath();c.ellipse(W*.5,ty+u*5,W*.46,u*6,0,0,TAU);c.fill();
  const os=a.o||[],n=os.length,s=min(H*.13*(a.s||1),W/(n+.3)/1.25);
  os.forEach((ob,i)=>{const nm=typeof ob=='string'?ob:ob.n,x=W*(.5+(i-(n-1)/2)*(.84/max(n,2.2))),y=ty+u*(3.4+2.4*hh(i,a.seed||1));c.fillStyle='rgba(0,0,0,.45)';c.beginPath();c.ellipse(x+s*.15,y+s*.03,s*.8,s*.12,0,0,TAU);c.fill();OBJ[nm](c,x,y,s*(ob.s||1),t,i,ob)});
  for(let i=0;i<50;i++){const x=hh(i,161)*W,y=mod(hh(i,162)*H-t*u*(.4+hh(i,163)),H);c.fillStyle=rgba('#ffe6c0',.12+.2*hh(i,164));c.fillRect(x,y,u*.12,u*.12)}
  if(a.rain)rain(c,-t,W,H,u,{n:90,al:.35});if(a.snow)snow(c,t,W,H,u,{n:60,al:.5})};

P.masks=(c,t,W,H,u,a)=>{sky(c,W,H,['#0a0405','#1c0709','#3a0d12']);
  for(let i=0;i<22;i++){const x=W*(i/22),w=W/22,g=c.createLinearGradient(x,0,x+w,0);g.addColorStop(0,'rgba(0,0,0,.38)');g.addColorStop(.5,'rgba(130,22,32,.14)');g.addColorStop(1,'rgba(0,0,0,.38)');c.fillStyle=g;c.fillRect(x,-H*.1,w+1,H*1.2)}
  const cols=W>H?7:4,rows=W>H?3:5,s=min(W/(cols+1),H*.66/(rows+.5))*.36,foc=floor(cols/2)+floor(rows/2)*cols;
  for(let r=0;r<rows;r++)for(let q=0;q<cols;q++){const i=q+r*cols,x=W*(q+1)/(cols+1),y=H*(.14+.6*(r+.5)/rows)+sin(t*.6+i)*u*.25;line(c,x,y-s*1.6,x,y-s,'rgba(0,0,0,.6)',u*.1);
    if(i==foc)glow(c,x,y,s*4.5,'#ffd9a0',.35+.1*sin(t*2));c.globalAlpha=i==foc?1:.26+.1*sin(t*.5+i*2);maskDraw(c,x,y,s,t+i,i==foc);c.globalAlpha=1}
  fog(c,t,W,H,{y:H*.86,h:H*.2,col:'#5a0f18',al:.3,n:4});if(a.mirror){c.strokeStyle=rgba('#ffd9a0',.5);c.lineWidth=u*.15;c.strokeRect(W*.5-s*1.6,H*.14+.6*H*(floor(rows/2)+.5)/rows-s*1.9,s*3.2,s*3.8)}};

P.ticker=(c,t,W,H,u,a)=>{sky(c,W,H,['#030705','#07110c','#0c1a12']);const cols=max(3,floor(W/(u*6)));
  for(let q=0;q<cols;q++){const x=(q+.5)*W/cols,sp=u*(3+4*hh(q,171));for(let r=0;r<18;r++){const y=mod(r*u*3.4-t*sp+hh(q,172)*H,H*1.1)-H*.05,v=(hh(q*31+r,173)*900+12)|0,dn=hh(q*31+r,174)>.25;txt(c,(dn?'-':'+')+v,x,y,u*1.3,rgba(dn?'#e2553f':'#5fbf7a',.14+.3*hh(q*7+r,175)))}}
  const x0=W*.08,x1=W*.92,y0=H*.24,y1=H*.62;c.strokeStyle=rgba('#d9b25a',.25);c.lineWidth=u*.06;for(let k=0;k<5;k++){c.beginPath();c.moveTo(x0,lerp(y0,y1,k/4));c.lineTo(x1,lerp(y0,y1,k/4));c.stroke()}
  const N=90,prog=clamp(t/7),f=i=>{const p=i/N,up=p<.62?.75*pow(p/.62,1.4)+.05*sin(p*40)+.03*sin(p*90):.75-.87*eo((p-.62)/.3)+.02*sin(p*70);return lerp(y1,y0,clamp(up+.12))};
  c.strokeStyle='#f1d28a';c.lineWidth=u*.22;c.lineJoin='round';c.beginPath();for(let i=0;i<=N*prog;i++){const x=lerp(x0,x1,i/N);i?c.lineTo(x,f(i)):c.moveTo(x,f(i))}c.stroke();
  const li=floor(N*prog),lx=lerp(x0,x1,li/N),ly=f(li);glow(c,lx,ly,u*5,prog>.62?'#e2553f':'#f1d28a',.7);
  txt(c,'DOW 1929',x0,y0-u*2.6,u*2,rgba('#f1d28a',.85),{al:'left',w:700});txt(c,'OCT > FEB',x1,y0-u*2.6,u*2,rgba('#e2553f',.55+.4*sin(t*4)),{al:'right',w:700});
  c.save();c.translate(0,H*.7);c.rotate(-.04);c.fillStyle='#e9e0c8';c.fillRect(-W*.1,0,W*1.2,u*3);const s='  RADIO 94 1/2 . STEEL 262 . MOTORS 73 . RAIL 188 . COPPER 41 . UTIL 119 .';c.font='700 '+(u*1.5)+'px '+MONO;c.fillStyle='#2a1a10';c.textAlign='left';c.textBaseline='middle';const tw=max(10,c.measureText(s).width);for(let x=-mod(t*u*9,tw);x<W*1.1;x+=tw)c.fillText(s,x,u*1.55);c.restore();
  for(let i=0;i<34;i++){const ph=fr(hh(i,181)+t*(.06+.08*hh(i,182))),x=hh(i,183)*W,y=H*(.99-ph*.5),r=u*.9*(1-ph*.6);c.fillStyle=rgba('#d9b25a',(1-ph)*.9);c.beginPath();c.ellipse(x,y,r,max(.5,r*abs(cos(t*2+i))),0,0,TAU);c.fill()}};

P.forest=(c,t,W,H,u,a)=>{const hz=H*.76;sky(c,W,H,['#060505','#1a0f0a','#4a2410','#8a4a1c'],0,hz);glow(c,W*.5,hz,max(W,H)*.6,'#d9621e',.3);fog(c,t,W,H,{y:H*.42,h:H*.4,col:'#3a2a22',al:.3,n:6});
  for(let L=0;L<3;L++){const n=9+L*3,col=['#2a160c','#150b07','#070403'][L];for(let i=0;i<n;i++){const x=W*(hh(i,190+L)*1.1-.05),h=u*(22+26*hh(i,193+L))*(.6+.25*L),w=u*(.6+.9*hh(i,196+L))*(.6+.4*L);
      poly(c,[x-w,hz+u*L*2,x-w*.5,hz-h,x+w*.2,hz-h*1.02,x+w,hz+u*L*2],col);c.strokeStyle=col;c.lineWidth=w*.35;c.lineCap='round';
      for(let k=0;k<3;k++){const by=hz-h*(.35+.2*k),d=hh(i*5+k,199)>.5?1:-1;c.beginPath();c.moveTo(x,by);c.lineTo(x+d*u*(2+3*hh(i+k,200)),by-u*(1+2*hh(i,k+201)));c.stroke()}}}
  c.fillStyle='#050302';c.fillRect(-W*.1,hz+u*3,W*1.2,H);
  for(let i=0;i<30;i++)glow(c,hh(i,205)*W,hz+u*(2+7*hh(i,206)),u*(1+2*hh(i,207)),'#ff7a2a',.35*(.5+.5*sin(t*(1+hh(i,208)*2)+i)));
  embers(c,t,W,H,u,{n:80,y:hz+u*4,h:.7,col:'#ffa24a'});snow(c,t,W,H,u,{n:60,col:'#8a8580',al:.5,sp:.4});
  const cx=W*.5,cy=a.close?H*.5:H*.58,s=u*(a.close?14:9);glow(c,cx,cy-s*.2,s*2.4,'#ffe2b0',a.close?.16:.08);
  c.save();c.translate(cx,cy);c.rotate(-.15+sin(t*.7)*.02);c.strokeStyle='#1a0f0a';c.lineWidth=s*.05;c.lineCap='round';c.beginPath();c.moveTo(-s*.9,s*.5);c.quadraticCurveTo(-s*.2,s*.1,s*.8,-s*.55);c.stroke();
  for(let k=0;k<7;k++){const p=k/6,bx=lerp(-s*.6,s*.7,p),by=lerp(s*.34,-s*.47,p)-sin(p*PI)*s*.06;for(const d of[-1,1]){c.save();c.translate(bx,by);c.rotate(-.55+d*1.0);c.fillStyle=(a.alive&&k>3)?'#4a7a42':'#120a07';c.beginPath();c.ellipse(s*.2,0,s*.2,s*.055,0,0,TAU);c.fill();c.restore()}}
  for(let k=0;k<11;k++){const an=k*2.4,r=s*.17*sqrt(k/11);c.fillStyle=k%3?'#c0281f':'#e2462f';c.beginPath();c.arc(s*.86+cos(an)*r,-s*.3+sin(an)*r,s*.058,0,TAU);c.fill()}c.restore()};

P.banquet=(c,t,W,H,u,a)=>{sky(c,W,H,['#050406','#120b0c','#24130f']);const vx=W*.5,vy=H*.26;
  for(let i=0;i<4;i++){const d=i<2?-1:1,k=i%2,x=vx+d*W*(.17+.21*k),w=W*(.06+.05*k),h=H*(.2+.16*k),y=vy-h*.45;c.save();c.fillStyle='#0d1c26';c.beginPath();c.moveTo(x-w/2,y+h);c.lineTo(x-w/2,y+w/2);c.arc(x,y+w/2,w/2,PI,0);c.lineTo(x+w/2,y+h);c.closePath();c.fill();c.clip();rain(c,-t,W,H,u,{n:70,al:.55,seed:i*9});c.restore();line(c,x,y,x,y+h,'#050406',u*.2);line(c,x-w/2,y+h*.5,x+w/2,y+h*.5,'#050406',u*.2)}
  line(c,vx,-H*.1,vx,vy-H*.1,'#3a2a16',u*.2);for(let k=0;k<9;k++){const an=k/8*PI,x=vx+cos(an)*u*6,y=vy-H*.1+sin(an)*u*2.2;glow(c,x,y,u*3,'#ffe0a8',.5);c.fillStyle='#fff3d6';c.fillRect(x-u*.15,y-u*.15,u*.3,u*.3)}
  const fy=H*.92,nw=W*.94,fw=W*.12,ty=vy+H*.06,g=c.createLinearGradient(0,ty,0,fy);g.addColorStop(0,'#6a5a48');g.addColorStop(1,'#e2d7bf');poly(c,[vx-fw/2,ty,vx+fw/2,ty,vx+nw/2,fy,vx-nw/2,fy],g);
  poly(c,[vx-fw*.12,ty,vx+fw*.12,ty,vx+nw*.12,fy,vx-nw*.12,fy],'rgba(128,22,28,.8)');c.fillStyle='#1a100c';c.fillRect(-W*.1,fy,W*1.2,H);
  const at=(p,side)=>{const y=lerp(ty,fy,p*p*.86+.06),q=(y-ty)/(fy-ty);return[vx+side*lerp(fw,nw,q)/2*.7,y,lerp(.24,1,q),side]};
  const seats=[[vx,ty+u*.6,.24,0]];for(let i=0;i<6;i++)seats.push(at(.14+i*.165,-1),at(.14+i*.165,1));
  seats.sort((p,q)=>p[1]-q[1]).forEach(([x,y,z,side],i)=>{const s=min(W*.085,u*7)*z;c.fillStyle='#0a0606';if(side){rr(c,x+side*s*1.7-s*.55,y-s*2.2,s*1.1,s*2.1,s*.25);c.fill()}else{rr(c,x-s*1.1,y-s*4,s*2.2,s*3.4,s*.4);c.fill()}
    c.fillStyle='#f3ecd8';c.beginPath();c.ellipse(x,y,s*.85,s*.28,0,0,TAU);c.fill();c.fillStyle='#d9b25a';for(let k=0;k<3;k++){c.beginPath();c.ellipse(x+(k-1)*s*.24,y-s*.06*k,s*.24,s*.09,0,0,TAU);c.fill()}
    const cx=x-side*s*1.2,cy=y-s*.2;c.fillStyle='#e6dcc3';c.fillRect(cx-s*.07,cy-s*1.1,s*.14,s*1.1);flame(c,cx,cy-s*1.1,s*.42,t,i,'#ffcf7a',a.end?1+2.4*sm((t-3)/6):1)});
  glow(c,vx,ty-u*3,u*16,'#ffd9a0',.14);if(a.end)rain(c,-t,W,H,u,{n:120,al:.4*sm((t-2)/5)})};

P.sleep=(c,t,W,H,u,a)=>{sky(c,W,H,['#04090c','#0a1a20','#12303a']);c.save();c.rotate(-.12);for(let i=0;i<12;i++){c.fillStyle=rgba('#9fd3dc',.04);c.fillRect(-W*.3,H*.08+i*u*4.2,W*1.6,u*1.7)}c.restore();
  const cx=W*.5,cy=H*.1,L=min(H*.34,W*.72),an=sin(t*1.25)*.42,bx=cx+sin(an)*L,by=cy+cos(an)*L;
  for(let i=0;i<9;i++){const ph=fr(t*.07+i/9),r=ph*max(W,H)*.55;c.strokeStyle=rgba('#9fd3dc',(1-ph)*.17);c.lineWidth=u*.12;c.beginPath();c.arc(cx,cy+L,r,0,TAU);c.stroke()}
  c.strokeStyle='#b8893f';c.lineWidth=u*.12;c.setLineDash([u*.5,u*.35]);c.beginPath();c.moveTo(cx,cy);c.lineTo(bx,by);c.stroke();c.setLineDash([]);
  for(let k=1;k<6;k++){const a2=sin((t-k*.07)*1.25)*.42;c.fillStyle=rgba('#e3c27a',.07);c.beginPath();c.arc(cx+sin(a2)*L,cy+cos(a2)*L,u*3,0,TAU);c.fill()}
  glow(c,bx,by,u*9,'#e3c27a',.25);c.fillStyle='#c9a24a';c.beginPath();c.arc(bx,by,u*3.1,0,TAU);c.fill();c.fillRect(bx-u*.4,by-u*3.9,u*.8,u*.9);c.fillStyle='#f3ead2';c.beginPath();c.arc(bx,by,u*2.6,0,TAU);c.fill();
  c.strokeStyle='#2a1a10';c.lineWidth=u*.1;for(let k=0;k<12;k++){const q=k/12*TAU;c.beginPath();c.moveTo(bx+cos(q)*u*2.2,by+sin(q)*u*2.2);c.lineTo(bx+cos(q)*u*2.5,by+sin(q)*u*2.5);c.stroke()}
  line(c,bx,by,bx+cos(-t*.9)*u*1.9,by+sin(-t*.9)*u*1.9,'#2a1a10',u*.14);line(c,bx,by,bx+cos(-t*.075-1)*u*1.3,by+sin(-t*.075-1)*u*1.3,'#2a1a10',u*.2);
  c.strokeStyle=rgba('#9fd3dc',.06);c.lineWidth=1;for(let x=0;x<W;x+=u*3){c.beginPath();c.moveTo(x,H*.6);c.lineTo(x,H*.84);c.stroke()}
  for(let r=0;r<3;r++){const y0=H*(.65+.065*r);c.strokeStyle=rgba(r==1?'#e3a646':'#9fd3dc',.8-.2*r);c.lineWidth=u*.14;c.beginPath();for(let x=0;x<=W;x+=u*.5){const p=x/W*18+t*(1.4+r*.3),y=y0+sin(p*.5+r)*u*1.2+(sin(p*3.1+r*2)+sin(p*7.7))*u*.35*(.4+.6*abs(sin(p*.13+t*.2)));x?c.lineTo(x,y):c.moveTo(x,y)}c.stroke()}
  txt(c,'ARTIFICIAL SOMNAMBULISM  REC',W*.065,H*.585,u*1.5,rgba('#9fd3dc',.5+.3*sin(t*3)),{al:'left'});c.fillStyle=rgba('#e2553f',.5+.5*sin(t*3));c.beginPath();c.arc(W*.035,H*.585,u*.4,0,TAU);c.fill()};

P.school=(c,t,W,H,u,a)=>{const v=a.v||'leaflet',hz=H*.62,dark=v=='escape'||v=='attack';
  sky(c,W,H,{leaflet:['#8fb0c2','#c9d6d2','#e6dfc8'],escape:['#0a0e1c','#27304a','#7a5a4a'],doves:['#6f8ea6','#a9bfc8','#d9d6c4'],attack:['#07060a','#1c1016','#5a2416']}[v],0,hz);
  if(dark)stars(c,t,W,H,u,{n:50,y1:.4,al:.5});else{cloud(c,W*.2+t*u*.2,H*.18,u*5,'#f1eee2');cloud(c,W*.78+t*u*.12,H*.28,u*7,'#ebe8dc')}
  ridge(c,W,H,{base:hz-u*6,amp:u*7,seed:3,col:v=='attack'?'#150c10':v=='escape'?'#1a1f33':'#7f9a8a'});ridge(c,W,H,{base:hz+u,amp:u*3,seed:8,col:v=='attack'?'#0c070a':v=='escape'?'#101425':'#5d7a60',f:.7});
  const stone=dark?'#0a0c12':'#3a3f45',st2=dark?'#06070b':'#2c3036',bx=W*.5,by=hz+u*1.5,bw=min(W*.52,u*40),bh=u*10;
  c.fillStyle=st2;c.fillRect(bx-bw/2,by-bh,bw,bh);poly(c,[bx-bw/2-u,by-bh,bx,by-bh-u*3.5,bx+bw/2+u,by-bh],st2);c.fillRect(bx-u*2.2,by-bh-u*11,u*4.4,u*11);poly(c,[bx-u*2.6,by-bh-u*11,bx,by-bh-u*15.5,bx+u*2.6,by-bh-u*11],st2);
  c.fillStyle=dark?'#ffd9a0':'#efe7d3';c.beginPath();c.arc(bx,by-bh-u*8,u*1.4,0,TAU);c.fill();line(c,bx,by-bh-u*8,bx+cos(t*.3-1.5)*u*1.1,by-bh-u*8+sin(t*.3-1.5)*u*1.1,'#111111',u*.14);
  for(let r=0;r<3;r++)for(let q=0;q<floor(bw/(u*2.2));q++){c.fillStyle=dark?(hh(q+r*31,5)<.35?rgba('#ffd08a',.85):'#111620'):'#1c2228';c.fillRect(bx-bw/2+u*.65+q*u*2.2,by-bh+u*1.4+r*u*2.8,u*.9,u*1.5)}
  const wy=hz+u*6,wh=u*5.5;c.fillStyle=stone;c.fillRect(-W*.1,wy-wh,W*1.2,wh+u*2);c.fillStyle='rgba(0,0,0,.2)';for(let x=0;x<W;x+=u*3.1)c.fillRect(x,wy-wh,u*.12,wh);
  [.1,.36,.64,.9].forEach((p,i)=>{const x=W*p,th=u*13,ww=u*3.4;c.fillStyle=st2;c.fillRect(x-ww/2,wy-th,ww,th+u*2);c.fillRect(x-ww*.7,wy-th-u*1.2,ww*1.4,u*1.4);poly(c,[x-ww*.8,wy-th-u*1.2,x,wy-th-u*4,x+ww*.8,wy-th-u*1.2],st2);
    c.fillStyle=dark?'#ffd08a':'#14181c';c.fillRect(x-u*.35,wy-th+u*1.5,u*.7,u*1.4);
    if(v=='doves'||v=='attack'){const hit=v=='attack'&&i!=1,t1=2+i*2.2;if(!(hit&&t>t1)){dove(c,x,wy-th-u*4.3,u*1.5,'#f4f2ea');glow(c,x,wy-th-u*4.6,u*4,'#ffffff',.25)}
      if(hit){const e=clamp((t-t1)/1.5);if(e>0){glow(c,x,wy-th-u*2,u*15*(1-e*.5),'#ff8a3a',.9*(1-e)+.25);for(let k=0;k<4;k++)flame(c,x+(k-1.5)*u*1.1,wy-th+u*.5-k%2*u,u*(1.6+hh(k,3)),t,k+i*5,'#ff9a3a')}}}});
  c.fillStyle='#050608';c.beginPath();c.moveTo(bx-u*2,wy+u*2);c.lineTo(bx-u*2,wy-u*2.6);c.arc(bx,wy-u*2.6,u*2,PI,0);c.lineTo(bx+u*2,wy+u*2);c.fill();
  const ox=W*.24,oy=wy-wh+u*.5;tree(c,ox,oy+u*2,u*5.5,dark?'#06070a':'#2a2418',7);c.fillStyle=dark?'#080b0e':'#3f5a3a';for(let k=0;k<12;k++){c.beginPath();c.arc(ox+(hh(k,211)-.5)*u*12,oy-u*(5.5+6*hh(k,212)),u*(2.4+2*hh(k,213)),0,TAU);c.fill()}
  const g=c.createLinearGradient(0,wy+u*2,0,H);g.addColorStop(0,dark?'#07080c':'#4f6a48');g.addColorStop(1,dark?'#020203':'#1f2c20');c.fillStyle=g;c.fillRect(-W*.1,wy+u*2,W*1.2,H);
  if(v=='doves'||v=='attack'){const e=v=='attack'?clamp(1-(t-3)/8,.15,1):1;c.strokeStyle=rgba('#ffffff',.5*e*(v=='attack'?.6+.4*sin(t*12):1));c.lineWidth=u*.16;c.setLineDash(v=='attack'?[u*2,u*1.5]:[]);c.beginPath();c.ellipse(bx,wy+u*2,W*.56,H*.46,0,PI,TAU);c.stroke();c.setLineDash([])}
  if(v=='leaflet')for(let i=0;i<46;i++){const ph=fr(hh(i,221)+t*(.035+.03*hh(i,222))),x=hh(i,223)*W+sin(t*.9+i)*u*4,y=ph*H*.95,rot=t*(1+hh(i,224)*2)+i,f=abs(cos(rot*.7));c.save();c.translate(x,y);c.rotate(rot);c.fillStyle=rgba('#fbf8ee',.95);c.fillRect(-u*.9,-u*.6*f,u*1.8,u*1.2*f+.5);c.restore()}
  if(v=='escape'){for(let i=0;i<5;i++){const p=clamp((t-1-i*.6)/8),x=lerp(bx+u*(i-2)*1.2,W*.78+i*u*.8,sm(p)),y=wy+u*(3.5+3*sin(p*PI));glow(c,x,y,u*3.5,'#ffd08a',.6);c.fillStyle='#fff0c8';c.beginPath();c.arc(x,y,u*.3,0,TAU);c.fill()}
    c.save();c.beginPath();c.rect(-W*.1,-H*.1,W*1.2,wy-wh+H*.1);c.clip();rain(c,-t,W,H,u,{n:150,al:.55*sm((t-4)/5)});c.restore()}
  if(v=='attack'){embers(c,t,W,H,u,{n:90,y:wy,h:.7});fog(c,t,W,H,{y:hz-u*8,h:H*.3,col:'#3a2220',al:.35,n:6});rain(c,-t,W,H,u,{n:120,al:.45*sm((t-6)/5)})}
  if(v=='doves')birds(c,t,W,H,u,{n:7,x:bx,y:hz-u*20,r:u*16,col:'#f4f2ea',s:1.2})};

const SOL={tet:{v:[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],e:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]},
  cube:{v:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],e:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]},
  oct:{v:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],e:[[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]]}};
function solid(c,k,x,y,s,ax,ay,col,lw){const S=SOL[k],p=S.v.map(([X,Y,Z])=>{const x1=X*cos(ay)+Z*sin(ay),z0=-X*sin(ay)+Z*cos(ay),y1=Y*cos(ax)-z0*sin(ax),z1=Y*sin(ax)+z0*cos(ax),f=3/(3.6+z1);return[x+x1*s*f,y+y1*s*f]});
  c.strokeStyle=col;c.lineWidth=lw;c.lineJoin='round';c.beginPath();S.e.forEach(([i,j])=>{c.moveTo(p[i][0],p[i][1]);c.lineTo(p[j][0],p[j][1])});c.stroke()}
P.geometry=(c,t,W,H,u,a)=>{const hz=H*.72;sky(c,W,H,['#05070c','#0f1826','#25384a']);glow(c,W*.5,hz,max(W,H)*.6,'#4a7388',.35);
  c.fillStyle='#04060a';c.fillRect(-W*.1,hz-u*9,W*.44,u*10);for(let x=-u;x<W*.33;x+=u*3)c.fillRect(x,hz-u*10,u*1.6,u*1.2);
  wetGround(c,t,W,H,u,hz,'#060a10','#020304');
  for(let i=0;i<6;i++){const x=W*(.12+.15*i),y=hz+u*(3+5*hh(i,231));c.fillStyle='#1c2430';c.beginPath();c.ellipse(x,y,u*2.2,u*.5,0,0,TAU);c.fill();c.fillStyle='#2c3a4a';c.beginPath();c.ellipse(x-u*.6,y-u*.25,u*.7,u*.3,.2,0,TAU);c.fill();c.beginPath();c.ellipse(x+u*.7,y-u*.2,u*.7,u*.3,-.2,0,TAU);c.fill();c.fillStyle=['#7a2a2a','#2a5a6a','#8a7a3a'][i%3];c.fillRect(x-u*1.2,y-u*.1,u*2.2,u*.25)}
  const ks=['tet','cube','oct'];for(let i=0;i<9;i++){const ph=fr(hh(i,241)*.9+t*(.035+.02*hh(i,242))),x=W*(.1+.8*hh(i,243))+sin(t*.4+i)*u*2,y=hz-ph*H*.75,s=u*(2.2+2.4*hh(i,244));glow(c,x,y,s*2.4,'#cfeaf2',.12*(1-ph));solid(c,ks[i%3],x,y,s,t*.5+i,t*.37+i*2,rgba('#e6f6fa',.9*(1-ph*.8)),u*.14)}
  for(let i=0;i<3;i++){const ph=fr(.3+i*.33+t*.03),x=W*(.25+.25*i),y=hz-ph*H*.75,r=u*2.6;c.strokeStyle=rgba('#e6f6fa',.8*(1-ph));c.lineWidth=u*.12;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();c.beginPath();c.ellipse(x,y,r,r*.3,0,0,TAU);c.stroke();c.beginPath();c.ellipse(x,y,r*.3,r,0,0,TAU);c.stroke()}
  rain(c,-t,W,H,u,{n:190,al:.55})};

P.broadcast=(c,t,W,H,u,a)=>{const hz=H*.7;sky(c,W,H,['#04060b','#0c1422','#1f2a3a']);stars(c,t,W,H,u,{n:70,y1:.5});
  const bw=min(W*.92,u*60),bx=W*.5,bh=u*17;c.fillStyle='#070a10';c.fillRect(bx-bw/2,hz-bh,bw,bh+H);c.fillRect(bx-bw*.18,hz-bh-u*4,bw*.36,u*4);
  for(let r=0;r<5;r++)for(let q=0;q<floor(bw/(u*2.6));q++){const id=q+r*37,on=hh(id,251)<.15+.55*clamp((t-2)/9)*hh(id,252);c.fillStyle=on?rgba('#ffd08a',.6+.3*sin(t+id)):'#0d121b';c.fillRect(bx-bw/2+u*.65+q*u*2.6,hz-bh+u*1.6+r*u*3,u*1.3,u*1.7)}
  const ax=bx,ay=hz-bh-u*4;c.strokeStyle='#0b0f17';c.lineWidth=u*.25;c.beginPath();c.moveTo(ax-u*2,ay);c.lineTo(ax,ay-u*16);c.lineTo(ax+u*2,ay);c.stroke();c.lineWidth=u*.1;for(let k=1;k<6;k++){const y=ay-k*u*2.6,w=u*2*(1-k/6.2);c.beginPath();c.moveTo(ax-w,y);c.lineTo(ax+w,y);c.lineTo(ax-w*.8,y-u*2.6);c.stroke()}
  glow(c,ax,ay-u*16,u*4,'#ff5a4a',.6+.4*sin(t*5));
  c.save();c.translate(ax+u*.2,ay-u*13);c.fillStyle='#10151f';c.beginPath();c.moveTo(0,0);for(let k=0;k<=8;k++)c.lineTo(k*u*.9,sin(t*3+k*.8)*u*.35*k/8);for(let k=8;k>=0;k--)c.lineTo(k*u*.9,u*4+sin(t*3+k*.8)*u*.35*k/8);c.closePath();c.fill();c.fillStyle='#f1d28a';c.beginPath();for(let j=0;j<10;j++){const an=j/10*TAU-PI/2,r=j%2?u*.55:u*1.3;c.lineTo(u*3.6+cos(an)*r,u*2+sin(an)*r)}c.closePath();c.fill();c.restore();
  c.lineWidth=u*.11;for(let i=0;i<8;i++){const ph=fr(t*.2+i/8),r=ph*max(W,H)*.8;c.strokeStyle=rgba('#ffcf8a',(1-ph)*.5);c.beginPath();c.arc(ax,ay-u*16,r,PI*1.12,PI*1.88);c.stroke()}
  c.strokeStyle=rgba('#f1d28a',.8);c.lineWidth=u*.16;c.beginPath();for(let x=0;x<=W;x+=u*.6){const p=x/u*.35,y=H*.16+sin(p+t*6)*sin(p*.13+t*.7)*u*3.2*(.5+.5*sin(t*1.3+p*.05));x?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();
  for(let i=0;i<24;i++){const ph=fr(hh(i,261)+t*.06),x=bx+(hh(i,262)-.5)*bw*1.2+ph*u*8,y=hz-bh*hh(i,263)+ph*H*.35;c.save();c.translate(x,y);c.rotate(t*2+i);c.fillStyle=rgba('#f4efe0',.8*(1-ph));c.fillRect(-u*.7,-u*.5,u*1.4,u);c.restore()}};

P.vote=(c,t,W,H,u,a)=>{sky(c,W,H,['#0a0806','#1a130c','#0a0806']);const cx=W*.5,cy=H*.44,R=min(W*.38,H*.27);glow(c,cx,cy,R*2.4,'#e3b56a',.25);
  for(let i=0;i<14;i++){const an=i/14*TAU+PI/14,x=cx+cos(an)*R*1.22,y=cy+sin(an)*R*1.22;c.save();c.translate(x,y);c.rotate(an);c.fillStyle=cos(an)<0?'#4a6a88':'#a8742e';rr(c,-u*1.2,-u*1.6,u*2.4,u*3.2,u*.5);c.fill();c.restore()}
  const g=c.createRadialGradient(cx-R*.3,cy-R*.3,R*.1,cx,cy,R);g.addColorStop(0,'#a8733c');g.addColorStop(1,'#3d2614');c.fillStyle=g;c.beginPath();c.arc(cx,cy,R,0,TAU);c.fill();c.strokeStyle='#1a0f08';c.lineWidth=u*.5;c.stroke();
  c.strokeStyle='rgba(0,0,0,.22)';c.lineWidth=u*.1;for(let k=1;k<7;k++){c.beginPath();c.arc(cx,cy,R*k/7,0,TAU);c.stroke()}line(c,cx,cy-R,cx,cy+R,'rgba(0,0,0,.35)',u*.2);
  for(let i=0;i<10;i++){const an=i/10*TAU+.3,x=cx+cos(an)*R*.72,y=cy+sin(an)*R*.72;c.save();c.translate(x,y);c.rotate(an+hh(i,271));c.fillStyle='#e9e0c8';c.fillRect(-u*1.3,-u*.9,u*2.6,u*1.8);c.fillStyle='rgba(40,30,20,.5)';for(let k=0;k<3;k++)c.fillRect(-u,-u*.5+k*u*.45,u*(1.2+hh(i+k,3)*.7),u*.1);c.restore()}
  c.fillStyle='#0c0805';c.beginPath();c.arc(cx,cy,R*.2,0,TAU);c.fill();c.strokeStyle='#b8893f';c.lineWidth=u*.2;c.stroke();
  for(let i=0;i<14;i++){const p=clamp((t-.8-i*(a.bp||.45))/1.2);if(p<=0||p>=1)continue;const an=i/14*TAU+PI/14,x=lerp(cx+cos(an)*R*.9,cx,eo(p)),y=lerp(cy+sin(an)*R*.9,cy,eo(p));c.fillStyle=rgba('#fbf8ee',1-p*.6);c.fillRect(x-u*.6,y-u*.4,u*1.2,u*.8)}
  const sp=clamp((t-(a.at||7.6))/.35);if(sp>0){c.save();c.translate(cx,cy);c.rotate(-.12);const k=1+(1-sp)*.8;c.scale(k,k);c.globalAlpha=sp*.94;const w=min(W*.8,u*46),h=u*9;c.fillStyle='rgba(10,8,6,.55)';c.fillRect(-w/2,-h/2,w,h);c.strokeStyle='#d8402f';c.lineWidth=u*.4;c.strokeRect(-w/2,-h/2,w,h);c.lineWidth=u*.12;c.strokeRect(-w/2+u*.8,-h/2+u*.8,w-u*1.6,h-u*1.6);
    txt(c,'通過',-w*.26,u*.2,u*4.6,'#e2493a',{f:SERIF,w:900});txt(c,'PASSED',w*.17,-u*1.5,u*2.1,'#e2493a',{w:700});txt(c,'6 OCT 1913',w*.17,u*1.6,u*1.7,'#e2493a',{w:700});c.restore();c.globalAlpha=1}};
/* ---------- 場景：第五章至第十章 ---------- */
P.island=(c,t,W,H,u,a)=>{const war=a.v=='bombard',hz=H*.6,ix=W*.5;
  sky(c,W,H,war?['#0d0606','#3a1410','#a04a22']:['#050b1c','#12264a','#3a6a8a'],0,hz);
  for(let i=0;i<80;i++){const x=hh(i,301)*W,y=hh(i,302)*hz*.92,s=hh(i,303);txt(c,String(floor(hh(i,304)*10)),x,y,u*(1+1.5*s),rgba(war?'#ffcaa0':'#dff0ff',(.2+.6*s)*(.6+.4*sin(t*(.5+s)+i))),{f:FELL})}
  const circ=war?clamp(1-(t-2)/5):1;if(circ>0){c.strokeStyle=rgba('#dff0ff',.6*circ*(war?.5+.5*sin(t*15):1));c.lineWidth=u*.16;if(war)c.setLineDash([u*2,u*2]);c.beginPath();c.ellipse(ix,hz,min(W*.47,u*46),min(H*.36,u*34),0,PI,TAU);c.stroke();c.setLineDash([])}
  water(c,t,W,H,u,{y:hz,c1:war?'#3a1a14':'#12325a',c2:war?'#0a0403':'#030814',gl:war?'#ffb07a':'#cfe6ff',al:.35,n:90});
  c.fillStyle=war?'#0a0504':'#0a1424';c.beginPath();c.moveTo(ix-u*30,hz+u);c.bezierCurveTo(ix-u*20,hz-u*4,ix-u*12,hz-u*13,ix-u*2,hz-u*14);c.bezierCurveTo(ix+u*8,hz-u*15,ix+u*16,hz-u*6,ix+u*30,hz+u);c.closePath();c.fill();
  const tx=ix-u,ty=hz-u*14,tw=u*11,th=u*5.5,wc=war?'#e9c9a8':'#f3f0e6';glow(c,tx,ty-th*.5,u*12,war?'#ff8a4a':'#fff6dc',.22);
  c.fillStyle=wc;c.fillRect(tx-tw/2,ty-u*.5,tw,u*.6);for(let k=0;k<6;k++){if(!(war&&t>3+k*1.1&&k%2))c.fillRect(tx-tw/2+u*.5+k*(tw-u*1.8)/5,ty-th,u*.8,th-u*.4)}
  c.fillRect(tx-tw/2-u*.2,ty-th-u*.6,tw+u*.4,u*.7);poly(c,[tx-tw/2-u*.4,ty-th-u*.6,tx,ty-th-u*2.8,tx+tw/2+u*.4,ty-th-u*.6],wc);
  for(let k=0;k<9;k++){const x=ix+(hh(k,311)-.5)*u*36,y=hz-u*(1+5*hh(k,312))*(1-abs(x-ix)/(u*30));c.fillStyle=wc;c.fillRect(x,y-u*1.2,u*1.6,u*1.2);c.fillStyle=war?'#0a0504':'#2a5a8a';c.beginPath();c.arc(x+u*.8,y-u*1.2,u*.8,PI,0);c.fill()}
  if(war){for(let j=0;j<2;j++){const x=W*(.1+.8*j)+sin(t*.2+j)*u,y=hz-u*.2,d=j?-1:1;poly(c,[x-u*5,y,x+u*6,y,x+u*5,y+u,x-u*4,y+u],'#050303');c.fillStyle='#050303';c.fillRect(x-u*1.5,y-u*1.4,u*3,u*1.4);c.fillRect(x-u*.3,y-u*3,u*.5,u*1.8);
      for(let s=0;s<2;s++){const p=fr(t*.33+j*.5+s*.47),sx=x+d*u*3,ex=ix+(j+s-1)*u*7,px=lerp(sx,ex,p),py=y-sin(p*PI)*H*.3;if(p<.08)glow(c,sx,y-u,u*9,'#ffe0a0',1-p/.08);
        c.strokeStyle=rgba('#ffb07a',.45);c.lineWidth=u*.1;c.beginPath();for(let q=0;q<10;q++){const pp=max(0,p-q*.02),xx=lerp(sx,ex,pp),yy=y-sin(pp*PI)*H*.3;q?c.lineTo(xx,yy):c.moveTo(xx,yy)}c.stroke();c.fillStyle='#fff0c8';c.beginPath();c.arc(px,py,u*.3,0,TAU);c.fill();
        if(p>.9)glow(c,ex,hz-u*8,u*20*(p-.9)/.1,'#ffb45a',.9)}}
    embers(c,t,W,H,u,{n:60,x0:ix-u*20,x1:ix+u*20,y:hz-u*6,h:.4});fog(c,t,W,H,{y:hz-u*14,h:H*.25,col:'#2a1612',al:.4,n:5})}};

P.cave=(c,t,W,H,u,a)=>{sky(c,W,H,['#060504','#0f0b08','#1a1009']);const fx=W*.28,fy=H*.72;glow(c,fx,fy,max(W,H)*.7,'#ff8a2a',.3+.05*sin(t*7));
  const wy=H*.2,wh=H*.34;c.fillStyle=rgba('#c9833a',.17+.03*sin(t*9));c.beginPath();c.ellipse(W*.56,wy+wh/2,W*.48,wh*.62,0,0,TAU);c.fill();
  for(let i=0;i<8;i++){const x=mod(i*W*.21-t*u*2.2,W*1.68)-W*.2,y=wy+wh*.58+sin(t+i)*u*.6,s=u*(3.6+hh(i,321)*1.8),k=i%5;c.fillStyle='rgba(8,5,3,.82)';c.fillRect(x-u*.12,y,u*.24,H);c.beginPath();
    if(k==0)c.ellipse(x,y-s*.5,s*.36,s*.5,0,0,TAU);else if(k==1){c.moveTo(x-s*.6,y);c.lineTo(x,y-s);c.lineTo(x+s*.6,y)}else if(k==2)c.arc(x,y-s*.5,s*.5,0,TAU);else if(k==3){c.moveTo(x-s*.7,y-s*.3);c.quadraticCurveTo(x,y-s*1.1,x+s*.7,y-s*.3);c.quadraticCurveTo(x,y-s*.5,x-s*.7,y-s*.3)}else c.rect(x-s*.4,y-s*.8,s*.8,s*.8);c.fill()}
  c.fillStyle='#030202';c.beginPath();c.moveTo(-W*.1,-H*.1);c.lineTo(W*1.1,-H*.1);for(let k=24;k>=-2;k--)c.lineTo(W*k/22,H*(.11+.07*hh(k+50,331)));c.closePath();c.fill();
  for(let i=0;i<14;i++){const x=hh(i,335)*W,l=u*(4+10*hh(i,336));poly(c,[x-u*1.2,H*.12,x+u*1.2,H*.12,x,H*.14+l],'#030202')}
  c.fillStyle='#050302';c.fillRect(-W*.1,wy+wh*.8,W*1.2,H);c.fillStyle='#0b0705';c.beginPath();c.moveTo(-W*.1,H*1.1);for(let k=-2;k<=32;k++)c.lineTo(W*k/30,H*(.79+.04*hh(k+90,341)));c.lineTo(W*1.1,H*1.1);c.fill();
  c.fillStyle='#120a06';c.fillRect(fx-u*4,fy,u*8,u*.7);for(let k=0;k<5;k++)flame(c,fx+(k-2)*u*1.3,fy,u*(3.4-abs(k-2)*.7),t,k,'#ff9a3a');
  c.strokeStyle='rgba(140,128,116,.55)';c.lineWidth=u*.14;c.setLineDash([u*.4,u*.3]);for(let i=0;i<4;i++){const x=W*(.52+.11*i);c.beginPath();c.moveTo(x,H*.85);c.quadraticCurveTo(x+u*2,H*.9,x+u*3.5,H*.85);c.stroke()}c.setLineDash([]);
  const mx=W*.86,my=H*.2;glow(c,mx,my,u*18,'#dff0ff',.55);c.fillStyle='#eaf6ff';c.beginPath();c.ellipse(mx,my,u*2.4,u*3.4,.3,0,TAU);c.fill();
  if(a.answer)for(let i=0;i<16;i++){const p=fr(t*.06+i/16),x=lerp(mx,W*.34,p)+sin(p*8+i)*u*2,y=lerp(my,H*.6,p);txt(c,String(floor(hh(i,345)*10)),x,y,u*(1.2+4.4*p),rgba('#eaf6ff',sin(p*PI)*.95),{f:SERIF,w:900})}};

P.numbers=(c,t,W,H,u,a)=>{sky(c,W,H,['#03040c','#0a1030','#141c44']);const cx=W*.5,cy=H*.42,R=min(W*.42,H*.28);glow(c,cx,cy,R*2.2,'#3a5ad0',.25);
  if(a.v=='sqrt2'){const d='41421356237309504880168872420969807856967187537694807317667973799073247846210703885',s=R*.6;
    for(let i=0;i<d.length;i++){const an=i*.44-t*.12,r=R*.62+i*u*.64;if(r>max(W,H)*.74)break;txt(c,d[i],cx+cos(an)*r,cy+sin(an)*r,u*(1.5+.014*i),rgba('#dfe6ff',clamp(1.15-r/(max(W,H)*.7))*.9),{f:FELL})}
    c.fillStyle='rgba(3,4,12,.6)';c.fillRect(cx-s/2,cy-s/2,s,s);c.strokeStyle=rgba('#dfe6ff',.85);c.lineWidth=u*.16;c.strokeRect(cx-s/2,cy-s/2,s,s);c.strokeStyle='#e3a646';c.lineWidth=u*.26;c.beginPath();c.moveTo(cx-s/2,cy+s/2);c.lineTo(cx+s/2,cy-s/2);c.stroke();
    txt(c,'1',cx,cy+s/2+u*2,u*2.2,'#dfe6ff',{f:FELL,it:1});txt(c,'1',cx-s/2-u*1.6,cy,u*2.2,'#dfe6ff',{f:FELL,it:1});c.save();c.shadowColor='#e3a646';c.shadowBlur=u*2;txt(c,'√2',cx-u*2.4,cy-u*2.2,u*3.4,'#ffd98a',{f:FELL,it:1});c.restore();return}
  const N=150;for(let i=0;i<N;i++){const ph=Math.acos(1-2*(i+.5)/N),th=i*2.39996+t*.12,x=sin(ph)*cos(th),y=cos(ph),z=sin(ph)*sin(th),f=.6+.4*(z+1)/2;txt(c,String(floor(hh(i,351)*10)),cx+x*R,cy+y*R*.92,u*(1+1.5*f*f),rgba('#cfd8ff',.15+.75*f*f),{f:FELL})}
  const nm=a.names||['6','37','77','210','888'];nm.forEach((s,i)=>{const an=t*.14+i/nm.length*TAU,x=cx+cos(an)*R*1.12,y=cy+sin(an)*R*.4+(i%2?-1:1)*u*2,f=.6+.4*sin(an);c.save();c.shadowColor='#e3a646';c.shadowBlur=u*2;txt(c,s,x,y,u*(2.8+2.4*f),rgba('#ffe1a6',.5+.5*f),{f:SERIF,w:900});c.restore()})};

P.vienna=(c,t,W,H,u,a)=>{const hz=H*.7;sky(c,W,H,['#03050d','#0a1230','#22274a','#4a3550'],0,hz);stars(c,t,W,H,u,{n:160,y1:.64,al:.5+.5*sm(t/8)});
  for(let i=0;i<9;i++){const x=hh(i,361)*W,y=hh(i,362)*hz*.7,b=.5+.5*sin(t*(.7+hh(i,363))+i),r=u*(1.2+2.2*b*sm(t/6));c.strokeStyle=rgba('#fff6dc',.7*b);c.lineWidth=u*.08;c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();glow(c,x,y,r*1.4,'#fff6dc',.5*b)}
  glow(c,W*.5,hz,max(W,H)*.5,'#b06a4a',.22);
  const fx=W*.76,fy=hz-u*15,R=u*11;c.strokeStyle='#080a14';c.lineWidth=u*.22;c.beginPath();c.arc(fx,fy,R,0,TAU);c.stroke();c.lineWidth=u*.09;c.beginPath();c.arc(fx,fy,R*.9,0,TAU);for(let k=0;k<15;k++){const an=k/15*TAU+t*.05;c.moveTo(fx,fy);c.lineTo(fx+cos(an)*R,fy+sin(an)*R)}c.stroke();
  for(let k=0;k<15;k++){const an=k/15*TAU+t*.05,x=fx+cos(an)*R,y=fy+sin(an)*R;c.fillStyle='#080a14';c.fillRect(x-u*.9,y,u*1.8,u*1.3);c.fillStyle=rgba('#ffd08a',.8);c.fillRect(x-u*.6,y+u*.3,u*1.2,u*.5)}
  c.strokeStyle='#080a14';c.lineWidth=u*.3;c.beginPath();c.moveTo(fx,fy);c.lineTo(fx-u*5,hz);c.moveTo(fx,fy);c.lineTo(fx+u*5,hz);c.stroke();
  skyline(c,t,W,H,u,{base:hz-u*2,seed:371,minH:5,maxH:13,minW:5,maxW:11,col:'#12152a',dome:1,gable:1});
  const sx=W*.28;poly(c,[sx-u*1.8,hz,sx-u*1.3,hz-u*16,sx,hz-u*28,sx+u*1.3,hz-u*16,sx+u*1.8,hz],'#06070f');
  skyline(c,t,W,H,u,{base:hz,seed:377,minH:4,maxH:11,minW:5,maxW:12,col:'#06070f',win:'#ffc878',lit:.35,dome:1,gable:1});
  c.fillStyle='#04050a';c.fillRect(-W*.1,hz,W*1.2,H);const g=c.createLinearGradient(0,hz,0,H);g.addColorStop(0,rgba('#c9d3e8',.22));g.addColorStop(1,rgba('#c9d3e8',0));c.fillStyle=g;c.fillRect(-W*.1,hz,W*1.2,H-hz);
  for(let i=0;i<4;i++){const x=W*(.12+.26*i),y=hz+u*4;line(c,x,y+u*40,x,y-u*4,'#020308',u*.25);glow(c,x,y-u*4,u*6,'#ffcf8a',.5);c.fillStyle='#ffe6b8';c.beginPath();c.arc(x,y-u*4,u*.45,0,TAU);c.fill()}
  snow(c,t,W,H,u,{n:130,al:.8})};

P.gallery=(c,t,W,H,u,a)=>{c.fillStyle='#2a0c10';c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);c.fillStyle='rgba(0,0,0,.15)';const ds=u*4;
  for(let y=0,r=0;y<H*.76;y+=ds,r++)for(let x=(r%2)*ds/2;x<W+ds;x+=ds){c.beginPath();c.moveTo(x,y-ds*.4);c.lineTo(x+ds*.28,y);c.lineTo(x,y+ds*.4);c.lineTo(x-ds*.28,y);c.fill()}
  c.fillStyle='#1a0e0a';c.fillRect(-W*.1,H*.72,W*1.2,H);c.fillStyle='#3a2416';c.fillRect(-W*.1,H*.72,W*1.2,u*1.2);
  const F=W>H?[[.18,.34,.22,.34],[.5,.32,.2,.4],[.81,.36,.2,.3],[.34,.6,.11,.13],[.66,.6,.11,.13]]:[[.3,.2,.42,.18],[.72,.35,.36,.2],[.3,.47,.4,.18],[.72,.6,.3,.13]],dr=sm((t-2)/8);
  const PAL=[['#1f3a4a','#c98a4a','#e9d9b0'],['#3a1a2a','#9a3a4a','#e3b56a'],['#22352a','#7a9a6a','#e9e0c0'],['#101828','#4a6a9a','#d9d0c0'],['#2a1a10','#8a5a2a','#d9c090']];
  F.forEach(([px,py,pw,ph],i)=>{const x=W*px,y=H*py,w=W*pw,h=H*ph,pal=PAL[i%5];glow(c,x,y-h/2,w*.9,'#ffe0a8',.22);
    c.fillStyle='#8a6a22';c.fillRect(x-w/2-u*1.2,y-h/2-u*1.2,w+u*2.4,h+u*2.4);c.fillStyle='#d9b25a';c.fillRect(x-w/2-u*.8,y-h/2-u*.8,w+u*1.6,h+u*1.6);c.fillStyle='#6b4f16';c.fillRect(x-w/2-u*.25,y-h/2-u*.25,w+u*.5,h+u*.5);
    c.save();c.beginPath();c.rect(x-w/2,y-h/2,w,h);c.clip();c.fillStyle=pal[0];c.fillRect(x-w/2,y-h/2,w,h);
    if(i==1&&a.circle){c.fillStyle='#0d0a10';c.fillRect(x-w/2,y-h/2,w,h);c.strokeStyle='#e9e0c8';c.lineWidth=u*.5;c.beginPath();c.arc(x,y,min(w,h)*.32,0,TAU);c.stroke()}
    else for(let k=0;k<7;k++){c.fillStyle=rgba(pal[1+k%2],.55);c.beginPath();c.ellipse(x+(hh(i*9+k,381)-.5)*w,y+(hh(i*9+k,382)-.5)*h,w*(.12+.2*hh(k,383)),h*(.1+.2*hh(k,384)),hh(k,385)*3,0,TAU);c.fill()}
    c.restore();
    for(let k=0;k<9;k++){const sx=x-w/2+w*hh(i*13+k,391),sw=u*(.4+.9*hh(i+k,392)),len=u*(3+16*hh(i*7+k,393))*dr*(.7+.3*sin(t*.8+k));if(len<1)continue;c.fillStyle=pal[1+k%2];rr(c,sx,y-h/2-u*.8-len,sw,len+u,sw/2);c.fill();c.beginPath();c.arc(sx+sw/2,y-h/2-u*.8-len,sw*.8,0,TAU);c.fill()}});
  c.strokeStyle='#7a1a22';c.lineWidth=u*.4;for(let i=0;i<4;i++){const x0=W*(i/3-.02),x1=W*((i+1)/3-.02);c.beginPath();c.moveTo(x0,H*.8);c.quadraticCurveTo((x0+x1)/2,H*.85,x1,H*.8);c.stroke();c.fillStyle='#b8893f';c.fillRect(x0-u*.25,H*.79,u*.5,H);c.beginPath();c.arc(x0,H*.79,u*.6,0,TAU);c.fill()}};

P.opera=(c,t,W,H,u,a)=>{const fire=a.v=='fire',e=fire?sm(t/9):0,cx=W*.5,sy=H*.64;sky(c,W,H,['#050203','#140507','#1c0708']);
  const g=c.createLinearGradient(0,H*.14,0,sy);g.addColorStop(0,fire?'#3a0d08':'#0d0a12');g.addColorStop(1,fire?'#a03a12':'#1c1626');c.fillStyle=g;c.fillRect(W*.08,H*.1,W*.84,sy-H*.1);
  if(fire)stars(c,t,W,H,u,{n:70,y1:.42,al:e});
  const spx=cx+sin(t*.3)*u*2,sg=c.createLinearGradient(0,H*.1,0,sy);sg.addColorStop(0,rgba(fire?'#ffb07a':'#fff2d0',.5));sg.addColorStop(1,rgba('#fff2d0',.08));poly(c,[cx-u,H*.08,cx+u,H*.08,spx+u*9,sy+u*2,spx-u*9,sy+u*2],sg);
  poly(c,[W*.08,sy,W*.92,sy,W*1.04,sy+u*3.6,-W*.04,sy+u*3.6],'#2e1c10');const fg=c.createLinearGradient(0,sy,0,H);fg.addColorStop(0,'#3a2416');fg.addColorStop(1,'#0a0605');c.fillStyle=fg;c.fillRect(-W*.1,sy+u*3.5,W*1.2,H);
  c.fillStyle=rgba('#fff2d0',.35);c.beginPath();c.ellipse(spx,sy+u*1.8,u*9,u*1.6,0,0,TAU);c.fill();
  c.save();c.translate(spx,sy+u*1.8);c.rotate(-.3);c.strokeStyle='#1c3a22';c.lineWidth=u*.22;c.beginPath();c.moveTo(-u*3,0);c.lineTo(u*1.5,0);c.stroke();c.fillStyle='#b3202a';for(let k=0;k<5;k++){c.beginPath();c.arc(u*2+cos(k*1.3)*u*.4,sin(k*1.3)*u*.4,u*.6,0,TAU);c.fill()}c.restore();
  for(const d of[-1,1]){const x0=d<0?-W*.1:W*1.1,edge=cx+d*W*(.34+.02*sin(t*.5));
    for(let k=0;k<9;k++){const xa=lerp(x0,edge,k/9),xb=lerp(x0,edge,(k+1)/9),gg=c.createLinearGradient(xa,0,xb,0);gg.addColorStop(0,'#3a0509');gg.addColorStop(.5,fire?'#c8301a':'#a3141f');gg.addColorStop(1,'#3a0509');c.fillStyle=gg;
      c.beginPath();c.moveTo(xa,-H*.1);c.lineTo(xb,-H*.1);c.quadraticCurveTo(xb+d*u*(1+k*.5)*sin(t*.6+k),H*.4,xb-d*u*k*.9,sy+u*3.5);c.lineTo(xa-d*u*k*.9,sy+u*3.5);c.quadraticCurveTo(xa+d*u*(1+k*.5)*sin(t*.6+k),H*.4,xa,-H*.1);c.fill()}
    c.fillStyle='#d9b25a';c.beginPath();c.arc(edge-d*u*3,H*.42,u*.9,0,TAU);c.fill();
    if(fire)for(let k=0;k<7;k++)flame(c,edge-d*u*(2+3*hh(k,401)),lerp(sy,H*.12,k/7*e),u*(2.4+2*hh(k,402))*e+.01,t,k+d,'#ffa23a',1.3)}
  for(let k=0;k<8;k++){const x=W*(k/8),w=W/8;c.fillStyle=k%2?'#7a0d16':'#8f121c';c.beginPath();c.moveTo(x,-H*.1);c.lineTo(x+w+1,-H*.1);c.lineTo(x+w+1,H*.09);c.quadraticCurveTo(x+w/2,H*.15,x,H*.09);c.fill()}
  c.strokeStyle='#d9b25a';c.lineWidth=u*.35;c.beginPath();c.moveTo(W*.04,H*1.1);c.lineTo(W*.04,H*.16);c.quadraticCurveTo(cx,H*.03,W*.96,H*.16);c.lineTo(W*.96,H*1.1);c.stroke();
  line(c,cx,-H*.1,cx,H*.13,'#8a6a22',u*.15);for(let k=0;k<11;k++){const an=k/10*PI,x=cx+cos(an)*u*5,y=H*.13+sin(an)*u*2;glow(c,x,y,u*2,'#ffe6b0',.7*(1-e));c.fillStyle='#fff6dc';c.fillRect(x-u*.12,y-u*.12,u*.24,u*.24)}
  for(let k=0;k<11;k++)glow(c,W*(.12+.076*k),sy+u*3.5,u*2.6,'#ffd9a0',.6);
  c.fillStyle='#030203';for(let r=0;r<3;r++){const y=H*(.84+.06*r),n=W>H?16:8;for(let k=0;k<n+r%2;k++){const x=W*((k+.5-(r%2)*.5)/n);c.beginPath();c.arc(x,y,u*(2+.5*r),0,TAU);c.fill();c.fillRect(x-u*(3.2+.6*r),y+u*1.6,u*(6.4+1.2*r),H)}}
  if(fire){embers(c,t,W,H,u,{n:90,y:sy,h:.8,al:.9*e});fog(c,t,W,H,{y:H*.2,h:H*.3,col:'#1a0f0c',al:.5*e,n:6})}};

P.knot=(c,t,W,H,u,a)=>{sky(c,W,H,['#030807','#071411','#0c211b']);c.strokeStyle=rgba('#7fe0b0',.08);c.lineWidth=1;
  for(let x=mod(W*.5,u*4);x<W;x+=u*4){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=mod(H*.42,u*4);y<H;y+=u*4){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  const cx=W*.5,cy=H*.42,S=min(W*.3,H*.2),ry=t*.35,rx=.5+.2*sin(t*.2);glow(c,cx,cy,S*3.2,'#e3a646',.2);
  for(let i=0;i<3;i++){const ph=fr(t*.12+i/3);c.strokeStyle=rgba('#ffe1a6',(1-ph)*.3);c.lineWidth=u*.12;c.beginPath();c.arc(cx,cy,S*(1.2+ph*2.4),0,TAU);c.stroke()}
  for(let i=0;i<40;i++){const ph=fr(hh(i,411)+t*.08),an=hh(i,412)*TAU,r=lerp(max(W,H)*.6,S*.9,eo(ph));txt(c,String(floor(hh(i,413)*10)),cx+cos(an)*r,cy+sin(an)*r*.8,u*1.6,rgba('#bfffe0',(1-ph)*.6),{f:FELL})}
  const N=220,pts=[];for(let i=0;i<=N;i++){const s=i/N*TAU,X=(2+cos(2*s))*cos(3*s),Y=(2+cos(2*s))*sin(3*s),Z=sin(4*s)*1.3,x1=X*cos(ry)+Z*sin(ry),z0=-X*sin(ry)+Z*cos(ry),y1=Y*cos(rx)-z0*sin(rx),z1=Y*sin(rx)+z0*cos(rx);pts.push([cx+x1*S/2.6,cy+y1*S/2.6,z1])}
  const seg=[];for(let i=0;i<N;i++)seg.push([i,(pts[i][2]+pts[i+1][2])/2]);seg.sort((p,q)=>p[1]-q[1]);const shown=a.grow?clamp(t/7):1;c.lineCap='round';
  seg.forEach(([i,z])=>{if(i/N>shown)return;const f=clamp((z+3.3)/6.6),p=pts[i],q=pts[i+1];c.strokeStyle='#04100c';c.lineWidth=u*(1.5+1.2*f);c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke();c.strokeStyle=rgba('#f1cf80',.35+.65*f);c.lineWidth=u*(.8+.9*f);c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke()});
  c.strokeStyle=rgba('#7fe0b0',.7);c.lineWidth=u*.13;c.beginPath();for(let x=0;x<=W;x+=u*.5){const y=H*.74+sin(x/u*.5+t*4)*u*1.2*sin(x/W*PI);x?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();
  txt(c,'LAPLACE  FIG-8  HOFMANN KNOT',W*.06,H*.69,u*1.5,rgba('#7fe0b0',.65),{al:'left'})};

P.blast=(c,t,W,H,u,a)=>{const hz=H*.62,t0=a.at||4,e=clamp((t-t0)/5),cx=W*.5,cy=hz+u*7;sky(c,W,H,['#04050a','#0c1020','#2a2430'],0,hz);stars(c,t,W,H,u,{n:90,y1:.58,al:1-e*.7});
  ridge(c,W,H,{base:hz,amp:u*3,seed:4,col:'#0b0c14',f:.6});c.fillStyle='#07070b';c.fillRect(-W*.1,hz,W*1.2,H);
  for(let i=0;i<7;i++){const x=W*(.04+.14*i),w=u*(4+3*hh(i,421)),h=u*(1.5+2*hh(i,422));c.fillStyle='#030305';c.beginPath();c.moveTo(x,hz+u);c.lineTo(x,hz-h*.4);c.quadraticCurveTo(x+w/2,hz-h*1.4,x+w,hz-h*.4);c.lineTo(x+w,hz+u);c.fill();if(i%3==0){line(c,x+w*.5,hz-h,x+w*.5,hz-h-u*6,'#030305',u*.15);glow(c,x+w*.5,hz-h-u*6,u*1.6,'#ff5a4a',.8*(.5+.5*sin(t*4+i)))}}
  if(t<t0){const ar=clamp(t/(t0-.6));c.strokeStyle=rgba('#9fe0ff',.8);c.lineWidth=u*.16;for(let k=0;k<3;k++){c.beginPath();c.ellipse(cx,cy,u*(4+k*3)*ar,u*(1+k*.75)*ar,0,0,TAU);c.stroke()}for(let k=0;k<12;k++){const an=k/12*TAU+t;c.fillStyle=rgba('#9fe0ff',.8);c.fillRect(cx+cos(an)*u*10*ar,cy+sin(an)*u*2.5*ar-u*4*fr(t+k/12),u*.2,u*1.2)}glow(c,cx,cy-u*2,u*10*ar,'#9fe0ff',.35)}
  else{const f=clamp((t-t0)/.5);glow(c,cx,cy-u*4,max(W,H)*(.2+.9*eo(e)),'#fff3d6',.95*(1-e)+.05);
    c.strokeStyle=rgba('#ffffff',(1-e)*.8);c.lineWidth=u*.5*(1-e)+u*.1;c.beginPath();c.ellipse(cx,cy,max(W,H)*.9*eo(e),max(W,H)*.22*eo(e),0,0,TAU);c.stroke();
    const ch=H*.5*eo(e),g=c.createLinearGradient(0,cy,0,cy-ch-1);g.addColorStop(0,rgba('#ffd9a0',.9*(1-e*.6)));g.addColorStop(1,rgba('#6a5a6a',0));c.fillStyle=g;c.beginPath();c.moveTo(cx-u*3,cy);c.quadraticCurveTo(cx-u,cy-ch*.5,cx-u*8*e-u*2,cy-ch);c.lineTo(cx+u*8*e+u*2,cy-ch);c.quadraticCurveTo(cx+u,cy-ch*.5,cx+u*3,cy);c.fill();
    c.fillStyle=rgba('#ffffff',(1-f)*.95);c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);snow(c,t,W,H,u,{n:100,col:'#b9b4aa',al:.6*e,sp:.5});
    if(e>.5){const q=(e-.5)/.5;c.strokeStyle='#7fe0b0';c.lineWidth=u*.14;for(let k=0;k<3;k++){const ph=fr(t*.5+k/3);c.globalAlpha=(1-ph)*q;c.beginPath();c.arc(cx,cy,u*(1+ph*9),0,TAU);c.stroke()}c.globalAlpha=1;c.fillStyle=rgba('#7fe0b0',q);c.beginPath();c.arc(cx,cy,u*.5,0,TAU);c.fill();txt(c,'VITAL SIGNAL ?',cx,cy+u*6,u*1.8,rgba('#7fe0b0',q*(.5+.5*sin(t*6))),{w:700})}}};

P.tropic=(c,t,W,H,u,a)=>{const night=a.v=='night',hz=H*.46;sky(c,W,H,night?['#070616','#1c1038','#5a2050','#c2603a']:['#1b1a44','#7a2a66','#e0603a','#f7b85a'],0,H*.6);if(night)stars(c,t,W,H,u,{n:60,y1:.3,al:.5});
  const sx=W*.3,sy=H*.38;glow(c,sx,sy,u*30,'#ffd08a',night?.15:.45);if(!night){c.fillStyle='#ffe2a8';c.beginPath();c.arc(sx,sy,u*4,0,TAU);c.fill()}
  skyline(c,t,W,H,u,{base:hz+u*4,seed:431,minH:8,maxH:30,minW:3,maxW:6,col:night?'#1a1030':'#5a2a5a',win:'#ffd9a0',lit:night?.3:.08,wa:.7});fog(c,t,W,H,{y:hz+u*2,h:u*10,col:'#f7b85a',al:.14,n:4});
  const cols=['#b9583a','#d9a24a','#3f8a8a','#c9c0a8','#8a4a5a','#5a7a4a','#d07a3a'];
  for(let r=0;r<12;r++){const y=hz+u*(6+r*4.2),n=floor(W/(u*5))+3;for(let q=0;q<n;q++){const id=r*53+q,x=q*u*5+(r%2)*u*2.5-u*4+hh(id,441)*u*1.5,w=u*(4+1.6*hh(id,442)),h=u*(3.6+1.8*hh(id,443)),yy=y-sin(clamp(x/W)*PI)*u*10*(1-r/12)+hh(id,444)*u;
      c.fillStyle=cols[floor(hh(id,445)*cols.length)];c.fillRect(x,yy,w,h+u*5);c.fillStyle=rgba('#000000',night?.62:.34+.03*r);c.fillRect(x,yy,w,h+u*5);c.fillStyle='rgba(0,0,0,.35)';c.fillRect(x,yy,w,u*.35);
      c.fillStyle=hh(id,446)<(night?.6:.3)?rgba('#ffd08a',.85*(.7+.3*sin(t*.7+id))):'rgba(10,8,12,.8)';c.fillRect(x+w*.2,yy+h*.3,u*.9,u*1.1);if(hh(id,447)>.5){c.fillStyle='rgba(10,8,12,.8)';c.fillRect(x+w*.62,yy+h*.3,u*.8,u*1.9)}
      if(hh(id,448)>.8){c.fillStyle='#2a5a8a';c.fillRect(x+w*.5,yy-u*1.1,u*1.4,u*1.1)}if(hh(id,449)>.86)line(c,x+w*.3,yy,x+w*.3,yy-u*2.6,'#111111',u*.1)}}
  for(let k=0;k<3;k++){const y0=hz+u*(12+k*13);c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=u*.06;c.beginPath();c.moveTo(-W*.1,y0);c.quadraticCurveTo(W*.5,y0+u*5,W*1.1,y0-u*2);c.stroke();for(let j=0;j<16;j++){const p=j/15,x=lerp(-W*.1,W*1.1,p),y=(1-p)*(1-p)*y0+2*(1-p)*p*(y0+u*5)+p*p*(y0-u*2);glow(c,x,y,u*1.3,['#ffd08a','#ff7a8a','#7ad0ff'][j%3],.8)}}
  for(const d of[-1,1])for(let k=0;k<4;k++){c.save();c.translate(d<0?-u*2:W+u*2,H*(.02+.1*k));c.rotate((d<0?.35:PI-.35)+(k*.22-.2)*d+sin(t*.6+k)*.03);c.fillStyle='#04100b';c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(u*14,-u*5,u*30,u*2);c.quadraticCurveTo(u*14,u*4,0,0);c.fill();c.strokeStyle='#04100b';c.lineWidth=u*.5;for(let j=1;j<9;j++){c.beginPath();c.moveTo(j*u*3.2,-u*.4);c.lineTo(j*u*3.2+u*2,u*5+j*u*.3);c.stroke()}c.restore()}
  if(a.rain)rain(c,t,W,H,u,{n:140,al:.35,wind:.15,col:'#ffe6c8'})};

P.river=(c,t,W,H,u,a)=>{const hz=H*.46,t0=a.at||4,e=clamp((t-t0)/4);sky(c,W,H,['#6a8a5a','#c9c27a','#e9d9a0'],0,hz);glow(c,W*.6,H*.2,u*30,'#fff6c8',.5);ridge(c,W,H,{base:hz-u*3,amp:u*5,seed:6,col:'#3f6a48'});
  for(let i=0;i<60;i++){const x=hh(i,451)*W*1.1-W*.05,r=u*(2+3.5*hh(i,452));c.fillStyle=['#1f4a30','#17382a','#2a5a36'][i%3];c.beginPath();c.arc(x,hz-r*.5,r,0,TAU);c.fill()}
  water(c,t,W,H,u,{y:hz,c1:'#5a7a4a',c2:'#14261a',gl:'#f3eac0',al:.4,n:110,flow:.6});
  const bx=W*.5+sin(t*.3)*u,by=hz+u*10,s=u*9;c.save();c.translate(bx,by+e*s*.4);c.rotate(e*.3);poly(c,[-s,-s*.12,s,-s*.12,s*.8,s*.16,-s*.8,s*.16],'#2a1a10');c.fillStyle='#e9e0c8';c.fillRect(-s*.6,-s*.5,s*1.1,s*.38);c.fillStyle='#8a2a1a';c.fillRect(-s*.66,-s*.58,s*1.22,s*.1);c.fillStyle='#2a1a10';for(let k=0;k<5;k++)c.fillRect(-s*.5+k*s*.22,-s*.4,s*.12,s*.18);c.fillRect(s*.2,-s*.95,s*.12,s*.4);c.restore();
  c.strokeStyle=rgba('#f3eac0',.5);c.lineWidth=u*.15;for(let k=0;k<4;k++){c.beginPath();c.moveTo(bx-s-k*u*3,by+u*.5+k*u*.5);c.lineTo(bx-s-k*u*3-u*5,by+u*.5+k*u*.9);c.stroke()}
  if(t>=t0){const f=clamp((t-t0)/.4);for(let k=0;k<9;k++){const an=k/9*TAU,r=u*(3+10*eo(e))*(.6+.4*hh(k,461));c.fillStyle=rgba(k%2?'#1c1410':'#3a2a20',.9*(1-e*.5));c.beginPath();c.arc(bx+cos(an)*r*.8,by-u*3-abs(sin(an))*r-eo(e)*u*8,u*(2+5*eo(e))*(.6+.4*hh(k,462)),0,TAU);c.fill()}
    glow(c,bx,by-u*3,u*30*(1-e*.6),'#ff9a2a',.95*(1-e));for(let k=0;k<5;k++)flame(c,bx+(k-2)*u*2,by-u*.5,u*(3+hh(k,463)*2)*(1-e*.5),t,k,'#ffb03a');embers(c,t,W,H,u,{n:50,x0:bx-u*8,x1:bx+u*8,y:by,h:.4});
    for(let k=0;k<12;k++){const an=-PI*hh(k,464),d=eo(e)*u*(10+16*hh(k,465));c.fillStyle='#2a1a10';c.fillRect(bx+cos(an)*d,by-u*3+sin(an)*d+e*e*u*18,u*.8,u*.4)}
    c.fillStyle=rgba('#fff6dc',(1-f)*.8);c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);for(let k=0;k<3;k++){const ph=fr(e*1.5+k/3);c.strokeStyle=rgba('#f3eac0',(1-ph)*.6);c.lineWidth=u*.14;c.beginPath();c.ellipse(bx,by+u,u*(4+ph*22),u*(1+ph*5),0,0,TAU);c.stroke()}}
  c.lineCap='round';for(let k=0;k<26;k++){const x=hh(k,471)*W,h=u*(8+12*hh(k,472));c.strokeStyle='#0a1a10';c.lineWidth=u*(.3+.4*hh(k,473));c.beginPath();c.moveTo(x,H*1.05);c.quadraticCurveTo(x+sin(t*.8+k)*u*2,H-h*.5,x+sin(t*.8+k)*u*4+(hh(k,474)-.5)*u*6,H-h);c.stroke()}};

P.lighthouse=(c,t,W,H,u,a)=>{const hz=H*.56;sky(c,W,H,['#1a2230','#4a5a6a','#9aa6ac'],0,hz);
  ridge(c,W,H,{base:hz-u*3,amp:u*14,seed:11,col:'#dfe6ea',sharp:1,f:1.4});ridge(c,W,H,{base:hz+u*2,amp:u*12,seed:17,col:'#5a6a78',sharp:1,f:1.1});ridge(c,W,H,{base:hz+u*3,amp:u*5,seed:23,col:'#2a3440',f:.8});
  for(let i=0;i<40;i++){c.fillStyle=rgba('#ffd08a',.5+.4*sin(t+i));c.fillRect(hh(i,481)*W,hz-u*(.5+2.5*hh(i,482)),u*.35,u*.35)}
  water(c,t,W,H,u,{y:hz,c1:'#3a4a5a',c2:'#0a1018',gl:'#e6eef2',al:.45,n:120,flow:1.2});
  const lx=W*.66,ly=hz+u*9;c.fillStyle='#10141a';c.beginPath();c.moveTo(lx-u*10,ly+u);c.quadraticCurveTo(lx-u*5,ly-u*4,lx,ly-u*3.4);c.quadraticCurveTo(lx+u*6,ly-u*3,lx+u*11,ly+u);c.fill();
  const th=u*15,bw=u*2.6,tw=u*1.7,by=ly-u*3.2;for(let k=0;k<5;k++){const p0=k/5,p1=(k+1)/5;poly(c,[lx-lerp(bw,tw,p0),by-th*p0,lx+lerp(bw,tw,p0),by-th*p0,lx+lerp(bw,tw,p1),by-th*p1,lx-lerp(bw,tw,p1),by-th*p1],k%2?'#b3261e':'#f0ece2')}
  poly(c,[lx,by,lx+bw,by,lx+tw,by-th,lx,by-th],'rgba(0,0,0,.22)');c.fillStyle='#10141a';c.fillRect(lx-tw*1.4,by-th-u*.5,tw*2.8,u*.5);c.fillRect(lx-tw*.9,by-th-u*2.6,tw*1.8,u*2.1);poly(c,[lx-tw*1.1,by-th-u*2.6,lx,by-th-u*4.4,lx+tw*1.1,by-th-u*2.6],'#10141a');
  const dir=cos(t*.7),sg=dir<0?-1:1,bl=W*.9*abs(dir),lyy=by-th-u*1.6,g=c.createLinearGradient(lx,lyy,lx+sg*bl+sg,lyy);g.addColorStop(0,rgba('#fff6c8',.65));g.addColorStop(1,rgba('#fff6c8',0));poly(c,[lx,lyy-u*.4,lx,lyy+u*.4,lx+sg*bl,lyy+u*7*abs(dir)+u,lx+sg*bl,lyy-u*7*abs(dir)-u],g);
  glow(c,lx,lyy,u*5,'#fff6c8',.9);c.fillStyle='#fff6c8';c.fillRect(lx-tw*.6,lyy-u*.7,tw*1.2,u*1.4);
  const bx=W*.24,byy=hz+u*15;c.fillStyle='#10141a';c.fillRect(bx-u*.25,byy,u*.5,H);c.save();c.translate(bx,byy);c.rotate(-.04);c.fillStyle='#e9e0c8';c.fillRect(-u*9.5,-u*2,u*19,u*4);c.strokeStyle='#10141a';c.lineWidth=u*.15;c.strokeRect(-u*9,-u*1.5,u*18,u*3);txt(c,'FIN DEL MUNDO',0,u*.1,u*1.9,'#10141a',{w:700});c.restore();
  birds(c,t,W,H,u,{n:6,x:W*.4,y:hz-u*10,r:u*14,col:'#1a2230'});snow(c,t,W,H,u,{n:170,al:.85,wind:2.2,sp:.8})};

P.panopticon=(c,t,W,H,u,a)=>{const fall=a.v=='fall',e=fall?sm(t/9):0,cx=W*.5,ey=H*.45,F=W*(W>H?.42:.66),th=H*.115,sweep=sin(t*.35)*.9;
  sky(c,W,H,fall?['#0a0403','#3a140a','#7a3414']:['#04060a','#0c1118','#181e26']);
  glow(c,cx,H*.08,u*30,fall?'#ff9a4a':'#cfe0ee',.45);c.fillStyle=fall?'#ffd9a0':'#dfeaf2';c.beginPath();c.ellipse(cx,H*.075,W*.2,H*.03,0,0,TAU);c.fill();
  const pr=(an,h)=>[cx+F*Math.tan(an),ey+h/cos(an)];
  c.save();if(fall){c.translate(sin(t*23)*u*.5*e,cos(t*19)*u*.5*e)}
  for(let k=-3;k<3;k++){const h0=k*th,h1=(k+1)*th;for(let j=-9;j<9;j++){const a0=j*.115,a1=a0+.115,m=(a0+a1)/2;if(abs(m)>1.05)continue;const id=(k+5)*40+j+20,drop=fall&&hh(id,801)<e*.7?pow((e*.7-hh(id,801))/.7,2)*H*1.4:0,lit=clamp(1-abs(m-sweep)*3.2);
      const p=[pr(a0,h0),pr(a1,h0),pr(a1,h1),pr(a0,h1)];poly(c,[p[0][0],p[0][1]+drop,p[1][0],p[1][1]+drop,p[2][0],p[2][1]+drop,p[3][0],p[3][1]+drop],fall?rgba('#2a140c',1):rgba('#1c232d',1),fall?'#0a0403':'#07090c',u*.12);
      if(lit>0&&!fall)poly(c,[p[0][0],p[0][1],p[1][0],p[1][1],p[2][0],p[2][1],p[3][0],p[3][1]],rgba('#cfe0ee',.16*lit));
      const d0=a0+.028,d1=a1-.028,g0=h0+th*.24,g1=h1-th*.05,q=[pr(d0,g0),pr(d1,g0),pr(d1,g1),pr(d0,g1)],warm=hh(id,802)<.22;
      poly(c,[q[0][0],q[0][1]+drop,q[1][0],q[1][1]+drop,q[2][0],q[2][1]+drop,q[3][0],q[3][1]+drop],warm?rgba(fall?'#ffb04a':'#ffd08a',.75*(.7+.3*sin(t+id))):'#05070a');
      c.strokeStyle='rgba(0,0,0,.55)';c.lineWidth=u*.08;for(let b=1;b<4;b++){const ab=lerp(d0,d1,b/4),s0=pr(ab,g0),s1=pr(ab,g1);c.beginPath();c.moveTo(s0[0],s0[1]+drop);c.lineTo(s1[0],s1[1]+drop);c.stroke()}}
    c.strokeStyle=fall?'#1a0a06':'#2c3540';c.lineWidth=u*.3;c.beginPath();for(let j=-9;j<=9;j++){const p=pr(clamp(j*.115,-1.05,1.05),h1);j==-9?c.moveTo(p[0],p[1]):c.lineTo(p[0],p[1])}c.stroke()}
  c.restore();
  // yard floor and the tower's shadow
  const g=c.createLinearGradient(0,ey+3*th,0,H);g.addColorStop(0,fall?'#2a120a':'#10151c');g.addColorStop(1,'#020304');c.fillStyle=g;c.beginPath();c.moveTo(-W*.1,H*1.1);for(let j=-9;j<=9;j++){const p=pr(clamp(j*.115,-1.05,1.05),3*th);c.lineTo(p[0],p[1])}c.lineTo(W*1.1,H*1.1);c.fill();
  if(!fall){const bx=cx+F*Math.tan(sweep),gg=c.createLinearGradient(cx,H,bx,ey);gg.addColorStop(0,rgba('#cfe0ee',.22));gg.addColorStop(1,rgba('#cfe0ee',0));poly(c,[cx-u*2,H*1.05,cx+u*2,H*1.05,bx+u*9,ey-th*3,bx-u*9,ey-th*3],gg);snow(c,t,W,H,u,{n:70,al:.6,sp:.5})}
  else{for(let k=0;k<9;k++)flame(c,W*(k/8),H*.99,u*(5+4*hh(k,811))*e+.01,t,k,'#ffa23a',1.5);embers(c,t,W,H,u,{n:110,y:H,h:.95,al:e});
    for(let i=0;i<22;i++){const ph=fr(hh(i,821)+t*.07),x=hh(i,822)*W+sin(t+i)*u*4,y=H*(1-ph);c.save();c.translate(x,y);c.rotate(t*1.5+i);c.fillStyle=rgba('#efe6d0',.9*(1-ph)*e);c.fillRect(-u*1.2,-u*.8,u*2.4,u*1.6);c.restore()}}
  if(a.dice)OBJ.dice(c,W*.5,H*.8,u*8,t)};

P.pages=(c,t,W,H,u,a)=>{sky(c,W,H,a.pal||['#07060a','#14101a','#241a22']);glow(c,W*.5,H*.8,max(W,H)*.6,'#e3b56a',.18);
  for(let i=0;i<26;i++){const ph=fr(hh(i,501)+t*(.03+.03*hh(i,502))),x=lerp(-W*.1,W*1.1,ph)+sin(ph*9+i)*u*3,y=H*(.62-.5*sin(ph*PI))+(hh(i,503)-.5)*H*.28,s=u*(3+4*hh(i,504)),fl=abs(cos(t*(.6+hh(i,505))+i));
    c.save();c.translate(x,y);c.rotate(sin(t*.9+i)*.6+ph*3);c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-s*.7+u*.4,-s*fl+u*.5,s*1.4,s*2*fl+1);c.fillStyle=rgba('#efe6d0',.94);c.fillRect(-s*.7,-s*fl,s*1.4,s*2*fl+1);c.fillStyle='rgba(40,30,25,.55)';for(let k=0;k<7;k++)c.fillRect(-s*.52,(-s*.8+k*s*.24)*fl,s*(.6+.45*hh(i*7+k,506)),max(.6,s*.05*fl));c.restore()}
  const L=a.lines||[],pw=min(W*.84,u*48),ph_=max(pw*.52,pw*.085*(L.length+2.4)),px=W*.5-pw/2,py=H*.2;c.save();c.translate(W*.5,py+ph_/2);c.rotate(-.03);c.translate(-W*.5,-(py+ph_/2));c.fillStyle='rgba(0,0,0,.5)';c.fillRect(px+u,py+u*1.2,pw,ph_);c.fillStyle='#efe6d0';c.fillRect(px,py,pw,ph_);
  const fs=pw*.052;let shown=floor(t*10);c.font='700 '+fs+'px '+MONO;c.textAlign='left';c.textBaseline='top';c.fillStyle='#1c1410';
  L.forEach((s,i)=>{const sub=s.slice(0,max(0,shown)),yy=py+ph_*.1+i*fs*1.62;shown-=s.length+5;c.fillText(sub,px+pw*.07,yy);if(sub.length<s.length&&sub.length>0&&floor(t*3)%2)c.fillRect(px+pw*.07+c.measureText(sub).width+2,yy,fs*.5,fs)});c.restore();
  if(a.book)OBJ.book(c,W*.5,H*.84,u*13,t);if(a.dice)OBJ.dice(c,W*.76,H*.8,u*7,t)};

P.ice=(c,t,W,H,u,a)=>{const hz=H*.56;sky(c,W,H,['#02040c','#061428','#0f2a44'],0,hz);stars(c,t,W,H,u,{n:150,y1:.54});
  for(let k=0;k<3;k++){const y0=H*(.1+.08*k),col=k==1?'#a06ae0':'#58e6b0';c.beginPath();c.moveTo(-W*.1,y0);for(let i=0;i<=40;i++){const x=lerp(-W*.1,W*1.1,i/40);c.lineTo(x,y0+sin(x/W*5+t*.25+k*2)*H*.05+sin(x/W*13-t*.4+k)*H*.015)}for(let i=40;i>=0;i--){const x=lerp(-W*.1,W*1.1,i/40);c.lineTo(x,y0+H*.22+sin(x/W*5+t*.25+k*2)*H*.05)}c.closePath();const g=c.createLinearGradient(0,y0-H*.06,0,y0+H*.24);g.addColorStop(0,rgba(col,0));g.addColorStop(.25,rgba(col,.3));g.addColorStop(1,rgba('#58e6b0',0));c.fillStyle=g;c.fill()}
  if(a.volcano!==false){const vx=W*.68;poly(c,[vx-u*26,hz+u,vx-u*5,hz-u*17,vx+u*4,hz-u*17.5,vx+u*24,hz+u],'#0a1626');poly(c,[vx-u*9,hz-u*13.3,vx-u*5,hz-u*17,vx+u*4,hz-u*17.5,vx+u*8,hz-u*13.6,vx+u*3,hz-u*14.6,vx-u,hz-u*13,vx-u*4,hz-u*14.8],'#cfe3ee');
    glow(c,vx,hz-u*18,u*12,'#ff5a2a',.35+.1*sin(t*2));for(let k=0;k<6;k++){const ph=fr(t*.06+k/6);c.fillStyle=rgba('#5a3a3a',(1-ph)*.4);c.beginPath();c.arc(vx+ph*u*10+sin(t+k)*u,hz-u*18-ph*u*16,u*(2+ph*5),0,TAU);c.fill()}
    if(a.door){const d=sm((t-2)/6),dx=vx-u*6,dy=hz-u;c.fillStyle='#02050a';c.fillRect(dx-u*2.2,dy-u*7,u*4.4,u*7);c.fillStyle='#ff6a2a';c.fillRect(dx-u*2.2*d,dy-u*7,u*4.4*d,u*7);glow(c,dx,dy-u*3.5,u*14*d+1,'#ff6a2a',.5*d)}}
  ridge(c,W,H,{base:hz+u,amp:u*6,seed:31,col:'#16304a',sharp:1,f:1.6});
  const g=c.createLinearGradient(0,hz,0,H);g.addColorStop(0,'#9fc6dc');g.addColorStop(.3,'#4a7a9a');g.addColorStop(1,'#0a1a2a');c.fillStyle=g;c.fillRect(-W*.1,hz+u*1.5,W*1.2,H);
  c.strokeStyle=rgba('#e6f6ff',.35);c.lineWidth=u*.1;for(let i=0;i<40;i++){const d=pow(hh(i,511),1.6),y=hz+u*2+d*(H-hz),x=hh(i,512)*W,w=u*(2+12*d);c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y-u*.3);c.stroke()}
  c.strokeStyle=rgba('#02101c',.5);c.lineWidth=u*.14;c.beginPath();c.moveTo(W*.1,H);c.lineTo(W*.3,H*.84);c.lineTo(W*.26,H*.76);c.lineTo(W*.42,H*.68);c.stroke();
  if(a.tents){for(let k=0;k<3;k++){const x=W*(.18+.13*k),y=hz+u*(9+k*1.6),s=u*(3-k*.4);poly(c,[x-s*1.2,y,x,y-s*1.4,x+s*1.2,y],k?'#8a2a1a':'#b3401e');if(!k){poly(c,[x-s*.3,y,x,y-s*.9,x+s*.3,y],rgba('#ffd08a',.9*(.7+.3*sin(t*3))));glow(c,x,y-s*.5,s*3,'#ffd08a',.4)}}
    line(c,W*.56,hz+u*11,W*.56,hz+u*5,'#10202c',u*.15);poly(c,[W*.56,hz+u*5,W*.56+u*3+sin(t*3)*u*.3,hz+u*5.7,W*.56,hz+u*6.6],'#b3401e')}
  if(a.ship){const x=W*.3,y=hz+u*4.5,s=u*8;poly(c,[x-s,y-s*.2,x+s*1.1,y-s*.2,x+s*.8,y+s*.12,x-s*.8,y+s*.12],'#050a10');c.fillStyle='#050a10';c.fillRect(x-s*.3,y-s*.5,s*.6,s*.3);c.fillRect(x-s*.02,y-s*1.5,s*.04,s*1.2);c.fillRect(x+s*.4,y-s*1.2,s*.03,s*.9);glow(c,x,y-s*.35,s*.8,'#ffd08a',.5)}
  if(a.ark){const p=sm(t/12),x=lerp(W*.46,W*.6,p),y=hz+u*lerp(12,3.5,p),s=u*lerp(15,5,p);c.strokeStyle=rgba('#02101c',.6);c.lineWidth=u*.7;c.beginPath();c.moveTo(W*.42,H*1.02);c.lineTo(x,y+s*.15);c.stroke();
    poly(c,[x-s,y-s*.3,x+s,y-s*.3,x+s*.75,y+s*.15,x-s*.75,y+s*.15],'#03060a');c.fillStyle='#03060a';c.fillRect(x-s*.6,y-s*.62,s*1.2,s*.34);c.beginPath();c.moveTo(x-s*.6,y-s*.62);c.quadraticCurveTo(x,y-s*1.1,x+s*.6,y-s*.62);c.fill();c.fillStyle=rgba('#ffd08a',.8);for(let k=0;k<7;k++)c.fillRect(x-s*.5+k*s*.16,y-s*.5,s*.06,s*.08)}
  snow(c,t,W,H,u,{n:140,al:.7,wind:3,sp:.5})};

P.wheel=(c,t,W,H,u,a)=>{sky(c,W,H,['#040305','#0e0a10','#1c1218']);const cx=W*.5,fy=H*.68,g=min(W*.27,H*.2)/(u*8.5);
  for(const d of[-1,1])for(let k=2;k>=0;k--){const x=cx+d*W*(.26+.12*k),w=u*(5-k*.8),h=H*(.62-.07*k);c.fillStyle=['#120d12','#0f0b0f','#0c090c'][k];c.fillRect(x-w/2,fy-h,w,h+H);c.fillRect(x-w*.7,fy-h,w*1.4,u*1.2);c.fillStyle='rgba(217,178,90,.08)';c.fillRect(x-w/2,fy-h,u*.3,h)}
  for(let k=1;k<7;k++){c.strokeStyle=rgba('#d9b25a',.1+.03*k);c.lineWidth=u*.12;c.beginPath();c.ellipse(cx,fy,W*.11*k,W*.03*k,0,0,TAU);c.stroke()}
  for(const d of[-1,1]){const x=cx+d*W*.4,y=fy+u*3;poly(c,[x-u*2,y-u*5,x+u*2,y-u*5,x+u,y-u*3.6,x-u,y-u*3.6],'#2a1c14');c.fillStyle='#2a1c14';c.fillRect(x-u*.3,y-u*3.6,u*.6,u*3.6);for(let k=0;k<3;k++)flame(c,x+(k-1)*u,y-u*5,u*2.2,t,k+d,'#ffa23a')}
  const st=a.stop,sp=st?clamp(1-(t-st)/2.5):1,rot=st&&t>st?st*1.4+(1-pow(1-clamp((t-st)/2.5),2))*1.75:t*1.4,wx=cx-u*5,wy=fy-u*11,R=u*8.5,bx=wx+u*14,by=fy-u*12;
  c.save();c.translate(cx,fy);c.scale(g,g);c.translate(-cx,-fy);glow(c,wx,wy,R*3,'#e3a646',.2+.14*(1-sp));
  c.strokeStyle='#2a1a10';c.lineWidth=u*.8;c.lineCap='round';c.beginPath();c.moveTo(wx-u*5,fy);c.lineTo(wx,wy);c.lineTo(wx+u*5,fy);c.moveTo(wx+u*4,fy-u*3);c.lineTo(wx+u*17,fy-u*5);c.lineTo(wx+u*17,fy);c.moveTo(wx+u*14,fy-u*4.6);c.lineTo(wx+u*14,fy-u*12);c.stroke();
  c.strokeStyle='#6a4420';c.lineWidth=u*.9;c.beginPath();c.arc(wx,wy,R,0,TAU);c.stroke();c.strokeStyle='#a87038';c.lineWidth=u*.22;c.beginPath();c.arc(wx,wy,R*.9,0,TAU);c.stroke();c.beginPath();c.arc(wx,wy,R*1.06,0,TAU);c.stroke();
  c.strokeStyle='#5a3a1c';c.lineWidth=u*.35;for(let k=0;k<12;k++){const an=k/12*TAU+rot;c.beginPath();c.moveTo(wx,wy);c.lineTo(wx+cos(an)*R,wy+sin(an)*R);c.stroke();c.fillStyle='#a87038';c.beginPath();c.arc(wx+cos(an)*R*.55,wy+sin(an)*R*.55,u*.3,0,TAU);c.fill()}c.fillStyle='#a87038';c.beginPath();c.arc(wx,wy,u*1.3,0,TAU);c.fill();c.fillStyle='#2a1a10';c.beginPath();c.arc(wx,wy,u*.45,0,TAU);c.fill();
  c.fillStyle='#5a3a1c';c.fillRect(bx-u*.8,by-u*1.8,u*1.6,u*3.6);c.fillStyle='#e3b56a';c.fillRect(bx-u*.6,by-u*1.2,u*1.2,u*2.4);c.strokeStyle=rgba('#e9d9b0',.5);c.lineWidth=u*.1;c.beginPath();c.moveTo(wx,wy-R);c.lineTo(bx,by-u*1.2);c.moveTo(wx,wy+R);c.lineTo(bx,by+u*1.2);c.stroke();
  c.fillStyle='#2a1a10';c.fillRect(wx+u*19,fy-u*4,u*5,u*.7);c.fillRect(wx+u*19.4,fy-u*4,u*.5,u*4);c.fillRect(wx+u*23.1,fy-u*4,u*.5,u*4);c.restore();
  const tx=cx+(bx-cx)*g,ty=fy+(by-u*1.8-fy)*g;c.save();c.strokeStyle='#ffd98a';c.lineWidth=u*.26;c.shadowColor='#ffb84a';c.shadowBlur=u*2;c.beginPath();c.moveTo(tx,ty);for(let k=1;k<=40;k++){const p=k/40;c.lineTo(lerp(tx,cx+u*2,p)+sin(p*9-t*2.2)*u*5*sp*sin(p*PI),lerp(ty,-H*.05,p))}c.stroke();c.restore();
  for(let i=0;i<70;i++){const x=hh(i,521)*W,y=mod(hh(i,522)*H-t*u*(.8+hh(i,523))*(.2+sp),H);c.fillStyle=rgba('#ffe1a6',.15+.4*hh(i,524));c.fillRect(x,y,u*.14,u*.14)}};

P.flood=(c,t,W,H,u,a)=>{const tn=a.turn,lv=tn?lerp(.24,.92,sm((t-tn)/5)):lerp(.92,.22,1-pow(1-clamp(t/22),2.4)),wy=H*lv;sky(c,W,H,['#040708','#0b1614','#1a2e26']);
  for(let k=0;k<6;k++){const x=W*(.08+.168*k),w=u*(3+hh(k,531)*1.5);c.fillStyle='#111c19';c.fillRect(x-w/2,-H*.1,w,H*1.2);c.fillStyle='rgba(217,178,90,.26)';c.fillRect(x-w/2,-H*.1,u*.35,H*1.2);c.fillStyle='rgba(0,0,0,.3)';c.fillRect(x+w/2-u*.8,-H*.1,u*.8,H*1.2);c.fillStyle='#16231f';c.fillRect(x-w*.75,H*.1,w*1.5,u*1.4);c.fillRect(x-w*.62,H*.1+u*1.4,w*1.24,u*.7)}
  glow(c,W*.5,H*.3,max(W,H)*.5,'#d9b25a',.2);glow(c,W*.5,H*.2,u*10,'#ffe9bd',.5);skyline(c,t,W,H,u,{base:H*.86,seed:533,minH:8,maxH:38,col:'#070d0c',win:'#e3b56a',lit:.28,wa:.8,dome:1});c.fillStyle='#060b0a';c.fillRect(-W*.1,H*.86,W*1.2,H);
  const wave=x=>wy+sin(x/W*9+t*1.6)*u*1.4+sin(x/W*23-t*2.3)*u*.6;
  c.beginPath();c.moveTo(-W*.1,H*1.2);for(let i=0;i<=50;i++){const x=lerp(-W*.1,W*1.1,i/50);c.lineTo(x,wave(x))}c.lineTo(W*1.1,H*1.2);c.closePath();const g=c.createLinearGradient(0,wy,0,H+1);g.addColorStop(0,'rgba(36,86,74,.9)');g.addColorStop(.3,'rgba(12,36,32,.86)');g.addColorStop(1,'rgba(2,6,5,.95)');c.fillStyle=g;c.fill();
  for(let k=0;k<5;k++){const x=W*(.1+.2*k)+sin(t*.3+k)*u*4,gg=c.createLinearGradient(0,wy,0,wy+H*.5);gg.addColorStop(0,'rgba(190,240,220,.13)');gg.addColorStop(1,'rgba(190,240,220,0)');poly(c,[x-u*2,wy,x+u*3,wy,x+u*10,wy+H*.5,x-u*4,wy+H*.5],gg)}
  c.strokeStyle=rgba('#e9f6ee',.75);c.lineWidth=u*.25;c.beginPath();for(let i=0;i<=50;i++){const x=lerp(-W*.1,W*1.1,i/50);i?c.lineTo(x,wave(x)):c.moveTo(x,wave(x))}c.stroke();
  for(let i=0;i<50;i++){const d=hh(i,541),y=wy+u*2+d*(H-wy),x=mod(hh(i,542)*W+sin(t*.6+i)*u*5,W),w=u*(1+6*d);if(y>H)continue;c.fillStyle=rgba(i%4?'#9fe0c8':'#ffd98a',.12+.25*abs(sin(t+i)));c.fillRect(x,y,w,u*.12)}
  for(let i=0;i<40;i++){const ph=fr(hh(i,551)+t*.08),x=hh(i,552)*W+sin(t+i)*u*2,y=lerp(H,wy,ph);c.strokeStyle=rgba('#cfeee2',.45*(1-ph));c.lineWidth=u*.08;c.beginPath();c.arc(x,y,u*(.3+.8*hh(i,553)),0,TAU);c.stroke()}
  if(tn&&t>tn)rain(c,-(t-tn),W,H,u,{n:200,al:.6*sm((t-tn)/3)})};

/* ---------- 場景：第十一章至片尾 ---------- */
P.trench=(c,t,W,H,u,a)=>{const v=a.v||'night',day=v=='cheer',hz=H*.46,dk=(d,n)=>day?d:n;
  sky(c,W,H,day?['#5a6a78','#a9a89a','#d9c8a0']:['#07080b','#1c1f26','#544a38'],0,hz);if(!day)stars(c,t,W,H,u,{n:30,y1:.3,al:.3});
  if(!day)for(let k=0;k<3;k++){const ph=fr(t*.09+k/3+.1),x=W*(.2+.3*k)+ph*u*8,y=H*(.32-.24*sin(ph*PI)),al=sin(ph*PI);glow(c,x,y,u*32,v=='assault'?'#7affb0':'#fff2d0',.35*al);c.fillStyle=rgba('#ffffff',al);c.beginPath();c.arc(x,y,u*.5,0,TAU);c.fill();line(c,x,y,x-u*3*ph,y+u*8,rgba('#fff2d0',.25*al),u*.1)}
  ridge(c,W,H,{base:hz+u,amp:u*2,seed:41,col:dk('#4a4638','#0c0b09'),f:2});
  for(let i=0;i<9;i++)tree(c,hh(i,561)*W,hz+u*1.5,u*(2+4*hh(i,562)),dk('#2a261c','#060504'),i+3,1);
  c.strokeStyle=dk('#2a261c','#0a0907');for(let r=0;r<2;r++){const y=hz+u*(4+r*4);c.lineWidth=u*.22;for(let x=-u*2+r*u*4;x<W+u*4;x+=u*8){c.beginPath();c.moveTo(x-u*1.4,y+u*2.4);c.lineTo(x+u*1.4,y-u*2.4);c.moveTo(x+u*1.4,y+u*2.4);c.lineTo(x-u*1.4,y-u*2.4);c.stroke()}
    c.lineWidth=u*.08;for(let k=0;k<3;k++){c.beginPath();for(let x=-u*2;x<=W+u*2;x+=u){const yy=y-u*1.6+k*u*1.4+sin(x/u*.8+k)*u*.7;x<=-u*2?c.moveTo(x,yy):c.lineTo(x,yy)}c.stroke()}}
  const g=c.createLinearGradient(0,hz+u*6,0,H);g.addColorStop(0,dk('#5a5240','#16130f'));g.addColorStop(1,dk('#2a241a','#050403'));c.fillStyle=g;c.fillRect(-W*.1,hz+u*8,W*1.2,H);
  if(a.crosses)for(let i=0;i<12;i++){const x=W*(.04+.085*i),y=hz+u*(12+hh(i,571)*2),s=u*(2.8+hh(i,572));c.fillStyle=dk('#d9d0b8','#8a8474');c.fillRect(x-s*.08,y-s,s*.16,s);c.fillRect(x-s*.32,y-s*.72,s*.64,s*.14)}
  const ty=H*.7;c.fillStyle=dk('#1c1810','#030302');c.fillRect(-W*.1,ty,W*1.2,H);
  for(let r=0;r<3;r++)for(let x=-u*3+(r%2)*u*2.4;x<W+u*3;x+=u*4.8){c.fillStyle=day?['#8a7a5a','#7a6a4c','#6a5c42'][r]:['#2a251c','#221e17','#1a1712'][r];rr(c,x,ty-u*(1.9*(3-r))+u*1.2,u*4.6,u*1.8,u*.8);c.fill()}
  const wood=dk('#4a3c28','#14110c');for(let x=0;x<W;x+=u*2.4)line(c,x,H*.93,x+u*1.6,H*.93,wood,u*.5);
  line(c,W*.8,H,W*.76,ty-u*5,wood,u*.4);line(c,W*.86,H,W*.82,ty-u*5,wood,u*.4);for(let k=0;k<7;k++){const p=k/7;line(c,lerp(W*.8,W*.76,p),lerp(H,ty-u*5,p),lerp(W*.86,W*.82,p),lerp(H,ty-u*5,p),wood,u*.3)}
  const hx=W*.3,hy=ty-u*4.6;c.fillStyle=dk('#3a4034','#0c0d0b');c.beginPath();c.ellipse(hx,hy,u*2.2,u*1.5,0,PI,0);c.fill();c.fillRect(hx-u*2.7,hy-u*.15,u*5.4,u*.5);
  if(a.tags)OBJ.tags(c,W*.56,ty+u*3,u*8,t,1);
  if(a.flowers)for(let i=0;i<16;i++){const x=W*(.08+.055*i)+hh(i,581)*u*2,y=ty-u*(5.6+hh(i,582)*1.4);line(c,x,y+u*2,x,y,'#3a5a2a',u*.12);c.fillStyle='#f3efe0';for(let k=0;k<7;k++){c.beginPath();c.arc(x+cos(k/7*TAU)*u*.45,y+sin(k/7*TAU)*u*.45,u*.26,0,TAU);c.fill()}c.fillStyle='#e3a646';c.beginPath();c.arc(x,y,u*.24,0,TAU);c.fill()}
  if(day){for(let i=0;i<14;i++){const ph=fr(t*.35+hh(i,591)),x=W*hh(i,592),y=hz+u*4-sin(ph*PI)*u*(8+10*hh(i,593));c.save();c.translate(x,y);c.rotate(ph*7);c.fillStyle='#2a3028';c.beginPath();c.ellipse(0,0,u*1.1,u*.75,0,PI,0);c.fill();c.fillRect(-u*1.4,-u*.1,u*2.8,u*.28);c.restore()}birds(c,t,W,H,u,{n:8,x:W*.5,y:H*.2,r:u*18,col:'#f3efe0',s:1.1})}
  else{fog(c,t,W,H,{y:hz+u*4,h:u*14,col:v=='assault'?'#2a5a40':'#5a5a52',al:.22,n:6});rain(c,t,W,H,u,{n:150,al:.3,wind:.2,col:'#c9c9c0'})}
  if(v=='assault'){for(let k=0;k<5;k++){const q=t*.7+k*.21,f=fr(q);if(f<.12)glow(c,W*hh(k+floor(q),601),hz+u*4,u*14,'#9fffc8',.9*(1-f/.12))}
    c.strokeStyle=rgba('#9fffc8',.7);c.lineWidth=u*.14;for(let k=0;k<7;k++){const ph=fr(t*.9+k/7),x0=W*hh(k,611),x1=W*hh(k,612);c.beginPath();c.moveTo(lerp(x0,x1,ph),hz+u*2-sin(ph*PI)*u*12);c.lineTo(lerp(x0,x1,ph-.05),hz+u*2-sin((ph-.05)*PI)*u*12);c.stroke()}}};

P.hill=(c,t,W,H,u,a)=>{const boom=a.v=='boom',hz=H*.56,t0=a.at||4,e=clamp((t-t0)/5),dk=(d,n)=>boom?n:d;
  sky(c,W,H,boom?['#060507','#1a1210','#4a2a16']:['#3a4450','#8a8f8c','#c9bfa6'],0,hz);if(boom)stars(c,t,W,H,u,{n:40,y1:.4,al:.4});
  ridge(c,W,H,{base:hz-u*2,amp:u*6,seed:51,col:dk('#6a746c','#100c0b'),f:.8});
  c.fillStyle=dk('#4a5246','#0a0807');c.beginPath();c.moveTo(W*.34,hz+u*4);c.bezierCurveTo(W*.5,hz-u*4,W*.6,hz-u*17,W*.74,hz-u*18);c.bezierCurveTo(W*.88,hz-u*17,W*.98,hz-u*6,W*1.1,hz+u*2);c.lineTo(W*1.1,hz+u*6);c.closePath();c.fill();
  const bx=W*.72,by=hz-u*12;c.fillStyle=dk('#2a2e28','#050404');rr(c,bx-u*5,by-u*1.6,u*10,u*3.4,u);c.fill();c.fillStyle='#000000';c.fillRect(bx-u*3.6,by-u*.4,u*7.2,u*.7);
  txt(c,'299',bx+u*8,by-u*6,u*2.6,dk('#1c201a',rgba('#ffd9a0',.75)),{w:700});line(c,bx+u*8,by-u*4.4,bx+u*8,by+u,dk('#1c201a',rgba('#ffd9a0',.5)),u*.15);
  const vx=W*.2,vy=hz+u*3,vc=dk('#3a3a34','#070606');skyline(c,t,W,H,u,{base:vy,seed:621,minH:2,maxH:5,minW:3,maxW:5,col:vc,gable:1,win:boom?'#ffd08a':null,lit:.3});
  c.fillStyle=vc;c.fillRect(vx-u*1.4,vy-u*10,u*2.8,u*10);poly(c,[vx-u*1.7,vy-u*10,vx,vy-u*18,vx+u*1.7,vy-u*10],vc);line(c,vx,vy-u*18,vx,vy-u*20,vc,u*.2);line(c,vx-u*.7,vy-u*19.2,vx+u*.7,vy-u*19.2,vc,u*.2);
  c.fillStyle=dk('#2a2e24','#040303');c.fillRect(-W*.1,hz+u*5,W*1.2,H);for(let i=0;i<9;i++){c.strokeStyle=rgba(dk('#4a5040','#1a1410'),.8);c.lineWidth=u*.25;c.beginPath();c.moveTo(-W*.1,hz+u*(7+i*4));c.quadraticCurveTo(W*.5,hz+u*(6+i*4.6),W*1.1,hz+u*(8+i*4));c.stroke()}
  if(!boom){const tx=vx+u*4,tyy=vy-u*2,p=clamp((t-t0)/.25);if(t>t0-.02&&t<t0+1.2){line(c,W*.62,hz-u*13,lerp(W*.62,tx,p),lerp(hz-u*13,tyy,p),rgba('#fff2c8',1-clamp((t-t0)/1.2)),u*.16);glow(c,W*.62,hz-u*13,u*6,'#fff2c8',1-clamp((t-t0)/.5))}
    if(t>t0)birds(c,t,W,H,u,{n:14,x:vx+(t-t0)*u*2,y:vy-u*16-(t-t0)*u*1.5,r:u*(4+(t-t0)*2.5),col:'#14140f',sp:2});fog(c,t,W,H,{y:hz+u*3,h:u*10,col:'#e9e0c8',al:.25,n:5});
    if(t<t0+.4){const rx=lerp(W*.5,tx,sm(t/t0)),ry=lerp(H*.3,tyy,sm(t/t0)),R=u*7;c.strokeStyle=rgba('#0a0a08',.85);c.lineWidth=u*.16;c.beginPath();c.arc(rx,ry,R,0,TAU);c.moveTo(rx-R*1.3,ry);c.lineTo(rx-R*.3,ry);c.moveTo(rx+R*.3,ry);c.lineTo(rx+R*1.3,ry);c.moveTo(rx,ry-R*1.3);c.lineTo(rx,ry-R*.3);c.moveTo(rx,ry+R*.3);c.lineTo(rx,ry+R*1.3);c.stroke()}}
  else{if(t>t0){glow(c,bx,by,max(W,H)*(.25+.6*eo(e)),'#ffb04a',.9*(1-e)+.12);for(let k=0;k<7;k++)flame(c,bx+(k-3)*u*2,by+u,u*(4+3*hh(k,631))*(1-e*.4),t,k,'#ffa23a',1.4);
      for(let k=0;k<10;k++){const an=k/10*TAU,r=u*(4+12*eo(e))*(.6+.4*hh(k,632));c.fillStyle=rgba(k%2?'#1a1210':'#2a1c16',.85);c.beginPath();c.arc(bx+cos(an)*r*.8,by-u*4-abs(sin(an))*r-eo(e)*u*12,u*(3+6*eo(e))*(.6+.4*hh(k,633)),0,TAU);c.fill()}
      for(let k=0;k<16;k++){const an=-PI*hh(k,634),d=eo(e)*u*(10+24*hh(k,635));c.fillStyle='#0a0807';c.fillRect(bx+cos(an)*d,by+sin(an)*d+e*e*u*22,u*(.5+hh(k,636)),u*(.5+hh(k,637)))}
      const f=clamp((t-t0)/.4);c.fillStyle=rgba('#fff2d0',(1-f)*.85);c.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);embers(c,t,W,H,u,{n:60,x0:bx-u*10,x1:bx+u*10,y:by,h:.5})}
    rain(c,t,W,H,u,{n:110,al:.25,wind:.2,col:'#c9c9c0'})}};

P.steppe=(c,t,W,H,u,a)=>{const v=a.v||'day',hz=H*.5,K=o=>o[v];
  sky(c,W,H,K({day:['#5a86a8','#a9c4cf','#e9dcae'],dusk:['#1a1430','#6a3a5a','#e08a4a'],frost:['#0a1220','#2a4660','#9ab6c8'],road:['#3a4a5a','#a39a8a','#e3c79a']}),0,hz);
  if(v=='dusk'||v=='frost')stars(c,t,W,H,u,{n:50,y1:.35,al:.5});
  const cc=K({day:'#f3efe2',dusk:'#8a4a5a',frost:'#4a6680',road:'#e6dccb'}),ce=v=='dusk'?'#ffb07a':'#ffffff';
  for(let k=0;k<4;k++){const x=mod(W*(.15+.3*k)+t*u*.35,W*1.4)-W*.2,y=H*(.2+.07*(k%2)),s=u*(7+3*(k%2));cloud(c,x,y,s,cc,ce);cloud(c,x+s*.8,y-s*.7,s*.6,cc,ce)}
  if(v=='dusk'){glow(c,W*.7,hz,u*36,'#ffb04a',.5);c.fillStyle='#ffd9a0';c.beginPath();c.arc(W*.7,hz,u*3.4,PI,0);c.fill()}
  ridge(c,W,H,{base:hz+u*.5,amp:u*1.6,seed:61,col:K({day:'#6a8a5a',dusk:'#2a1c30',frost:'#22384a',road:'#6a6450'}),f:.7});
  water(c,t,W,H,u,{y:hz+u*2,c1:K({day:'#7fb0a0',dusk:'#b0604a',frost:'#7fa6c0',road:'#9a9480'}),c2:K({day:'#3a6a5a',dusk:'#3a1c30',frost:'#2a4660',road:'#5a5444'}),gl:v=='day'?'#baffd0':'#ffffff',al:.4,n:60,flow:.5});
  const nr=a.riders||0;for(let i=0;i<nr;i++){const x=mod(W*(.1+.8*hh(i,651))+t*u*(.8+hh(i,652))*(i%2?1:-1),W),y=hz+u*1.6,s=u*(1+.4*hh(i,653)),col=v=='day'?'#2a3020':'#060408',bob=sin(t*6+i)*s*.1;c.fillStyle=col;c.beginPath();c.ellipse(x,y-s+bob,s*.9,s*.4,0,0,TAU);c.fill();c.fillRect(x-s*.7,y-s,s*.14,s);c.fillRect(x+s*.5,y-s,s*.14,s);c.fillRect(x-s*.1,y-s*2+bob,s*.22,s*.9);c.beginPath();c.arc(x,y-s*2.1+bob,s*.2,0,TAU);c.fill();line(c,x+s*.1,y-s*1.7+bob,x+s*.4,y-s*2.9+bob,col,u*.08)}
  const gy=hz+u*8,g=c.createLinearGradient(0,gy,0,H);g.addColorStop(0,K({day:'#c9a64a',dusk:'#5a3a2a',frost:'#8aa0aa',road:'#a88a4a'}));g.addColorStop(1,K({day:'#5a4a1c',dusk:'#120a10',frost:'#1c2a34',road:'#3a2e16'}));c.fillStyle=g;c.beginPath();c.moveTo(-W*.1,H*1.1);c.lineTo(-W*.1,gy);for(let i=0;i<=30;i++){const x=lerp(-W*.1,W*1.1,i/30);c.lineTo(x,gy+sin(x/W*6)*u*.8)}c.lineTo(W*1.1,H*1.1);c.fill();
  if(v=='road'){poly(c,[W*.45,gy,W*.5,gy,W*.92,H*1.05,W*.18,H*1.05],'rgba(60,46,26,.75)');const p=sm(t/14),x=lerp(W*.52,W*.475,p),y=lerp(H*.84,gy+u*3,p),s=u*lerp(3.6,1.2,p);c.fillStyle='#14100a';c.beginPath();c.ellipse(x,y-s*1.1,s*.9,s*.42,0,0,TAU);c.fill();c.fillRect(x-s*.7,y-s,s*.16,s);c.fillRect(x+s*.5,y-s,s*.16,s);c.fillRect(x+s*.7,y-s*1.9,s*.2,s*.8);c.beginPath();c.arc(x+s*.9,y-s*1.9,s*.24,0,TAU);c.fill();
    for(const d of[-1.6,-2.5]){c.fillRect(x+d*s-s*.1,y-s*1.5,s*.22,s*1.5);c.beginPath();c.arc(x+d*s,y-s*1.75,s*.2,0,TAU);c.fill()}}
  const gc=K({day:'#e9c86a',dusk:'#b0704a',frost:'#cfe0e8',road:'#d9b86a'});c.lineCap='round';for(let i=0;i<260;i++){const d=pow(hh(i,641),1.5),y=gy+d*(H-gy),x=hh(i,642)*W,h=u*(1.2+4*d),sw=sin(t*1.4+x/W*8+y*.01)*h*.5;c.strokeStyle=rgba(gc,.25+.5*hh(i,643));c.lineWidth=u*(.06+.12*d);c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+sw*.3,y-h*.6,x+sw,y-h);c.stroke()}
  if(a.fires)for(let i=0;i<5;i++)flame(c,W*(.12+.19*i),gy+u*(2+hh(i,661)*4),u*1.6,t,i,'#ffa23a');
  if(v=='frost'){c.strokeStyle=rgba('#e6f6ff',.7);c.lineWidth=u*.1;for(let i=0;i<26;i++){const x=hh(i,671)*W,y=gy+hh(i,672)*(H-gy)*.9,r=u*(1+3*hh(i,673))*sm(t/8);for(let k=0;k<6;k++){const an=k/6*TAU+i;c.beginPath();c.moveTo(x,y);c.lineTo(x+cos(an)*r,y+sin(an)*r*.5);c.stroke()}}
    for(let k=0;k<4;k++){const q=t*.8+k*.27,f=fr(q);if(f<.1)glow(c,W*hh(k+floor(q),681),hz+u,u*10,'#fff2c8',.9*(1-f/.1))}snow(c,t,W,H,u,{n:90,al:.7,wind:1.5})}};

P.amber=(c,t,W,H,u,a)=>{sky(c,W,H,['#0a0502','#1c0e04','#0a0502']);const cx=W*.5,cy=H*.44,N=7;
  for(let k=0;k<N;k++){const s0=pow(1-k/N,1.7),s1=pow(1-(k+1)/N,1.7),x0=W*.56*s0+u*3,y0=H*.5*s0+u*4,x1=W*.56*s1+u*3,y1=H*.5*s1+u*4;
    for(const d of[-1,1])for(let r=0;r<4;r++){const f0=r/4,f1=(r+1)/4,pt=[cx+d*x0,cy-y0+2*y0*f0,cx+d*x1,cy-y1+2*y1*f0,cx+d*x1,cy-y1+2*y1*f1,cx+d*x0,cy-y0+2*y0*f1],id=k*17+r*5+(d>0?3:0),b=.35+.65*hh(id,701),fl=.75+.25*sin(t*(.6+hh(id,702))+id);
      poly(c,pt,rgba(['#c9761a','#e39a2a','#a85a10','#f0b040'][id%4],(.25+.6*b*fl)*(1-k/N*.5)),'rgba(58,26,4,.9)',u*.15);
      if(hh(id,703)>.5){const mx=(pt[0]+pt[2]+pt[4]+pt[6])/4,my=(pt[1]+pt[3]+pt[5]+pt[7])/4,ss=u*1.8*s0+u*.3,kd=floor(hh(id,704)*4);c.fillStyle='rgba(30,12,2,.78)';c.beginPath();
        if(kd==0)c.ellipse(mx,my,ss*.3,ss*.8,.4,0,TAU);else if(kd==1){c.arc(mx,my-ss*.4,ss*.3,0,TAU);c.rect(mx-ss*.08,my-ss*.2,ss*.16,ss)}else if(kd==2){c.moveTo(mx-ss*.6,my);c.quadraticCurveTo(mx,my-ss*.9,mx+ss*.6,my);c.quadraticCurveTo(mx,my-ss*.2,mx-ss*.6,my)}else c.rect(mx-ss*.4,my-ss*.2,ss*.8,ss*.4);c.fill()}}
    poly(c,[cx-x0,cy-y0,cx+x0,cy-y0,cx+x1,cy-y1,cx-x1,cy-y1],'rgba(42,20,4,.92)');poly(c,[cx-x0,cy+y0,cx+x0,cy+y0,cx+x1,cy+y1,cx-x1,cy+y1],k%2?'rgba(58,28,6,.95)':'rgba(42,20,4,.95)')}
  glow(c,cx,cy,u*18,'#ffd08a',.6);c.fillStyle='#fff0c8';c.fillRect(cx-u*1.8,cy-u*3,u*3.6,u*6);c.fillStyle='#1c0e04';c.fillRect(cx-u*.07,cy-u*3,u*.14,u*6);
  c.strokeStyle=rgba('#ffe1a6',.4);c.lineWidth=u*.14;c.setLineDash([u*1.2,u*.8]);for(let k=0;k<4;k++){c.lineDashOffset=-t*u*(k%2?1.5:-1.5);c.beginPath();c.ellipse(cx,cy+H*.27,u*(6+k*5),u*(1.2+k),0,0,TAU);c.stroke()}c.setLineDash([]);c.lineDashOffset=0;
  for(let i=0;i<70;i++){c.fillStyle=rgba('#ffe1a6',.1+.3*hh(i,713)*(.5+.5*sin(t+i)));c.fillRect(hh(i,711)*W,mod(hh(i,712)*H+sin(t*.3+i)*u*3,H),u*.14,u*.14)}
  c.save();c.translate(W*.5,H*.13);c.rotate(-.05);c.globalAlpha=.8;const w=min(W*.72,u*38);c.fillStyle='rgba(10,5,2,.6)';c.fillRect(-w/2,-u*2.2,w,u*4.4);c.strokeStyle='#e2553f';c.lineWidth=u*.25;c.strokeRect(-w/2,-u*2.2,w,u*4.4);txt(c,'SEALED  BY ORDER OF THE PAX HOUSE',0,u*.1,min(u*1.7,w*.048),'#e2553f',{w:700});c.restore();c.globalAlpha=1};

P.thread=(c,t,W,H,u,a)=>{sky(c,W,H,['#020308','#070a18','#0c1024']);const v=a.v||'knots',T0=a.start??1.5,TS=a.step??1.6,y0=H*(v=='knots'&&a.tower?.52:.46),path=x=>y0+sin(x/W*5+t*.4)*u*3+sin(x/W*11-t*.3)*u*1.2;stars(c,t,W,H,u,{n:70,y1:1,al:.35});
  if(a.tower){const tx=W*.8,tw=u*8,th=H*.62,by=H*.84;glow(c,tx,by-th*.5,th*.8,'#3a4a80',.3);c.fillStyle='#141a30';c.fillRect(tx-tw/2,by-th,tw,th+H);poly(c,[tx-tw*.7,by-th,tx,by-th-u*6,tx+tw*.7,by-th],'#141a30');c.fillStyle='rgba(0,0,0,.25)';for(let r=1;r<24;r++)c.fillRect(tx-tw/2,by-th+r*th/24,tw,u*.1);
    for(let k=0;k<6;k++){const op=clamp((t-T0-k*TS)/.8),y=by-u*3-k*th/6.4;c.fillStyle=rgba('#ffd98a',op);c.fillRect(tx-u*1.3,y-u*3,u*2.6,u*3);if(op>0)glow(c,tx,y-u*1.5,u*6*op+1,'#ffd98a',.5*op);c.strokeStyle='#2a3050';c.lineWidth=u*.15;c.strokeRect(tx-u*1.3,y-u*3,u*2.6,u*3)}
    dove(c,tx,by-th-u*7.2,u*2,'#f4f2ea');glow(c,tx,by-th-u*7.2,u*6,'#ffffff',.25)}
  const x1=v=='split'?W*.5:W*1.1;c.save();c.strokeStyle='#ffd98a';c.lineWidth=u*.26;c.shadowColor='#ffb84a';c.shadowBlur=u*2.4;c.lineCap='round';c.beginPath();for(let i=0;i<=80;i++){const x=lerp(-W*.1,x1,i/80);i?c.lineTo(x,path(x)):c.moveTo(x,path(x))}c.stroke();
  if(v=='knots')for(let k=0;k<6;k++){const x=W*(.08+.105*k),und=clamp((t-T0-k*TS)/.8),r=u*2.4*(1-und);if(r>.4){c.beginPath();c.arc(x,path(x)-r,r,0,TAU);c.stroke();c.beginPath();c.arc(x+r*.7,path(x)-r*.4,r*.6,0,TAU);c.stroke()}}
  if(v=='split'){const ey=path(x1),e=sm((t-3)/6);c.lineWidth=u*.09;for(let k=0;k<5;k++){c.beginPath();c.moveTo(x1,ey);c.lineTo(x1+u*(2+k*.5),ey+(k-2)*u*.9+sin(t*2+k)*u*.3);c.stroke()}
    c.strokeStyle='#fff3d0';c.lineWidth=u*.22;c.beginPath();const sx=x1+u*6,ex=lerp(sx,W*1.1,e);for(let i=0;i<=60;i++){const x=lerp(sx,ex,i/60);i?c.lineTo(x,path(x)+u*4):c.moveTo(x,path(x)+u*4)}c.stroke()}
  c.restore();
  if(v=='knots')for(let k=0;k<6;k++){const x=W*(.08+.105*k),q=t-T0-k*TS-.8,sp=q>0?clamp(1-q):0;if(sp>0)glow(c,x,path(x),u*7*sp,'#ffe9bd',.85*sp)}
  if(v=='split'){const fx=W*.5+sin(t*.5)*u*6,fy=mod(H*.1+t*u*2.2,H*.8);c.save();c.translate(fx,fy);c.rotate(sin(t*.8)*.6+.5);c.fillStyle='#f4f2ea';c.beginPath();c.moveTo(0,-u*3);c.quadraticCurveTo(u*1.4,0,0,u*3);c.quadraticCurveTo(-u*1.4,0,0,-u*3);c.fill();line(c,0,-u*3,0,u*4,'#c9c4b4',u*.1);c.restore()}
  for(let i=0;i<24;i++){const x=mod(hh(i,721)*W+t*u*3,W*1.2)-W*.1;if(x>x1)continue;glow(c,x,path(x),u*(.8+hh(i,722)),'#fff3d0',.5+.4*sin(t*3+i))}
  if(v=='found'){const m=sm(t/16);for(let i=0;i<9;i++){const x=W*(.08+.84*hh(i,761))+sin(t*.2+i)*u*3,y=H*(.12+.56*hh(i,762))+cos(t*.17+i)*u*2,w=u*(5+5*hh(i,763)),h=w*.72;if(abs(y-y0)<u*7)continue;c.save();c.translate(x,y);c.rotate((hh(i,764)-.5)*.4);c.fillStyle=rgba('#e9e0c8',.1+.1*sin(t*.5+i));c.fillRect(-w/2,-h/2,w,h);c.fillStyle=rgba('#0c1024',.5);c.fillRect(-w/2+u*.5,-h/2+u*.5,w-u,h-u*1.6);glow(c,0,-u*.3,w*.5,'#ffd98a',.12);c.restore()}
    for(const d of[-1,1]){const x=W*(.5+d*.46*(1-m));glow(c,x,path(x),u*(5+3*(d>0)),d>0?'#ffe9bd':'#ffd98a',.9);c.fillStyle='#fff8e6';c.beginPath();c.arc(x,path(x),u*(.5+.3*(d>0)),0,TAU);c.fill()}
    glow(c,W*.5,y0,u*30*m+1,'#ffd98a',.34*m)}
  if(v=='split')rain(c,-t,W,H,u,{n:140,al:.3})};

P.tower=(c,t,W,H,u,a)=>{sky(c,W,H,['#6f8aa0','#b9c8d0','#f0ead8']);const sx=W*.7,sy=H*.22;glow(c,sx,sy,u*40,'#fff6dc',.8);c.fillStyle='#fffaf0';c.beginPath();c.arc(sx,sy,u*4.6,0,TAU);c.fill();
  for(let k=0;k<9;k++){const an=k/9*TAU+t*.02,g=c.createLinearGradient(sx,sy,sx+cos(an)*W,sy+sin(an)*W);g.addColorStop(0,'rgba(255,250,235,.22)');g.addColorStop(1,'rgba(255,250,235,0)');poly(c,[sx,sy,sx+cos(an-.05)*W*1.4,sy+sin(an-.05)*W*1.4,sx+cos(an+.05)*W*1.4,sy+sin(an+.05)*W*1.4],g)}
  for(let k=0;k<7;k++)cloud(c,mod(W*(k/6)+t*u*.25,W*1.3)-W*.15,H*(.6+.02*(k%2)),u*8,'#e3e6e4','#ffffff');
  const ts=min(W*.3,H*.23);c.fillStyle='rgba(60,80,96,.25)';poly(c,[W*.4-ts*.24,H*.8,W*.4+ts*.24,H*.8,W*.4+ts*.24-ts*1.6,H*.8+ts*.5,W*.4-ts*.24-ts*2.2,H*.8+ts*.5],'rgba(60,80,96,.18)');
  whiteTower(c,W*.4,H*.8,ts,t,u);
  for(let k=0;k<7;k++)cloud(c,mod(W*(k/5)-t*u*.5,W*1.4)-W*.2,H*(.84+.04*(k%2)),u*11,'#f6f4ec','#ffffff');for(let k=0;k<5;k++)cloud(c,mod(W*(k/4)+t*u*.35,W*1.4)-W*.2,H*(.98+.03*(k%2)),u*14,'#fbfaf5','#ffffff');
  for(let i=0;i<9;i++){const ph=fr(hh(i,731)+t*.035),x=W*hh(i,732)+sin(t*.6+i)*u*5;c.save();c.translate(x,ph*H);c.rotate(sin(t+i)*.8);c.fillStyle='rgba(255,255,255,.9)';c.beginPath();c.moveTo(0,-u*1.6);c.quadraticCurveTo(u*.8,0,0,u*1.6);c.quadraticCurveTo(-u*.8,0,0,-u*1.6);c.fill();c.restore()}
  if(a.smoke){fog(c,t,W,H,{y:H*.92,h:H*.25,col:'#5a4a44',al:.5,n:6});embers(c,t,W,H,u,{n:40,y:H,h:.3,col:'#ff9a4a',al:.7})}};

P.hermitage=(c,t,W,H,u,a)=>{const hz=H*.42;sky(c,W,H,['#7a8a9a','#c9c9b8','#f0dcae'],0,hz);glow(c,W*.3,hz-u*4,u*40,'#fff0c8',.6);
  ridge(c,W,H,{base:hz+u*2,amp:u*16,seed:71,col:'#9aa8a4',f:1.1});fog(c,t,W,H,{y:hz+u*2,h:u*10,col:'#ffffff',al:.3,n:5});
  ridge(c,W,H,{base:hz+u*10,amp:u*14,seed:77,col:'#6a8272',f:.9});fog(c,t,W,H,{y:hz+u*12,h:u*10,col:'#ffffff',al:.25,n:5,seed:9});ridge(c,W,H,{base:hz+u*22,amp:u*10,seed:83,col:'#3f5a48',f:.8});
  const lx=W*.56,ly=hz+u*22;c.fillStyle='#2a3a30';c.beginPath();c.moveTo(lx-u*30,ly+u*8);c.quadraticCurveTo(lx-u*8,ly-u*2,lx+u*4,ly-u*1.4);c.quadraticCurveTo(lx+u*14,ly-u,lx+u*30,ly+u*8);c.lineTo(lx+u*30,H*1.1);c.lineTo(lx-u*30,H*1.1);c.fill();
  const hx=lx,hy=ly-u*1.2,s=u*8;c.fillStyle='#8a8f88';c.fillRect(hx-s*.7,hy-s*.8,s*1.4,s*.8);c.fillStyle='rgba(0,0,0,.14)';for(let r=0;r<4;r++)for(let q=0;q<6;q++)c.fillRect(hx-s*.7+q*s*.24+(r%2)*s*.06,hy-s*.8+r*s*.2,s*.2,s*.025);
  poly(c,[hx-s*.9,hy-s*.8,hx,hy-s*1.5,hx+s*.9,hy-s*.8],'#4a4f4a');c.fillStyle='#4a4f4a';c.fillRect(hx+s*.3,hy-s*1.5,s*.2,s*.4);
  for(let k=0;k<5;k++){const ph=fr(t*.08+k/5);c.fillStyle=rgba('#f0f0ea',(1-ph)*.5);c.beginPath();c.arc(hx+s*.4+ph*u*5+sin(t+k)*u*.5,hy-s*1.5-ph*u*10,u*(.8+ph*3),0,TAU);c.fill()}
  const op=sm((t-2)/5);c.fillStyle='#1c1410';c.fillRect(hx-s*.14,hy-s*.5,s*.28,s*.5);c.fillStyle='#ffd98a';c.fillRect(hx-s*.14,hy-s*.5,s*.28*op,s*.5);glow(c,hx,hy-s*.25,s*1.6*op+1,'#ffd98a',.5*op);c.fillStyle='#ffd98a';c.fillRect(hx+s*.3,hy-s*.56,s*.16,s*.16);
  c.strokeStyle='rgba(220,210,180,.7)';c.lineWidth=u*.5;c.lineCap='round';c.beginPath();c.moveTo(W*.1,H*1.02);c.quadraticCurveTo(W*.42,H*.9,W*.3,H*.8);c.quadraticCurveTo(W*.24,H*.74,hx-s*.1,hy+u*.4);c.stroke();
  for(let i=0;i<70;i++){c.fillStyle=['#f3efe0','#e3a646','#c86a8a'][i%3];c.fillRect(hh(i,741)*W,ly+u*5+hh(i,742)*(H-ly),u*.3,u*.3)}
  const px=hx-s*1.5;line(c,px,hy+u*.5,px,hy-s*.9,'#3a2a1c',u*.25);c.fillStyle='#6a4a2a';c.fillRect(px-u,hy-s*1.2,u*2,u*1.8);poly(c,[px-u*1.3,hy-s*1.2,px,hy-s*1.2-u*1.2,px+u*1.3,hy-s*1.2],'#3a2a1c');c.fillStyle='#14100a';c.beginPath();c.arc(px,hy-s*1.2+u*.9,u*.35,0,TAU);c.fill();
  birds(c,t,W,H,u,{n:13,x:hx-u*2,y:hy-s*2.6,r:u*13,col:'#1c2420',sp:1.8,s:.9})};

P.castle=(c,t,W,H,u,a)=>{const hz=H*.52;sky(c,W,H,['#0a1016','#2a3a44','#7a8a86'],0,hz);ridge(c,W,H,{base:hz,amp:u*8,seed:91,col:'#22303a',f:.9});
  const cx=W*.56,by=hz-u*2;c.fillStyle='#0c1218';c.beginPath();c.moveTo(cx-u*30,hz+u*3);c.quadraticCurveTo(cx-u*10,by-u*6,cx,by-u*7);c.quadraticCurveTo(cx+u*12,by-u*6,cx+u*30,hz+u*3);c.fill();
  [[-13,10,3],[-8,15,3.4],[-2.5,21,4],[4,16,3.2],[9.5,12,3]].forEach(([dx,h,w],i)=>{const x=cx+dx*u,y=by-u*6;c.fillStyle='#0c1218';c.fillRect(x-w*u/2,y-h*u,w*u,h*u+u*4);for(let k=0;k<3;k++)c.fillRect(x-w*u/2+k*w*u*.39,y-h*u-u*.9,w*u*.22,u*.9);if(i%2==0)poly(c,[x-w*u*.6,y-h*u-u*.9,x,y-h*u-u*5,x+w*u*.6,y-h*u-u*.9],'#0c1218');c.fillStyle=rgba('#ffd98a',.8*(.6+.4*sin(t+i)));c.fillRect(x-u*.25,y-h*u*.7,u*.5,u*1.1)});
  c.fillStyle='#0c1218';c.fillRect(cx-u*14,by-u*12,u*25,u*8);for(let k=0;k<13;k++)c.fillRect(cx-u*14+k*u*2,by-u*12.9,u*1.1,u*.9);
  const op=sm((t-1.5)/7),dx=cx-u*2.4,dy=by-u*5.4;c.fillStyle='#04070a';c.beginPath();c.moveTo(dx-u*1.6,dy+u*4.4);c.lineTo(dx-u*1.6,dy);c.arc(dx,dy,u*1.6,PI,0);c.lineTo(dx+u*1.6,dy+u*4.4);c.fill();
  c.fillStyle='#ffe6b0';c.fillRect(dx-u*.1-u*.7*op,dy-u*1.2,u*.2+u*1.4*op,u*5.6);glow(c,dx,dy+u*1.5,u*(4+12*op),'#ffd98a',.5+.3*op);
  for(const d of[-1,1]){const x=cx+d*u*8-u*2;poly(c,[x,by-u*11,x+u*1.6,by-u*11,x+u*1.6,by-u*6.5,x+u*.8,by-u*7.4,x,by-u*6.5],'#6a1c22')}
  water(c,t,W,H,u,{y:hz+u*2.5,c1:'#4a5c60',c2:'#06090c',gl:'#e9f0ee',al:.35,n:90});
  for(let i=0;i<18;i++){const d=i/18,y=hz+u*3.5+d*(H-hz)*.8,w=u*(.6+4*d)*(.5+hh(i,751))*(.3+op);c.fillStyle=rgba('#ffd98a',.5*(1-d)*(.5+.5*sin(t*1.4+i)));c.fillRect(dx-w/2+sin(t+i)*u*.8,y,w,u*.16)}
  const gx=W*.28,gy=hz+u*16;glow(c,gx,gy,u*8,'#cfeee8',.25+.2*sin(t*1.2));c.strokeStyle=rgba('#eaf6f2',.55+.3*sin(t*1.2));c.lineWidth=u*.16;c.beginPath();c.moveTo(gx,gy-u*4);c.lineTo(gx,gy+u*2);c.moveTo(gx-u,gy-u*2.6);c.lineTo(gx+u,gy-u*2.6);c.stroke();
  for(let k=0;k<3;k++){const ph=fr(t*.15+k/3);c.strokeStyle=rgba('#eaf6f2',(1-ph)*.4);c.beginPath();c.ellipse(gx,gy,u*(2+ph*10),u*(.5+ph*2.6),0,0,TAU);c.stroke()}
  fog(c,t,W,H,{y:hz+u,h:u*12,col:'#dfe8e6',al:.3,n:7});fog(c,t,W,H,{y:hz-u*12,h:u*14,col:'#dfe8e6',al:.14,n:4,seed:5})};

const STORMS=[[1999,1996],[1996,1985],[1987,1977],[1978,1935],[1936,1912],[1913,1966],[1966,1929],[1929,1913],[1914,1990],[1991,1920],[1921,1935]],REALY=[1999,2000,2003,2004,2006,2007,2007,2007,2008,2009,2009];
P.chart=(c,t,W,H,u,a)=>{sky(c,W,H,['#04060a','#0a1016','#0c141a']);const n=a.n||10,fs=u*(W>H?1.5:1.9),x0=W*(W>H?.1:.15),x1=W*.95,y0=H*.14,y1=H*.6,Y=y=>lerp(y1,y0,(y-1905)/95),X=i=>lerp(x0,x1,i/11);
  for(let y=1910;y<=2000;y+=10){c.strokeStyle=rgba('#ece4d2',y%50?.07:.18);c.lineWidth=1;c.beginPath();c.moveTo(x0,Y(y));c.lineTo(x1,Y(y));c.stroke();if(y%20==0)txt(c,String(y),x0-u*.9,Y(y),fs*.8,rgba('#ece4d2',.6),{al:'right'})}
  c.setLineDash([u*.6,u*.6]);c.strokeStyle=rgba('#e2553f',.7);c.lineWidth=u*.1;c.beginPath();c.moveTo(x0,Y(1999));c.lineTo(x1,Y(1999));c.stroke();c.setLineDash([]);txt(c,'1999',x1,Y(1999)-fs*.8,fs*.85,'#e2553f',{al:'right',w:700});
  const prog=clamp(t/9)*n;
  for(let i=0;i<n;i++){const f=STORMS[i][0],to=STORMS[i][1],p=clamp(prog-i),x=X(i+.5),fw=to>f;if(p<=0)break;
    if(i>0){c.strokeStyle=rgba('#ece4d2',.55);c.lineWidth=u*.14;c.beginPath();c.moveTo(X(i-.5),Y(STORMS[i-1][1]));c.lineTo(x,Y(f));c.stroke()}
    const yy=lerp(Y(f),Y(to),eo(p)),col=fw?'#7fe0c8':'#e3a646';c.strokeStyle=col;c.lineWidth=u*.32;c.beginPath();c.moveTo(x,Y(f));c.lineTo(x,yy);c.stroke();glow(c,x,yy,u*2.8,col,.6);c.fillStyle='#fff3d0';c.beginPath();c.arc(x,yy,u*.42,0,TAU);c.fill();
    for(let k=0;k<4;k++){const ph=fr(t*.8+k/4+i*.13),ry=lerp(max(Y(f),yy),min(Y(f),yy),ph);c.fillStyle=rgba('#bfe6ee',.45*(1-ph));c.fillRect(x+u*.7+k%2*u*.4,ry,u*.09,u)}
    if(p>=1){txt(c,String(to),x,Y(to)+(fw?-1:1)*fs*.95,fs*.82,'#fff3d0',{w:700});txt(c,String(i+1),x,y1+fs*1.3,fs*.8,rgba('#ece4d2',.7));txt(c,"'"+String(REALY[i]).slice(2),x,y1+fs*2.9,fs*.74,rgba('#86bcc4',.9))}}
  c.strokeStyle=rgba('#ece4d2',.3);c.lineWidth=1;c.beginPath();c.moveTo(x0,y1+fs*2.1);c.lineTo(x1,y1+fs*2.1);c.stroke();
  txt(c,'ERA',x0-u*.9,y0-fs*1.2,fs*.7,'#e3a646',{al:'right',w:700});txt(c,'No.',x0-u*.9,y1+fs*1.3,fs*.7,'#e3a646',{al:'right',w:700});txt(c,'REAL',x0-u*.9,y1+fs*2.9,fs*.7,'#86bcc4',{al:'right',w:700});
  rain(c,-t,W,H,u,{n:60,al:.14})};
