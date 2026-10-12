/* ChatManta facial rig. All inputs interpolate continuously, without frame swapping. */
(function(global){
const eyes={left:{c:[696,437],angle:-18,rx:82,ry:90,p:[716,426],look:[18,14]},right:{c:[1009,333],angle:-32,rx:55,ry:81,p:[994,331],look:[12,11]}};
const families={smile:[100,12,85],oh:[53,-53,61],ee:[118,-8,37],sad:[94,-37,-23],ah:[106,-13,115],oo:[38,-43,53],fv:[100,3,29],l:[86,3,76]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)));
function aperture(side,op){const e=eyes[side],x=e.rx*(.9+.35*op),top=-(e.ry*1.08*op+32*(1-op)),bottom=e.ry*1.08*op-32*(1-op);return `M${-x} 0 C${-x*.6} ${top} ${x*.6} ${top} ${x} 0 C${x*.6} ${bottom} ${-x*.6} ${bottom} ${-x} 0Z`;}
function rim(side,op){const e=eyes[side],x=e.rx*(.9+.35*op),top=-(e.ry*1.08*op+32*(1-op)),q=.16*op,p=[[-x,0],[-x*.6,top],[x*.6,top],[x,0]];
const bez=t=>{let u=1-t;return [0,1].map(i=>u*u*u*p[0][i]+3*u*u*t*p[1][i]+3*u*t*t*p[2][i]+t*t*t*p[3][i]);};
const der=t=>{let u=1-t;return [0,1].map(i=>3*u*u*(p[1][i]-p[0][i])+6*u*t*(p[2][i]-p[1][i])+3*t*t*(p[3][i]-p[2][i]));};
const a=bez(q),b=bez(1-q),da=der(q),db=der(1-q),span=1-2*q,c=a.map((v,i)=>v+da[i]*span/3),d=b.map((v,i)=>v-db[i]*span/3);return `M${a[0]} ${a[1]} C${c[0]} ${c[1]} ${d[0]} ${d[1]} ${b[0]} ${b[1]}`;}
function set(root,params={}){const o={leftOpen:1,rightOpen:1,gazeX:0,gazeY:0,pupilScale:1,mouthFamily:'smile',mouthOpen:0,...params};const el=id=>root.querySelector('#'+id);
for(const side of ['left','right']){const e=eyes[side],op=clamp(o[side+'Open'],0,1),gx=clamp(o.gazeX,-1,1),gy=clamp(o.gazeY,-1,1),sz=clamp(o.pupilScale,.8,1.2);
el('lid-'+side+'-aperture').setAttribute('d',aperture(side,op));el('lid-'+side+'-line').setAttribute('d',rim(side,op));el('lid-'+side+'-line').setAttribute('opacity',Math.min(1,(1-op)*5));el('pupil-'+side+'-move').setAttribute('transform',`translate(${gx*e.look[0]} ${gy*e.look[1]}) translate(${e.p[0]} ${e.p[1]}) scale(${sz}) translate(${-e.p[0]} ${-e.p[1]})`);}
const family=families[o.mouthFamily]?o.mouthFamily:'smile',t=clamp(o.mouthOpen,0,1),[tw,tt,tb]=families[family],w=100+(tw-100)*t,top=16+(tt-16)*t,bottom=16+(tb-16)*t;
const d=`M${-w/2} 0 C${-w*.24} ${top} ${w*.24} ${top} ${w/2} 0 C${w*.24} ${bottom} ${-w*.24} ${bottom} ${-w/2} 0Z`;
el('mouth-shape').setAttribute('d',d);el('mouth-shape').setAttribute('stroke-width',7-4*t);el('mouth-clip-path').setAttribute('d',d);
el('tongue').setAttribute('cy',bottom*(family==='l'?.30:.69));el('tongue').setAttribute('rx',w*(family==='l'?.17:.29));el('tongue').setAttribute('ry',Math.max(4,(bottom-top)*(family==='l'?.34:.18)));el('tongue').setAttribute('opacity',['sad','fv'].includes(family)?0:t);el('teeth').setAttribute('opacity',['ee','fv','l'].includes(family)?t:0);
return o;}
global.MantaRig={set,eyes,families};
})(typeof window!=='undefined'?window:globalThis);
