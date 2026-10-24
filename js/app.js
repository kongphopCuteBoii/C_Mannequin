import * as THREE from 'three';
import { MODEL_BASE, MODEL_BODY, MODEL_UNDER, BAD } from './config.js';
import { tr } from './translations.js';
import { initWelcome } from './welcome.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';

/* Third-party human model (MakeHuman/MPFB based). Check the repo licence before client delivery.
   For stability, replace "@master" with a specific commit hash once you have a version you like. */
const DEG=Math.PI/180,{lerp,clamp}=THREE.MathUtils;
const V3=THREE.Vector3,Q=THREE.Quaternion;
const $=(s,r=document)=>r.querySelector(s);
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const nm=o=>o.name.toLowerCase().replace(/[^a-z0-9]/g,'');
/* ===================================================================== SCENE */
const view=$('#view');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const dom=renderer.domElement;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(35,1,.05,100);
const controls=new OrbitControls(camera,dom);
controls.enableDamping=true;controls.dampingFactor=.12;
controls.minDistance=.8;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.52;

scene.add(new THREE.HemisphereLight(0xe8edf4,0x29221d,1.5));
const key=new THREE.DirectionalLight(0xffead9,2.6);
key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-2.2,right:2.2,top:2.6,bottom:-1.4,near:.5,far:24});
key.shadow.bias=-.0004;key.shadow.normalBias=.02;
scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xb7cbe5,.9);fill.position.set(-4,2,-3);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffd7ad,1.0);rim.position.set(0,3,-4);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.38}));
floor.rotation.x=-Math.PI/2;floor.position.y=.001;floor.receiveShadow=true;scene.add(floor);

let grid=null;
function setBg(m){
  const c={dark:['#111315',0x3b3e41,0x25282a],mid:['#5d6368',0x82888d,0x6f757a],light:['#ecebe9',0xc9c7c2,0xdcdad6]}[m]||null;
  scene.background=new THREE.Color(c[0]);
  if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose()}
  grid=new THREE.GridHelper(6,30,c[1],c[2]);grid.visible=opts.grid;scene.add(grid);
}

/* ===================================================================== OPTIONS */
const opts={mode:'man',ground:true,mirror:false,highlight:true,shadows:true,grid:true,ruler:false,handles:true,under:true,shading:'clay',bg:'dark',az:35,el:50};
function setLight(){
  const a=opts.az*DEG,e=opts.el*DEG,R=8;
  key.position.set(Math.cos(e)*Math.sin(a)*R,.9+Math.sin(e)*R,Math.cos(e)*Math.cos(a)*R);
  key.target.position.set(0,.9,0);
  key.castShadow=opts.shadows;floor.visible=opts.shadows;
}

/* ===================================================================== MATERIALS */
const grad=new THREE.DataTexture(new Uint8Array([70,140,210,255]),4,1,THREE.RedFormat);
grad.minFilter=grad.magFilter=THREE.NearestFilter;grad.needsUpdate=true;
function buildMats(style){
  const col={clay:0xcfc1b0,toon:0xcfc1b0,chalk:0xe8e6e1}[style];
  const jc={clay:0xa89b8b,toon:0xa89b8b,chalk:0xcdcbc6}[style];
  const uc={clay:0x8f8579,toon:0x8f8579,chalk:0xb9b7b2}[style];
  const mk=(c,vc)=>{const m=style==='toon'?new THREE.MeshToonMaterial({color:c,gradientMap:grad}):new THREE.MeshStandardMaterial({color:c,roughness:style==='chalk'?.95:.8});if(vc)m.vertexColors=true;return m};
  const under=mk(uc);under.side=THREE.DoubleSide;
  return {body:mk(col),joint:mk(jc),sel:mk(0xe2a46c),skin:mk(0xffffff,true),under,colBase:new THREE.Color(col)};
}
let mats=buildMats('clay');

/* ===================================================================== MANNEQUIN GEOMETRY */
function seg({rt=1,rb=1,p=2.5,up=false,bump=null,rotate=false}){
  const N=18,pts=[];
  for(let i=0;i<=N;i++){
    const t=i/N,e=Math.abs(2*t-1);
    let r=(rb+(rt-rb)*t)*Math.pow(Math.max(0,1-Math.pow(e,p)),1/p);
    if(bump)r*=1+bump.amt*Math.exp(-Math.pow((t-bump.at)/bump.w,2));
    pts.push(new THREE.Vector2(Math.max(r,1e-4),t));
  }
  const g=new THREE.LatheGeometry(pts,28);
  if(!up)g.translate(0,-1,0);
  if(rotate)g.rotateX(Math.PI/2);
  return g;
}
function eggGeo(){   // faceless head: egg with a narrower jaw
  const N=24,pts=[];
  for(let i=0;i<=N;i++){
    const t=i/N,e=2*t-1,r=Math.sqrt(Math.max(0,1-e*e))*lerp(.64,1,sstep(0,.62,t));
    pts.push(new THREE.Vector2(Math.max(r,1e-4),t));
  }
  return new THREE.LatheGeometry(pts,32);
}
const GEO={
  pelvis:seg({rt:1,rb:.92,p:2.3,up:true}),abdomen:seg({rt:1,rb:.95,p:2.4,up:true}),
  chest:seg({rt:1,rb:.78,p:2.4,up:true}),neck:seg({rt:.92,rb:1,p:2.6,up:true}),
  egg:eggGeo(),
  uarm:seg({rt:1,rb:.78,p:2.6,bump:{at:.6,amt:.08,w:.3}}),farm:seg({rt:1,rb:.62,p:2.6,bump:{at:.72,amt:.10,w:.28}}),
  palm:seg({rt:1,rb:.9,p:2.4}),f1:seg({rt:1,rb:.9,p:2.4}),f2:seg({rt:1,rb:.7,p:2.2}),thumb:seg({rt:1,rb:.8,p:2.3}),
  thigh:seg({rt:1,rb:.6,p:2.6,bump:{at:.68,amt:.06,w:.35}}),shin:seg({rt:.95,rb:.55,p:2.6,bump:{at:.72,amt:.12,w:.25}}),
  foot:seg({rt:.8,rb:1,p:2.2,up:true,rotate:true}),ball:new THREE.SphereGeometry(1,20,14)
};

/* ===================================================================== JOINTS (anatomical limits, shared by both modes)
   Figure faces +Z, up is +Y, the figure's LEFT is +X. Values are rotations about FIGURE axes, relative to a
   straight hanging pose, so the same numbers pose the mannequin and the human. */
const A=(key,label,axis,sign,min,max,lo,hi,def=0)=>({key,label,axis,sign,min,max,lo,hi,def});
const central=(label,short,b,t,u,lo='back',hi='forward')=>({label,short,order:'XZY',dof:[
  A('bend','Bend','x',1,b[0],b[1],lo,hi),A('tilt','Side tilt','z',-1,t[0],t[1],'right','left'),A('turn','Turn','y',1,u[0],u[1],'right','left')]});
const JD={
  head:central('Head','Head',[-40,40],[-30,30],[-50,50],'look up','look down'),
  neck:central('Neck','Neck',[-35,45],[-35,35],[-60,60]),
  chest:central('Chest / ribcage','Chest',[-20,30],[-20,20],[-40,40]),
  lumbar:central('Waist / lower back','Waist',[-30,45],[-30,30],[-35,35]),
  pelvis:central('Hips / pelvis','Hips',[-25,30],[-20,20],[-40,40])
};
for(const side of ['L','R']){
  const s=side==='L'?1:-1;
  const add=(base,label,order,dof)=>{JD[base+side]={label,side,s,order,dof}};
  add('clav','Shoulder blade','XYZ',[A('shrug','Shrug','z',s,-12,35,'down','up'),A('reach','Reach','y',-s,-20,25,'back','forward')]);
  add('shoulder','Shoulder','ZXY',[
    A('raise','Raise sideways','z',s,-10,175,'across','up',8),A('swing','Swing forward / back','x',-1,-60,175,'back','forward'),
    A('twist','Rotate arm','y',-s,-80,90,'palm fwd','palm back')]);
  add('elbow','Elbow','XYZ',[A('bend','Bend','x',-1,0,150,'straight','bent',6),A('twist','Forearm twist','y',-s,-80,80,'palm fwd','palm back')]);
  add('wrist','Wrist & hand','ZXY',[
    A('bend','Wrist bend','z',-s,-70,80,'back of hand','palm side'),A('tilt','Wrist tilt','x',-1,-35,20,'pinky side','thumb side'),
    A('curl','Finger curl','custom',0,0,100,'open','fist',18),A('thumb','Thumb tuck','custom',0,0,100,'out','in',10)]);
  add('hip','Hip','XZY',[
    A('swing','Leg forward / back','x',-1,-30,125,'back','forward'),A('out','Leg out / in','z',s,-25,50,'across','out'),
    A('twist','Rotate leg','y',-s,-45,35,'toes out','toes in')]);
  add('knee','Knee','XYZ',[A('bend','Bend','x',1,0,150,'straight','bent')]);
  add('ankle','Ankle','XZY',[
    A('flex','Toes up / down','x',-1,-50,25,'toes down','toes up'),A('roll','Sole tilt','z',-s,-15,30,'out','in'),
    A('twist','Toes in / out','y',-s,-25,25,'out','in')]);
}
const partner=k=>JD[k].side?k.slice(0,-1)+(JD[k].side==='L'?'R':'L'):null;
const dq={};for(const k in JD)dq[k]=new Q();

/* ===================================================================== BODY SLIDERS */
// Mannequin (procedural) sliders
const BODY=[
 ['Overall',[
  {k:'age',label:'Age',min:0,max:1,def:1,lo:'child',hi:'adult'},
  {k:'height',label:'Height',min:-1,max:1,def:0,lo:'shorter',hi:'taller'},
  {k:'weight',label:'Weight / softness',min:-1,max:1,def:0,lo:'lean',hi:'heavy'},
  {k:'muscle',label:'Muscle',min:0,max:1,def:.3,lo:'soft',hi:'ripped'},
  {k:'head',label:'Head size',min:-1,max:3,def:0,lo:'small',hi:'huge'},
  {k:'legs',label:'Leg length',min:-1,max:1,def:0,lo:'short',hi:'long'}]],
 ['Shape',[
  {k:'shoulders',label:'Shoulder width',min:-1,max:1,def:0,lo:'narrow',hi:'wide'},
  {k:'chest',label:'Ribcage size',min:-1,max:1,def:0,lo:'small',hi:'big'},
  {k:'waist',label:'Waist',min:-1,max:1,def:0,lo:'thin',hi:'thick'},
  {k:'hips',label:'Hips',min:-1,max:1,def:0,lo:'narrow',hi:'wide'},
  {k:'neck',label:'Neck length',min:-1,max:1,def:0,lo:'short',hi:'long'},
  {k:'arms',label:'Arm length',min:-1,max:1,def:0,lo:'short',hi:'long'},
  {k:'ext',label:'Hands & feet',min:-1,max:1,def:0,lo:'small',hi:'big'}]],
 ['Bust',[
  {k:'bust',label:'Bust size',min:0,max:1,def:0,lo:'none',hi:'large'},
  {k:'firm',label:'Bust firmness',min:0,max:1,def:.5,lo:'soft',hi:'firm'},
  {k:'bustY',label:'Bust height',min:-1,max:1,def:0,lo:'lower',hi:'higher'},
  {k:'bustX',label:'Bust spacing',min:-1,max:1,def:0,lo:'close',hi:'apart'},
  {k:'proj',label:'Bust projection',min:-1,max:1,def:0,lo:'flat',hi:'forward'}]]
];
const BODY_DEFS=Object.fromEntries(BODY.flatMap(([,l])=>l).map(d=>[d.k,d]));
const BODY_PRESETS={
  'Average':{},
  'Athletic':{height:.15,muscle:.75,weight:.05,shoulders:.45,chest:.35,waist:-.2,hips:-.15},
  'Curvy':{muscle:.1,weight:.25,shoulders:-.25,waist:-.45,hips:.55,bust:.55,firm:.55,height:-.05},
  'Slim':{muscle:.05,weight:-.6,shoulders:-.2,waist:-.2,bust:.2,height:.05},
  'Heroic':{height:.4,legs:.35,head:-.6,muscle:1,weight:.1,shoulders:.9,chest:.7,waist:-.5,hips:-.3,ext:.25},
  'Child':{age:0,muscle:0},
  'Cartoon':{head:2.4,legs:-.7,arms:-.35,ext:.7,weight:.1,height:-.1}
};

// Human (morph-target) sliders. neg/pos = candidate morph names or patterns; resolved against the loaded file.
const HSPEC=[
 {k:'sex',label:'Sex',min:-1,max:1,def:1,lo:'masculine',hi:'feminine',
  neg:['gender_male',/gender.*(?<!fe)male/i,/(^|[_.\-])male($|[_.\-])/i],pos:['gender_female',/gender.*female/i,/female/i]},
 {k:'age',label:'Age (adult only)',min:0,max:1,def:0,lo:'young adult',hi:'mature',pos:['age_old',/age.*old/i,/(^|[_.\-])old($|[_.\-])/i]},
 {k:'height',label:'Height',min:-1,max:1,def:0,lo:'shorter',hi:'taller',neg:['height_short',/height.*(short|min|low|decr)/i],pos:['height_tall',/height.*(tall|max|high|incr)/i]},
 {k:'weight',label:'Weight / softness',min:-1,max:1,def:0,lo:'lean',hi:'heavy',neg:['weight_min',/weight.*(min|low|thin|light)/i],pos:['weight_max',/weight.*(max|high|heavy)/i]},
 {k:'muscle',label:'Muscle',min:-1,max:1,def:0,lo:'soft',hi:'muscular',neg:['muscle_min',/muscle.*(min|low)/i],pos:['muscle_max',/muscle.*(max|high)/i]},
 {k:'prop',label:'Proportion balance',min:-1,max:1,def:0,lo:'unusual',hi:'ideal',neg:['proportions_uncommon',/proportion.*(uncommon|bad|odd)/i],pos:['proportions_ideal',/proportion.*(ideal|good)/i]},
 {k:'shoulders',label:'Shoulders',min:-1,max:1,def:0,lo:'narrow',hi:'wide',neg:[/shoulder.*(decr|min|narrow|small)/i],pos:[/shoulder.*(incr|max|wide|large)/i]},
 {k:'waist',label:'Waist',min:-1,max:1,def:0,lo:'thin',hi:'thick',neg:[/waist.*(decr|min|thin|small)/i],pos:[/waist.*(incr|max|thick|large)/i]},
 {k:'belly',label:'Belly',min:-1,max:1,def:0,lo:'flat',hi:'soft',neg:[/(stomach|belly|abdom).*(decr|min|flat)/i],pos:[/(stomach|belly|abdom).*(incr|max|large)/i]},
 {k:'hips',label:'Hips',min:-1,max:1,def:0,lo:'narrow',hi:'wide',neg:[/hip.*(decr|min|narrow|small)/i],pos:[/hip.*(incr|max|wide|large)/i]},
 {k:'glutes',label:'Glutes',min:-1,max:1,def:0,lo:'flat',hi:'round',neg:[/(butt|glute).*(decr|min|small|flat)/i],pos:[/(butt|glute).*(incr|max|large|round)/i]},
 {k:'thighs',label:'Thigh fullness',min:-1,max:1,def:0,lo:'slim',hi:'full',neg:[/(upperleg|thigh).*(decr|min|slim)/i],pos:[/(upperleg|thigh).*(incr|max|full)/i]},
 {k:'thighB',label:'Thigh back fullness',min:-1,max:1,def:0,lo:'slim',hi:'full'},
 {k:'calves',label:'Calf size',min:-1,max:1,def:0,lo:'slim',hi:'full',neg:[/(lowerleg|calf).*(decr|min|slim)/i],pos:[/(lowerleg|calf).*(incr|max|full)/i]},
 {k:'bust',label:'Bust size',min:-1,max:1,def:0,lo:'small',hi:'large',neg:['breast_cup_min',/breast.*cup.*(min|decr|small)/i],pos:['breast_cup_max',/breast.*cup.*(max|incr|large)/i]},
 {k:'firm',label:'Bust firmness',min:-1,max:1,def:0,lo:'soft',hi:'firm',neg:['breast_firm_min',/breast.*firm.*(min|decr|soft)/i],pos:['breast_firm_max',/breast.*firm.*(max|incr)/i]},
 {k:'bustY',label:'Bust height',min:-1,max:1,def:0,lo:'lower',hi:'higher',neg:['bdet_breast_height_decr',/breast.*height.*(decr|min|low)/i],pos:['bdet_breast_height_incr',/breast.*height.*(incr|max|high)/i]},
 {k:'bustX',label:'Bust spacing',min:-1,max:1,def:0,lo:'close',hi:'apart',neg:['bdet_breast_dist_decr',/breast.*dist.*(decr|min)/i],pos:['bdet_breast_dist_incr',/breast.*dist.*(incr|max)/i]},
 {k:'proj',label:'Bust projection',min:-1,max:1,def:0,lo:'flat',hi:'pointed',neg:['bdet_breast_point_decr',/breast.*point.*(decr|min)/i],pos:['bdet_breast_point_incr',/breast.*point.*(incr|max)/i]}
];
const HGROUPS=[['Overall',['sex','age','height','weight','muscle','prop']],['Torso & hips',['shoulders','waist','belly','hips','glutes','thighs','thighB','calves']],['Bust',['bust','firm','bustY','bustX','proj']]];
const HDEF=Object.fromEntries(HSPEC.map(s=>[s.k,s]));
const PROC={shoulders:1,waist:1,belly:1,hips:1,glutes:1,thighs:1,thighB:1,calves:1};
const HPRESETS={
  'Average':{},
  'Hourglass':{sex:1,muscle:.1,weight:.15,waist:-.7,hips:.7,glutes:.6,thighs:.35,bust:.55,firm:.4,shoulders:-.2},
  'Fitness':{sex:1,muscle:.5,weight:-.1,waist:-.35,hips:.15,glutes:.4,thighs:.2,bust:.25,firm:.8,shoulders:.2},
  'Slender':{sex:1,height:.3,weight:-.5,muscle:.05,waist:-.3,hips:.1,bust:.15,firm:.5,shoulders:-.1},
  'Curvy':{sex:1,weight:.4,muscle:.1,waist:-.4,hips:.6,glutes:.6,thighs:.5,belly:.2,bust:.6,firm:.3},
  'Athletic ♂':{sex:-1,muscle:.7,weight:.05,shoulders:.5,waist:-.2,hips:-.15,thighs:.2,calves:.2},
  'Bodybuilder':{sex:-1,muscle:1,weight:.3,shoulders:.8,waist:-.1,hips:-.1,thighs:.6,calves:.6}
};

/* ===================================================================== POSE PRESETS */


/* ===================================================================== FIGURE ROOTS */
const figure=new THREE.Group();scene.add(figure);
const mann=new THREE.Group();figure.add(mann);     // procedural mannequin
const hum=new THREE.Group();figure.add(hum);       // third-party human model

/* ===================================================================== MANNEQUIN */
const nodes={},jointPos={},parts=[],pickables=[];
function node(k,parent,pos){const g=new THREE.Group();g.name=k;parent.add(g);nodes[k]=g;jointPos[k]=pos;return g}
function part(jk,parent,kind,geo,fn){
  const m=new THREE.Mesh(geo,mats[kind]);
  m.castShadow=true;m.receiveShadow=true;m.userData={joint:jk,kind};
  parent.add(m);parts.push({m,fn});pickables.push(m);return m;
}
const pelvis=node('pelvis',mann,D=>[0,D.rootY,0]);
part('pelvis',pelvis,'body',GEO.pelvis,D=>({p:[0,-.10,0],s:[.155*D.pw,.20,.105*D.pd]}));
const lumbar=node('lumbar',pelvis,D=>[0,.09*D.tk,0]);
part('lumbar',lumbar,'body',GEO.abdomen,D=>({p:[0,-.05*D.tk,0],s:[.12*D.aw,.20*D.tk,.09*D.ad]}));
const chest=node('chest',lumbar,D=>[0,.15*D.tk,0]);
part('chest',chest,'body',GEO.chest,D=>({p:[0,-.04*D.tk,0],s:[.165*D.cw,.34*D.tk,.112*D.cd]}));
part('chest',chest,'body',GEO.ball,D=>({p:[0,.25*D.tk,0],s:[.2*D.sw,.05,.1*D.cd]}));
for(const sx of [1,-1]) part('chest',chest,'body',GEO.ball,D=>{
  const r=.026+.05*D.bust,sag=.035*D.bust*(1-D.firm);
  return {v:D.bust>.02,p:[sx*.072*D.cw*(1+.45*D.bustX),.185*D.tk+.035*D.bustY-sag,.078*D.cd],s:[r,r*(1-.1*(1-D.firm)),r*(.9+.35*D.proj)]};
});
const neck=node('neck',chest,D=>[0,.28*D.tk,0]);
part('neck',neck,'body',GEO.neck,D=>({p:[0,-.01,0],s:[.05*D.nw,.16*D.nk,.05*D.nw]}));
const head=node('head',neck,D=>[0,.13*D.nk,0]);
part('head',head,'body',GEO.egg,D=>({p:[0,-.06*D.hk,0],s:[.074*D.hk,.22*D.hk,.094*D.hk]}));   // no face, no ears
for(const side of ['L','R']){
  const s=side==='L'?1:-1,K=b=>b+side;
  const cl=node(K('clav'),chest,D=>[s*.035*D.cw,.26*D.tk,0]);
  const sh=node(K('shoulder'),cl,D=>[s*.155*D.sw,-.01,0]);
  part(K('shoulder'),sh,'joint',GEO.ball,D=>({p:[0,0,0],s:[.056*D.ug,.056*D.ug,.056*D.ug]}));
  part(K('shoulder'),sh,'body',GEO.uarm,D=>({p:[0,0,0],s:[.05*D.ug,.30*D.ak,.05*D.ug]}));
  const el=node(K('elbow'),sh,D=>[0,-.30*D.ak,0]);
  part(K('elbow'),el,'joint',GEO.ball,D=>({p:[0,0,0],s:[.041*D.fg,.041*D.fg,.041*D.fg]}));
  part(K('elbow'),el,'body',GEO.farm,D=>({p:[0,0,0],s:[.041*D.fg,.25*D.ak,.041*D.fg]}));
  const wr=node(K('wrist'),el,D=>[0,-.25*D.ak,0]);
  part(K('wrist'),wr,'joint',GEO.ball,D=>({p:[0,0,0],s:[.027*D.fg,.027*D.fg,.027*D.fg]}));
  part(K('wrist'),wr,'body',GEO.palm,D=>({p:[0,0,0],s:[.016*D.ext,.092*D.ext,.040*D.ext]}));
  const fa=node('fa'+side,wr,D=>[0,-.088*D.ext,0]);
  part(K('wrist'),fa,'body',GEO.f1,D=>({p:[0,0,0],s:[.0135*D.ext,.052*D.ext,.0385*D.ext]}));
  const fb=node('fb'+side,fa,D=>[0,-.05*D.ext,0]);
  part(K('wrist'),fb,'body',GEO.f2,D=>({p:[0,0,0],s:[.012*D.ext,.042*D.ext,.034*D.ext]}));
  const th=node('th'+side,wr,D=>[-s*.004,-.02*D.ext,.034*D.ext]);
  part(K('wrist'),th,'body',GEO.thumb,D=>({p:[0,0,0],s:[.012*D.ext,.062*D.ext,.012*D.ext]}));
  const hp=node(K('hip'),pelvis,D=>[s*D.hipX,0,0]);
  part(K('hip'),hp,'joint',GEO.ball,D=>({p:[0,0,0],s:[.078*D.tg,.078*D.tg,.078*D.tg]}));
  part(K('hip'),hp,'body',GEO.thigh,D=>({p:[0,0,0],s:[.087*D.tg,.43*D.lk,.087*D.tg]}));
  const kn=node(K('knee'),hp,D=>[0,-.43*D.lk,0]);
  part(K('knee'),kn,'joint',GEO.ball,D=>({p:[0,0,0],s:[.052*D.cg,.052*D.cg,.052*D.cg]}));
  part(K('knee'),kn,'body',GEO.shin,D=>({p:[0,0,0],s:[.054*D.cg,.42*D.lk,.054*D.cg]}));
  const an=node(K('ankle'),kn,D=>[0,-.42*D.lk,0]);
  part(K('ankle'),an,'joint',GEO.ball,D=>({p:[0,0,0],s:[.034*D.cg,.034*D.cg,.034*D.cg]}));
  part(K('ankle'),an,'body',GEO.foot,D=>({p:[0,-.04*D.e2,-.065*D.ext],s:[.045*D.ext,.04*D.e2,.265*D.ext]}));
}

/* ===================================================================== STATE */
let body={},hm={},hx={},pose={},D={};
const defaultBody=()=>Object.fromEntries(Object.values(BODY_DEFS).map(d=>[d.k,d.def]));
const defaultHm=()=>Object.fromEntries(HSPEC.map(s=>[s.k,s.def]));
const defaultPose=()=>Object.fromEntries(Object.entries(JD).map(([k,j])=>[k,Object.fromEntries(j.dof.map(d=>[d.key,d.def]))]));

function dims(b){
  const k=(v,a)=>1+v*a,d={},age=b.age;
  d.S=lerp(.6,1,age)*k(b.height,.12)*.948;
  d.hk=lerp(1.35,1,age)*k(b.head,.25);
  d.lk=lerp(.78,1,age)*k(b.legs,.12);
  d.tk=lerp(.9,1,age);
  d.nk=k(b.neck,.4)*lerp(.8,1,age);
  d.ak=lerp(.82,1,age)*k(b.arms,.12);
  d.ext=k(b.ext,.4)*lerp(1.1,1,age);
  d.e2=1+(d.ext-1)*.5;
  const w=b.weight,m=b.muscle*lerp(.35,1,age),lim=k(w,.3);
  d.ug=lim*k(m,.22);d.fg=lim*k(m,.1);d.tg=lim*k(m,.14)*k(b.hips,.08);d.cg=lim*k(m,.12);
  d.nw=k(w,.15)*k(m,.2);
  d.pw=k(w,.2)*k(b.hips,.22);d.pd=k(w,.28)*k(b.hips,.1);
  d.aw=k(w,.38)*k(b.waist,.28);d.ad=k(w,.5)*k(b.waist,.15);
  d.cw=k(w,.15)*k(m,.12)*k(b.chest,.2);d.cd=k(w,.2)*k(m,.08)*k(b.chest,.3);
  d.sw=k(b.shoulders,.25)*k(m,.06);
  d.hipX=.085*k(b.hips,.12)*k(w,.1);
  d.rootY=.08+.85*d.lk;
  d.totalH=d.rootY+.52*d.tk+.13*d.nk+.16*d.hk;
  Object.assign(d,{bust:b.bust*sstep(.75,.95,age),firm:b.firm,bustX:b.bustX,bustY:b.bustY,proj:b.proj});   // bust fades out toward child setting
  return d;
}
function layout(){
  D=dims(body);
  mann.scale.setScalar(D.S);
  for(const k in nodes)nodes[k].position.set(...jointPos[k](D));
  for(const {m,fn} of parts){const r=fn(D);m.position.set(...r.p);m.scale.set(...r.s);m.visible=r.v!==false}
}

/* ===================================================================== HUMAN MODEL STATE */
const HUM={ready:false,rigOK:false,loading:false,body:null,under:[],map:{},drv:[],names:[],res:{},corr:[],morphMeshes:[],
  egg:null,eggDirty:false,cut:null,sample:[],jointOfBone:[],headTip:new V3(),headInv:null,col:null,height:1.75,headH:.23,morphCount:0};

const RIGS={
 engine:{name:'game-engine rig',test:['thighl','upperarml','calfl'],
  pelvis:[['pelvis',1]],lumbar:[['spine01',1]],chest:[['spine02',.5],['spine03',.5]],neck:[['neck01',.5],['neck02',.5]],head:[['head',1]],
  clav:s=>[['clavicle'+s,1]],shoulder:s=>[['upperarm'+s,1]],elbow:s=>[['lowerarm'+s,1]],wrist:s=>[['hand'+s,1]],
  hip:s=>[['thigh'+s,1]],knee:s=>[['calf'+s,1]],ankle:s=>[['foot'+s,1]],
  finger:(f,i,s)=>`${f}0${i}${s}`},
 classic:{name:'MakeHuman default rig',test:['upperleg01l','upperarm01l'],
  pelvis:[['spine05',1]],lumbar:[['spine04',.5],['spine03',.5]],chest:[['spine02',.5],['spine01',.5]],neck:[['neck01',1],['neck02',1],['neck03',1]],head:[['head',1]],
  clav:s=>[['clavicle'+s,1]],shoulder:s=>[['upperarm01'+s,1]],elbow:s=>[['lowerarm01'+s,1]],wrist:s=>[['wrist'+s,1]],
  hip:s=>[['upperleg01'+s,1]],knee:s=>[['lowerleg01'+s,1]],ankle:s=>[['foot'+s,1]],
  finger:(f,i,s)=>'finger'+({thumb:1,index:2,middle:3,ring:4,pinky:5}[f])+i+s}
};
function buildMap(prof,swap,all){
  const sfx=s=>swap?(s==='l'?'r':'l'):s,map={swap};
  const find=list=>{const out=[];for(const [n,sh] of list){const b=all.get(n);if(b)out.push({bone:b,share:sh})}const t=out.reduce((a,e)=>a+e.share,0)||1;out.forEach(e=>e.share/=t);return out};
  for(const k of ['pelvis','lumbar','chest','neck','head'])map[k]=find(prof[k]);
  for(const S of ['L','R']){const s=sfx(S.toLowerCase());for(const k of ['clav','shoulder','elbow','wrist','hip','knee','ankle'])map[k+S]=find(prof[k](s))}
  return map;
}

/* ===================================================================== POSE -> ROTATIONS */
const QE=new THREE.Euler(),IDQ=new Q(),tq=new Q();
let EP=pose;
function jointQuat(key,P,out){
  const j=JD[key],p=P[key];let x=0,y=0,z=0;
  for(const d of j.dof){if(d.axis==='custom')continue;const a=d.sign*p[d.key]*DEG;if(d.axis==='x')x+=a;else if(d.axis==='y')y+=a;else z+=a}
  if(key.startsWith('clav')){const sp=P['shoulder'+j.side];z+=j.s*.18*Math.max(0,Math.max(sp.raise,sp.swing)-70)*DEG}
  return out.setFromEuler(QE.set(x,y,z,j.order));
}
/* reach cones: max angle from hanging, by direction (0 = forward, 90 = outward, 180 = backward, -90 = across the body) */
const SHK=[[-180,60],[-135,45],[-90,50],[-45,125],[0,175],[90,175],[135,100],[180,60]];
const HIPK=[[-180,30],[-135,20],[-90,25],[-45,100],[0,125],[45,110],[90,50],[135,40],[180,30]];
const CV=new V3(),CQ=new Q();
const knot=(K,x)=>{for(let i=1;i<K.length;i++)if(x<=K[i][0]){const a=K[i-1],b=K[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}return K[K.length-1][1]};
function coneOK(P,key,K){
  jointQuat(key,P,CQ);CV.set(0,-1,0).applyQuaternion(CQ);
  const th=Math.acos(clamp(-CV.y,-1,1))/DEG;if(th<1)return true;
  return th<=knot(K,Math.atan2(JD[key].s*CV.x,CV.z)/DEG)+.01;
}
function coneLimit(P,key,ka,kb,K){
  if(coneOK(P,key,K))return;
  const a=P[key][ka],b=P[key][kb];let lo=0,hi=1;
  for(let i=0;i<14;i++){const m=(lo+hi)/2;P[key][ka]=a*m;P[key][kb]=b*m;if(coneOK(P,key,K))lo=m;else hi=m}
  P[key][ka]=a*lo;P[key][kb]=b*lo;
}
function sumLim(P,list,key,lo,hi){
  const s=list.reduce((t,k)=>t+P[k][key],0),t=clamp(s,lo,hi);
  if(t!==s){const f=s!==0?t/s:0;for(const k of list)P[k][key]*=f}
}
const EPB={};
function effPose(){
  if(!opts.guard)return pose;
  const P=EPB;
  for(const k in pose){const a=P[k]||(P[k]={});for(const d in pose[k])a[d]=pose[k][d]}
  for(const S of ['L','R']){
    coneLimit(P,'shoulder'+S,'raise','swing',SHK);
    coneLimit(P,'hip'+S,'out','swing',HIPK);
    const h=P['hip'+S];h.swing=Math.min(h.swing,Math.min(125,85+1.2*P['knee'+S].bend));
    const w=P['wrist'+S],nb=w.bend/(w.bend>0?80:70),nt=w.tilt/(w.tilt>0?20:35),r=Math.hypot(nb,nt);
    if(r>1){w.bend/=r;w.tilt/=r}
  }
  for(const k of ['bend','turn','tilt']){
    const L={bend:[-35,75],turn:[-55,55],tilt:[-40,40]}[k],N={bend:[-60,75],turn:[-95,95],tilt:[-55,55]}[k];
    sumLim(P,['lumbar','chest'],k,L[0],L[1]);sumLim(P,['neck','head'],k,N[0],N[1]);
  }
  return P;
}
function computeDeltas(){const P=EP=effPose();for(const key in JD)jointQuat(key,P,dq[key])}
function applyMannPose(){
  for(const key in JD)nodes[key].quaternion.copy(dq[key]);
  for(const side of ['L','R']){
    const s=side==='L'?1:-1,p=EP['wrist'+side],c=p.curl/100,t=p.thumb/100;
    nodes['fa'+side].rotation.set(0,0,-s*c*80*DEG);
    nodes['fb'+side].rotation.set(0,0,-s*c*95*DEG);
    nodes['th'+side].rotation.set(-.35,0,-s*(t*55+c*20)*DEG,'ZXY');
  }
}
function applyHumanPose(){for(const d of HUM.drv)d.bone.quaternion.copy(d.rpInv).multiply(d.get()).multiply(d.ref)}
function applyPose(){
  computeDeltas();
  if(opts.mode==='man')applyMannPose();else if(HUM.rigOK)applyHumanPose();
  figure.updateMatrixWorld(true);
  if(opts.mode==='human'){HUM.dirtySkin=true;HUM.eggDirty=true}
}

/* ===================================================================== GROUND / SIZE */
const box=new THREE.Box3();
function settle(){
  figure.position.y=0;figure.updateMatrixWorld(true);
  if(!opts.ground)return;
  if(opts.mode==='man'){
    box.makeEmpty();mann.traverse(o=>{if(o.isMesh&&o.visible)box.expandByObject(o,true)});
    if(!box.isEmpty())figure.position.y=-box.min.y;
  }else if(HUM.ready&&HUM.bodyP){
    skinNow();
    const o=HUM.bodyP.out,e=hum.matrixWorld.elements;let mn=Infinity;
    for(let i=0;i<o.length;i+=3){const y=e[1]*o[i]+e[5]*o[i+1]+e[9]*o[i+2]+e[13];if(y<mn)mn=y}
    if(isFinite(mn))figure.position.y=-mn;
  }
  figure.updateMatrixWorld(true);
}
const curHeight=()=>opts.mode==='man'?D.totalH*D.S:HUM.height;
function updateHeads(){
  const el=$('#heads');
  if(opts.mode==='man')el.textContent=`≈ ${(D.totalH/(.22*D.hk)).toFixed(1)} heads tall · ${(D.totalH*D.S*100).toFixed(0)} cm`;
  else el.textContent=HUM.ready?`≈ ${(HUM.height/HUM.headH).toFixed(1)} heads tall · ${(HUM.height*100).toFixed(0)} cm`:'';
}
const guideGeo=new THREE.BufferGeometry();
guideGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(20*2*3),3));
const guides=new THREE.LineSegments(guideGeo,new THREE.LineBasicMaterial({color:0xd7bfa4,transparent:true,opacity:.5,depthTest:false}));
guides.renderOrder=5;guides.frustumCulled=false;scene.add(guides);
function updateGuides(){
  const unit=opts.mode==='man'?.22*D.hk*D.S:HUM.headH,a=guideGeo.attributes.position.array;
  const n=Math.min(19,Math.ceil(curHeight()/unit-.001)+1);
  for(let i=0;i<n;i++)a.set([-.75,i*unit,0,.75,i*unit,0],i*6);
  guideGeo.attributes.position.needsUpdate=true;guideGeo.setDrawRange(0,n*2);guides.visible=opts.ruler;
}
function applyAll(){
  if(opts.mode==='man')layout();else applyMorphs();
  applyPose();settle();updateHeads();updateGuides();
}

/* ===================================================================== HUMAN: load, CPU skinning, morphs, joint relocation */
const setStat=(t,err)=>{const e=$('#humStat');e.textContent=t;e.classList.toggle('err',!!err)};
HUM.parts=[];HUM.dirtySkin=true;HUM.eggDirty=false;HUM.want={};
function rebuildEgg(){HUM.eggDirty=false;if(HUM.ready)skinNow()}   // render loop hook: skins when the pose changed

async function loadHuman(src){
  if(HUM.loading)return;
  HUM.loading=true;setStat('Loading human model…');
  try{
    const loader=new GLTFLoader();let g1,g2=null;
    if(src&&src.file){g1=await new Promise((res,rej)=>src.file.arrayBuffer().then(b=>loader.parse(b,'',res,rej)))}
    else{
      const u=($('#humUrl').value||MODEL_BASE).trim(),direct=/\.(glb|gltf)(\?.*)?$/i.test(u),base=u.replace(/\/?$/,'/');
      g1=await loader.loadAsync(direct?u:base+MODEL_BODY);
      if(!direct){try{g2=await loader.loadAsync(base+MODEL_UNDER)}catch(e){console.warn('Underwear model not loaded',e)}}
    }
    setupHuman(g1,g2);
  }catch(err){console.error(err);setStat('Could not load the model: '+(err.message||err)+'. Check the console (F12), or use "Load .glb file…".',true)}
  HUM.loading=false;
}

/* ---- slider -> morph resolution ---- */
const OVR=(()=>{try{return JSON.parse(localStorage.getItem('form-hmap')||'{}')}catch(e){return {}}})();
const SUBJ={shoulders:/shoulder/,waist:/waist/,belly:/stomach|belly|abdom|pregnan/,hips:/(^|[^a-z])hips?([^a-z]|$)/,glutes:/butt|glute/,thighs:/upperleg|thigh/,calves:/lowerleg|calf|calves/};
const NEGW=new Set('decr decrease dec min minus small smaller thin narrow less slim down low lower neg flat short soft'.split(' '));
const POSW=new Set('incr increase inc max plus large larger big wide more full up high higher pos round tall heavy firm'.split(' '));
function fuzzy(k,names){
  const re=SUBJ[k];if(!re)return {neg:null,pos:null};
  const c=names.filter(n=>re.test(n.toLowerCase())&&!/breast|bdet/i.test(n)).map(n=>{
    const t=n.replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase().split(/[^a-z0-9]+/);
    return {n,neg:t.some(w=>NEGW.has(w)),pos:t.some(w=>POSW.has(w))};
  }).sort((a,b)=>a.n.length-b.n.length);
  const neg=c.find(x=>x.neg&&!x.pos),pos=c.find(x=>x.pos&&!x.neg);
  if(!neg&&!pos&&c.length===1)return {neg:null,pos:c[0].n};
  return {neg:neg?neg.n:null,pos:pos?pos.n:null};
}
function resolveSpec(s,names){
  const o=OVR[s.k];
  if(o)return {neg:names.includes(o.neg)?o.neg:null,pos:names.includes(o.pos)?o.pos:null};
  const pick=list=>{if(!list)return null;for(const c of list){if(typeof c==='string'){if(names.includes(c))return c}else{const f=names.find(n=>c.test(n));if(f)return f}}return null};
  const r={neg:pick(s.neg),pos:pick(s.pos)};
  return (r.neg||r.pos)?r:fuzzy(s.k,names);
}
function applyMorphs(){
  if(!HUM.ready)return;
  const want={},proc={};
  for(const s of HSPEC){
    const r=HUM.res[s.k]||{},v=hm[s.k];
    if(v<0&&r.neg)want[r.neg]=Math.max(want[r.neg]||0,-v);
    else if(v>0&&r.pos)want[r.pos]=Math.max(want[r.pos]||0,v);
    else if(v&&PROC[s.k])proc[s.k]=v;
  }
  for(const n in hx)if(hx[n]>0&&!BAD.test(n))want[n]=Math.max(want[n]||0,hx[n]);
  HUM.want=want;HUM.proc=proc;buildRest();
}
function mkPart(sm,mapB,qs){
  const g=sm.geometry,pa=g.attributes.position,n=pa.count,PT={n,sm};
  if(!g.index)throw new Error('mesh has no index buffer');
  PT.base=new Float32Array(n*3);for(let i=0;i<n;i++){PT.base[i*3]=pa.getX(i);PT.base[i*3+1]=pa.getY(i);PT.base[i*3+2]=pa.getZ(i)}
  PT.acc=new Float32Array(n*3);PT.rest=new Float32Array(n*3);PT.out=new Float32Array(n*3);PT.nrm=new Float32Array(n*3);PT.col=new Float32Array(n*3);
  PT.bind=sm.bindMatrix.clone();PT.bh=new Float32Array(n*3);
  const e=PT.bind.elements,b=PT.base,h=PT.bh;
  for(let i=0;i<n;i++){const x=b[i*3],y=b[i*3+1],z=b[i*3+2];
    h[i*3]=e[0]*x+e[4]*y+e[8]*z+e[12];h[i*3+1]=e[1]*x+e[5]*y+e[9]*z+e[13];h[i*3+2]=e[2]*x+e[6]*y+e[10]*z+e[14]}
  const si=g.attributes.skinIndex,sw=g.attributes.skinWeight,sb=sm.skeleton.bones;
  PT.idx=new Uint16Array(n*4);PT.wt=new Float32Array(n*4);
  for(let i=0;i<n;i++){
    let t=0;for(let q=0;q<4;q++)t+=sw.getComponent(i,q);
    for(let q=0;q<4;q++){const w=sw.getComponent(i,q);PT.idx[i*4+q]=mapB(sb[si.getComponent(i,q)])??0;PT.wt[i*4+q]=t>0?w/t:(q?0:1)}
  }
  PT.index=new g.index.array.constructor(g.index.array);
  PT.dict=sm.morphTargetDictionary||{};PT.mtA=g.morphAttributes.position||[];PT.rel=!!g.morphTargetsRelative;PT.mc={};
  // weld duplicate vertices (UV seams) so smoothing and normals do not crack along seams
  const mp=new Map(),canon=new Uint32Array(n),first=[];
  for(let i=0;i<n;i++){
    const k=Math.round(h[i*3]*qs)+','+Math.round(h[i*3+1]*qs)+','+Math.round(h[i*3+2]*qs);
    let c=mp.get(k);if(c===undefined){c=first.length;mp.set(k,c);first.push(i)}canon[i]=c;
  }
  const nc=first.length,sets=Array.from({length:nc},()=>new Set()),ix=PT.index;
  for(let t=0;t<ix.length;t+=3){
    const a=canon[ix[t]],b2=canon[ix[t+1]],c2=canon[ix[t+2]];
    sets[a].add(b2);sets[a].add(c2);sets[b2].add(a);sets[b2].add(c2);sets[c2].add(a);sets[c2].add(b2);
  }
  const st=new Uint32Array(nc+1);for(let c=0;c<nc;c++)st[c+1]=st[c]+sets[c].size;
  const adj=new Uint32Array(st[nc]);for(let c=0;c<nc;c++){let k=st[c];for(const v of sets[c])adj[k++]=v}
  Object.assign(PT,{canon,first:Uint32Array.from(first),nc,st,adj,C:new Float32Array(nc*3),tmp:new Float32Array(nc*3),fac:new Float32Array(nc),
    all:Uint32Array.from({length:nc},(_,i)=>i),rm:new Float32Array(nc)});
  for(let c=0;c<nc;c++){const v=PT.first[c];let mx=0;for(let q=0;q<4;q++)mx=Math.max(mx,PT.wt[v*4+q]);PT.rm[c]=sstep(.03,.5,1-mx)}   // how blended a vertex is between bones
  return PT;
}
function outMesh(PT,mat){
  const g=new THREE.BufferGeometry(),DU=THREE.DynamicDrawUsage;
  g.setAttribute('position',new THREE.BufferAttribute(PT.out,3).setUsage(DU));
  g.setAttribute('normal',new THREE.BufferAttribute(PT.nrm,3).setUsage(DU));
  g.setAttribute('color',new THREE.BufferAttribute(PT.col,3));
  g.setAttribute('skinIndex',new THREE.BufferAttribute(PT.idx,4));   // only used for click-picking
  g.setAttribute('skinWeight',new THREE.BufferAttribute(PT.wt,4));
  g.setIndex(new THREE.BufferAttribute(PT.index,1));
  g.boundingSphere=new THREE.Sphere(new V3(),1e5);
  const m=new THREE.Mesh(g,mat);m.frustumCulled=false;m.castShadow=true;m.receiveShadow=true;m.userData.PT=PT;PT.mesh=m;hum.add(m);
  return m;
}
function getMT(PT,name){
  if(name in PT.mc)return PT.mc[name];
  const i=PT.dict[name],a=PT.mtA[i];let d=null;
  if(i!==undefined&&a){
    d=new Float32Array(PT.n*3);
    for(let k=0;k<PT.n;k++){
      let x=a.getX(k),y=a.getY(k),z=a.getZ(k);
      if(!PT.rel){x-=PT.base[k*3];y-=PT.base[k*3+1];z-=PT.base[k*3+2]}
      d[k*3]=x;d[k*3+1]=y;d[k*3+2]=z;
    }
  }
  return PT.mc[name]=d;
}
function restPart(PT,want){
  const a=PT.acc;a.set(PT.base);
  const add=(mn,w)=>{const d=getMT(PT,mn);if(!d)return;for(let i=0;i<a.length;i++)a[i]+=w*d[i]};
  for(const n in want)if(want[n]>0)add(n,want[n]);
  for(const c of HUM.corr){const w=(want[c.a]||0)*(want[c.b]||0);if(w>1e-4)add(c.name,w)}   // corrective morphs: A x B
  const e=PT.bind.elements,r=PT.rest;
  for(let i=0;i<PT.n;i++){const x=a[i*3],y=a[i*3+1],z=a[i*3+2];
    r[i*3]=e[0]*x+e[4]*y+e[8]*z+e[12];r[i*3+1]=e[1]*x+e[5]*y+e[9]*z+e[13];r[i*3+2]=e[2]*x+e[6]*y+e[10]*z+e[14]}
}
/* Taubin smoothing on welded vertices (shrink-free). list = canonical ids to move; others act as anchors. */
function smoothC(PT,C,list,mask,iters,lam,mu){
  const st=PT.st,adj=PT.adj,T=PT.tmp;
  for(let it=0;it<iters*2;it++){
    const f=it%2?mu:lam;
    for(let li=0;li<list.length;li++){
      const c=list[li],s0=st[c],s1=st[c+1],c3=c*3;
      if(s1===s0){T[c3]=C[c3];T[c3+1]=C[c3+1];T[c3+2]=C[c3+2];continue}
      let x=0,y=0,z=0;for(let k=s0;k<s1;k++){const q=adj[k]*3;x+=C[q];y+=C[q+1];z+=C[q+2]}
      const m=s1-s0,w=f*mask[c];
      T[c3]=C[c3]+w*(x/m-C[c3]);T[c3+1]=C[c3+1]+w*(y/m-C[c3+1]);T[c3+2]=C[c3+2]+w*(z/m-C[c3+2]);
    }
    for(let li=0;li<list.length;li++){const c3=list[li]*3;C[c3]=T[c3];C[c3+1]=T[c3+1];C[c3+2]=T[c3+2]}
  }
}
function faceSmooth(PT){
  const L=PT.hlist;if(!L||!L.length)return;
  const r=PT.rest,C=PT.C;
  for(let c=0;c<PT.nc;c++){const i=PT.first[c]*3;C[c*3]=r[i];C[c*3+1]=r[i+1];C[c*3+2]=r[i+2]}
  smoothC(PT,C,L,PT.hmask,40,.55,-.58);   // 40 = how flat the face gets
  for(let v=0;v<PT.n;v++){const c=PT.canon[v];if(PT.hmask[c]>0){r[v*3]=C[c*3];r[v*3+1]=C[c*3+1];r[v*3+2]=C[c*3+2]}}
}
function relaxPart(PT,s){
  if(s<.01)return;
  const o=PT.out,C=PT.C,f=PT.fac;
  for(let c=0;c<PT.nc;c++){const i=PT.first[c]*3,c3=c*3;C[c3]=o[i];C[c3+1]=o[i+1];C[c3+2]=o[i+2];f[c]=s*(.2+.8*PT.rm[c])}
  smoothC(PT,C,PT.all,f,2,.5,-.53);
  for(let v=0;v<PT.n;v++){const c3=PT.canon[v]*3;o[v*3]=C[c3];o[v*3+1]=C[c3+1];o[v*3+2]=C[c3+2]}
}
function calcNormals(PT){
  const o=PT.out,ix=PT.index,cv=PT.canon,A=PT.tmp,N=PT.nrm;A.fill(0);
  for(let t=0;t<ix.length;t+=3){
    const v0=ix[t],v1=ix[t+1],v2=ix[t+2],i0=v0*3,i1=v1*3,i2=v2*3;
    const ax=o[i1]-o[i0],ay=o[i1+1]-o[i0+1],az=o[i1+2]-o[i0+2],bx=o[i2]-o[i0],by=o[i2+1]-o[i0+1],bz=o[i2+2]-o[i0+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    let c=cv[v0]*3;A[c]+=nx;A[c+1]+=ny;A[c+2]+=nz;
    c=cv[v1]*3;A[c]+=nx;A[c+1]+=ny;A[c+2]+=nz;
    c=cv[v2]*3;A[c]+=nx;A[c+1]+=ny;A[c+2]+=nz;
  }
  for(let v=0;v<PT.n;v++){const c=cv[v]*3,l=Math.hypot(A[c],A[c+1],A[c+2])||1;N[v*3]=A[c]/l;N[v*3+1]=A[c+1]/l;N[v*3+2]=A[c+2]/l}
}

/* ---- morph -> new rest shape, joints follow the morph, face smoothed ---- */
function buildRest(){
  const bp=HUM.bodyP;if(!bp)return;
  for(const PT of HUM.parts)restPart(PT,HUM.want);
  procApply();
  const B=HUM.B,Wn=HUM.Wn,Bi=HUM.Bi,r=bp.rest,bh=bp.bh;
  B.forEach((b,i)=>{
    const sl=HUM.bsel[i];let x=0,y=0,z=0;
    for(let k=0;k<sl.length;k++){const v=sl[k]*3;x+=r[v]-bh[v];y+=r[v+1]-bh[v+1];z+=r[v+2]-bh[v+2]}
    const k=1/sl.length;if(HUM.bsym[i])x=0;
    Wn[i].copy(HUM.W0[i]);const e=Wn[i].elements;e[12]+=x*k;e[13]+=y*k;e[14]+=z*k;
    Bi[i].copy(Wn[i]).invert();
  });
  B.forEach((b,i)=>{const pi=HUM.hb.get(b.parent),inv=pi!==undefined?Bi[pi]:HUM.pinv[i];b.position.setFromMatrixPosition(Wn[i]).applyMatrix4(inv)});
  faceSmooth(bp);
  let mn=1e9,mx=-1e9,hmn=1e9;
  for(let i=0;i<bp.n;i++){const y=r[i*3+1];if(y<mn)mn=y;if(y>mx)mx=y;if(bp.hmask[bp.canon[i]]>.5&&y<hmn)hmn=y}
  const sc=hum.scale.x;HUM.height=(mx-mn)*sc;HUM.headH=Math.max(.05,(mx-hmn)*sc);
  HUM.dirtySkin=true;HUM.eggDirty=true;
}
function skinNow(){
  if(!HUM.ready||!HUM.dirtySkin)return;
  HUM.dirtySkin=false;
  const Hi=new THREE.Matrix4().copy(hum.matrixWorld).invert(),T=new THREE.Matrix4();
  const ME=HUM.B.map((b,i)=>T.multiplyMatrices(Hi,b.matrixWorld).multiply(HUM.Bi[i]).elements.slice());
  for(const PT of HUM.parts){
    const r=PT.rest,o=PT.out,ix=PT.idx,wt=PT.wt;
    for(let v=0,n=PT.n;v<n;v++){
      const x=r[v*3],y=r[v*3+1],z=r[v*3+2];let X=0,Y=0,Z=0;
      for(let q=0;q<4;q++){
        const w=wt[v*4+q];if(w===0)continue;const e=ME[ix[v*4+q]];
        X+=w*(e[0]*x+e[4]*y+e[8]*z+e[12]);Y+=w*(e[1]*x+e[5]*y+e[9]*z+e[13]);Z+=w*(e[2]*x+e[6]*y+e[10]*z+e[14]);
      }
      o[v*3]=X;o[v*3+1]=Y;o[v*3+2]=Z;
    }
    if(PT===HUM.bodyP)relaxPart(PT,opts.relax??.4);
    calcNormals(PT);
    const g=PT.mesh.geometry;g.attributes.position.needsUpdate=true;g.attributes.normal.needsUpdate=true;
  }
}

/* ---- setup after loading the files ---- */
function setupHuman(g1,g2){
  hum.clear();
  Object.assign(HUM,{ready:false,rigOK:false,drv:[],map:{},under:[],parts:[],body:null,bodyP:null,egg:null,dirtySkin:true});
  figure.position.set(0,0,0);hum.rotation.set(0,0,0);hum.scale.setScalar(1);
  const root=g1.scene,skinned=[];root.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o)});
  if(!skinned.length)throw new Error('no skinned mesh found in the file');
  skinned.sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count);
  const bm=skinned[0];
  root.traverse(o=>{if(o.isMesh)o.visible=false});   // originals (eyes, brows, hair, teeth...) stay hidden; we draw our own skinned copies
  hum.add(root);hum.updateMatrixWorld(true);

  const boneList=[],all=new Map();root.traverse(o=>{if(o.isBone){boneList.push(o);all.set(nm(o),o)}});
  const hbIdx=new Map(boneList.map((b,i)=>[b,i]));
  HUM.B=boneList;HUM.hb=hbIdx;
  HUM.W0=boneList.map(b=>b.matrixWorld.clone());
  HUM.Wn=HUM.W0.map(m=>m.clone());HUM.Bi=HUM.W0.map(m=>m.clone().invert());
  HUM.pinv=boneList.map(b=>hbIdx.has(b.parent)?null:b.parent.matrixWorld.clone().invert());

  bm.geometry.computeBoundingBox();
  const bb=bm.geometry.boundingBox.clone().applyMatrix4(bm.bindMatrix),modelH=bb.max.y-bb.min.y;
  hum.scale.setScalar(1.75/modelH);
  figure.updateMatrixWorld(true);

  const prof=Object.values(RIGS).find(r=>r.test.every(t=>all.has(t)));
  let map={},ok=false,missing=[];
  if(prof){
    map=buildMap(prof,false,all);
    const ft=map.ankleL[0]&&map.ankleL[0].bone,toe=ft&&ft.children.find(c=>c.isBone);
    if(toe){const a=ft.getWorldPosition(new V3()),b=toe.getWorldPosition(new V3());if(b.z<a.z-1e-4){hum.rotation.y=Math.PI;figure.updateMatrixWorld(true)}}
    const cl=map.clavL[0]&&map.clavL[0].bone,cr=map.clavR[0]&&map.clavR[0].bone;
    if(cl&&cr&&cl.getWorldPosition(new V3()).x<cr.getWorldPosition(new V3()).x)map=buildMap(prof,true,all);
    missing=Object.keys(JD).filter(k=>!map[k]||!map[k].length);ok=!missing.length;
  }
  HUM.map=map;

  // parts
  const qs=1e4*1.75/modelH;
  const bp=HUM.bodyP=mkPart(bm,b=>hbIdx.get(b),qs);HUM.parts.push(bp);
  HUM.body=outMesh(bp,mats.skin);
  {const h=bp.bh,n=bp.n;let y0=1e9,y1=-1e9;
   for(let i=0;i<n;i++){const y=h[i*3+1];if(y<y0)y0=y;if(y>y1)y1=y}
   const H=y1-y0,mean=(a,b,k)=>{let s=0,c=0;for(let i=0;i<n;i++){const t=(h[i*3+1]-y0)/H,ax=Math.abs(h[i*3])/H;if(t>=a&&t<=b&&ax<.14){s+=k?ax*H:h[i*3+2];c++}}return c?s/c:0};
   HUM.dim={y0,H,fs:Math.abs(hum.rotation.y)>1?-1:1,cz:mean(.5,.6,0),tx:mean(.3,.44,1),tx2:mean(.12,.26,1)};}
  const headBone=ok?map.head[0].bone:all.get('head');
  const isHead=boneList.map(b=>{for(let o=b;o;o=o.parent)if(o===headBone)return true;return false});
  bp.hmask=new Float32Array(bp.nc);const hl=[];
  for(let c=0;c<bp.nc;c++){const v=bp.first[c];let hw=0;for(let q=0;q<4;q++)if(isHead[bp.idx[v*4+q]])hw+=bp.wt[v*4+q];bp.hmask[c]=sstep(.5,.95,hw);if(bp.hmask[c]>.01)hl.push(c)}
  bp.hlist=Uint32Array.from(hl);
  if(g2){
    const us=[];g2.scene.traverse(o=>{if(o.isSkinnedMesh)us.push(o)});
    for(const sm of us){
      try{const PT=mkPart(sm,b=>{const t=all.get(nm(b));return t?hbIdx.get(t):0},qs);HUM.parts.push(PT);const m=outMesh(PT,mats.under);m.visible=opts.under;HUM.under.push(m)}
      catch(e){console.warn('underwear mesh skipped',e)}
    }
  }
  // which vertices define where each joint sits after a morph (nearest surface points)
  const K=36,n=bp.n,bhp=bp.bh;
  HUM.bsel=boneList.map((b,i)=>{
    const e=HUM.W0[i].elements,px=e[12],py=e[13],pz=e[14],bi=new Uint32Array(K),bd=new Float32Array(K).fill(Infinity);
    for(let v=0;v<n;v++){
      const dx=bhp[v*3]-px,dy=bhp[v*3+1]-py,dz=bhp[v*3+2]-pz,d=dx*dx+dy*dy+dz*dz;
      if(d<bd[K-1]){let j=K-1;while(j>0&&bd[j-1]>d){bd[j]=bd[j-1];bi[j]=bi[j-1];j--}bd[j]=d;bi[j]=v}
    }
    return bi;
  });
  HUM.bsym=HUM.W0.map(m=>Math.abs(m.elements[12])<.012*modelH);
  if(headBone){const w=headBone.getWorldPosition(new V3());w.y+=.11;HUM.headTip=headBone.worldToLocal(w)}

  // rig drivers (same pose system as the mannequin)
  const jb=new Map();
  if(ok){
    const Wq=new Map();boneList.forEach(b=>Wq.set(b,b.getWorldQuaternion(new Q())));
    const P=b=>b.getWorldPosition(new V3());
    const dirOf=b=>{
      const kids=b.children.filter(c=>c.isBone);if(!kids.length)return null;
      const mid=kids.find(k=>/^(middle|finger3)/.test(nm(k))),p=P(b);let d;
      if(mid)d=P(mid).sub(p);else{d=new V3();kids.forEach(k=>d.add(P(k)));d.divideScalar(kids.length).sub(p)}
      return d.lengthSq()>1e-14?d.normalize():null;
    };
    const hang=new Map(),DOWN=new V3(0,-1,0);
    for(const S of ['L','R']){
      for(const k of ['shoulder','elbow','wrist','hip','knee']){const b=map[k+S][0].bone,d=dirOf(b);if(d)hang.set(b,new Q().setFromUnitVectors(d,DOWN))}
      hang.set(map['ankle'+S][0].bone,new Q());
    }
    const Hm=new Map(),ID=new Q();
    const H=b=>{if(Hm.has(b))return Hm.get(b);const q=hang.has(b)?hang.get(b):(b.parent&&b.parent.isBone?H(b.parent):ID);Hm.set(b,q);return q};
    const ref=b=>new Q().copy(H(b)).multiply(Wq.get(b));
    const refP=b=>b.parent?(b.parent.isBone?ref(b.parent):b.parent.getWorldQuaternion(new Q())):new Q();
    const add=(bone,get)=>HUM.drv.push({bone,rpInv:refP(bone).invert(),ref:ref(bone),get});
    for(const k in map){if(k==='swap')continue;for(const {bone,share} of map[k]){const jk=k,sh=share;add(bone,sh>.999?()=>dq[jk]:()=>tq.slerpQuaternions(IDQ,dq[jk],sh))}}
    for(const d of HUM.drv)d.bone.quaternion.copy(d.rpInv).multiply(d.ref);
    figure.updateMatrixWorld(true);
    const sx=S=>{const l=S.toLowerCase();return map.swap?(l==='l'?'r':'l'):l};
    const FN=['thumb','index','middle','ring','pinky'],ANG={thumb:[20,40,45],index:[75,85,60],middle:[75,85,60],ring:[75,85,60],pinky:[75,85,60]};
    for(const S of ['L','R']){
      const fb=(f,i)=>all.get(prof.finger(f,i,sx(S)));
      const i1=fb('index',1),p1=fb('pinky',1),m1=fb('middle',1),m2=fb('middle',2);
      if(!(i1&&p1&&m1&&m2))continue;
      const lat=P(i1).sub(P(p1)).normalize(),dm=P(m2).sub(P(m1)).normalize();
      const nP=new V3().crossVectors(dm,lat).multiplyScalar(S==='L'?1:-1).normalize();
      for(const f of FN){
        const b1=fb(f,1),b2=fb(f,2);if(!b1||!b2)continue;
        const df=P(b2).sub(P(b1)).normalize(),ax=new V3().crossVectors(df,nP);
        if(ax.lengthSq()<1e-6)continue;ax.normalize();
        const tax=f==='thumb'?new V3().crossVectors(df,lat.clone().negate()).normalize():null;
        for(let i=1;i<=3;i++){
          const b=fb(f,i);if(!b)continue;
          const ang=ANG[f][i-1],tk=(f==='thumb'&&i<3)?(i===1?45:20):0,q=new Q(),q2=new Q(),side=S;
          add(b,()=>{const p=EP['wrist'+side];q.setFromAxisAngle(ax,p.curl/100*ang*DEG);if(tk){q2.setFromAxisAngle(tax,p.thumb/100*tk*DEG);q.premultiply(q2)}return q});
        }
      }
    }
    for(const k in map){if(k==='swap')continue;for(const {bone} of map[k])jb.set(bone,k)}
    HUM.rigOK=true;
  }
  HUM.jointOfBone=boneList.map(b=>{for(let o=b;o;o=o.parent){const j=jb.get(o);if(j)return j}return 'pelvis'});

  // morphs
  const dict=bm.morphTargetDictionary||{},allNames=Object.keys(dict);
  HUM.names=allNames.filter(n=>!BAD.test(n)&&!/^corr_/i.test(n));
  HUM.morphCount=allNames.length;
  HUM.res={};for(const s of HSPEC)HUM.res[s.k]=resolveSpec(s,HUM.names);
  HUM.corr=[];for(const nme of allNames){const m=nme.match(/^corr_(.+?)__(.+)$/i);if(m)HUM.corr.push({name:nme,a:m[1],b:m[2]})}
  console.log('[FORM] rig:',prof?prof.name:'UNRECOGNISED','| missing joints:',missing,'| bones:',boneList.map(b=>b.name));
  console.log('[FORM] morph targets:',allNames);
  console.log('[FORM] slider -> morph:',Object.fromEntries(Object.entries(HUM.res).map(([k,r])=>[k,`${r.neg||'-'} / ${r.pos||'-'}`])));

  HUM.ready=true;
  {const sh=hm,sx=hx;hm=defaultHm();hx={};hum.scale.setScalar(1);applyMorphs();
   hum.scale.setScalar(1.65/HUM.height);hm=sh;hx=sx}
  const found=Object.values(HUM.res).filter(r=>r.neg||r.pos).length;
  setStat(ok?`Ready · ${prof.name} · ${found}/${HSPEC.length} sliders matched · ${HUM.morphCount} morphs · ${bp.n} vertices`
            :`Model loaded, but its skeleton was not recognised${missing.length?' (missing: '+missing.join(', ')+')':''}, so posing is disabled. See the console (F12).`,!ok);
  updateHumanUI();renderMorphList();renderMapping();
  refreshMats();applyAll();
  if(opts.mode==='human')frame();
}

/* ===================================================================== SELECTION / PICKING */
let sel='head';
function paintHuman(){
  const PT=HUM.bodyP;if(!PT)return;
  const c=PT.col,base=mats.colBase,hl=mats.sel.color,jb=HUM.jointOfBone,on=opts.highlight&&HUM.rigOK;
  for(let v=0;v<PT.n;v++){
    let h=0;
    if(on)for(let q=0;q<4;q++){const w=PT.wt[v*4+q];if(w&&jb[PT.idx[v*4+q]]===sel)h+=w}
    h=Math.min(1,h);
    c[v*3]=lerp(base.r,hl.r,h);c[v*3+1]=lerp(base.g,hl.g,h);c[v*3+2]=lerp(base.b,hl.b,h);
  }
  HUM.body.geometry.attributes.color.needsUpdate=true;
}
function refreshMats(){
  for(const {m} of parts)m.material=(opts.highlight&&m.userData.joint===sel)?mats.sel:mats[m.userData.kind];
  if(HUM.body){HUM.body.material=mats.skin;HUM.under.forEach(m=>m.material=mats.under);paintHuman()}
}
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
const setRay=e=>{const r=dom.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(ndc,camera)};
const rigReady=()=>opts.mode==='man'||(HUM.ready&&HUM.rigOK);

/* ===================================================================== IK (drag handles) */
const jpos=k=>opts.mode==='man'?nodes[k].getWorldPosition(new V3()):HUM.map[k][0].bone.getWorldPosition(new V3());
function effHead(){
  if(opts.mode==='man')return nodes.head.localToWorld(new V3(0,.07*D.hk,0));
  return HUM.map.head[0].bone.localToWorld(HUM.headTip.clone());
}
const IKD={};
const defIK=(id,joint,eff,chain)=>{IKD[id]={id,joint,eff,chain}};
defIK('head','head',effHead,[['head'],['neck'],['chest'],['lumbar']]);
defIK('chest','chest',()=>jpos('neck'),[['chest'],['lumbar']]);
for(const S of ['L','R']){
  defIK('shoulder'+S,'shoulder'+S,()=>jpos('shoulder'+S),[['clav'+S]]);
  defIK('elbow'+S,'elbow'+S,()=>jpos('elbow'+S),[['clav'+S],['shoulder'+S]]);
  defIK('wrist'+S,'wrist'+S,()=>jpos('wrist'+S),[['clav'+S],['shoulder'+S],['elbow'+S,['bend']]]);
  defIK('knee'+S,'knee'+S,()=>jpos('knee'+S),[['hip'+S]]);
  defIK('ankle'+S,'ankle'+S,()=>jpos('ankle'+S),[['hip'+S],['knee'+S,['bend']]]);
}
const IKW={shrug:.3,reach:.3,twist:.2,turn:.5,tilt:.8};
function ikSolve(def,target){
  const vars=[];
  for(const [j,keys] of def.chain)for(const d of JD[j].dof){
    if(d.axis==='custom'||(keys&&!keys.includes(d.key)))continue;
    vars.push({j,d,w:IKW[d.key]??1});
  }
  const S=Math.max(.3,curHeight()/1.7),lam=.09*S,h=2*DEG;
  for(let it=0;it<8;it++){
    applyPose();
    const p=def.eff(),e=target.clone().sub(p);
    if(e.length()<.0015*S)break;
    if(e.length()>.25*S)e.setLength(.25*S);
    const J=vars.map(v=>{
      const o=pose[v.j][v.d.key],dir=(o+h/DEG>v.d.max)?-1:1;
      pose[v.j][v.d.key]=o+dir*h/DEG;applyPose();
      const q=def.eff().sub(p).multiplyScalar(dir/h);
      pose[v.j][v.d.key]=o;return q;
    });
    const frozen=new Set();let dth=[];
    for(let pass=0;pass<2;pass++){
      let m00=lam*lam,m11=m00,m22=m00,m01=0,m02=0,m12=0;
      vars.forEach((v,i)=>{if(frozen.has(i))return;const w2=v.w*v.w,c=J[i];
        m00+=w2*c.x*c.x;m01+=w2*c.x*c.y;m02+=w2*c.x*c.z;m11+=w2*c.y*c.y;m12+=w2*c.y*c.z;m22+=w2*c.z*c.z});
      const M=new THREE.Matrix3().set(m00,m01,m02,m01,m11,m12,m02,m12,m22).invert();
      const y=e.clone().applyMatrix3(M);
      dth=vars.map((v,i)=>frozen.has(i)?0:v.w*v.w*J[i].dot(y));
      let sat=false;
      vars.forEach((v,i)=>{if(frozen.has(i))return;const t=pose[v.j][v.d.key]+dth[i]/DEG;if(t>v.d.max||t<v.d.min){frozen.add(i);sat=true}});
      if(!sat)break;
    }
    vars.forEach((v,i)=>{const o=pose[v.j][v.d.key];pose[v.j][v.d.key]=clamp(o+clamp(dth[i]/DEG,-12,12),v.d.min,v.d.max)});
  }
  applyPose();
  if(opts.mirror)for(const [j] of def.chain){const o=partner(j);if(o)Object.assign(pose[o],pose[j])}
}

const hGeo=new THREE.SphereGeometry(1,16,12);
const hMat=c=>new THREE.MeshBasicMaterial({color:c,depthTest:false,transparent:true,opacity:.88});
const hMats={idle:hMat(0xf0e6d8),sel:hMat(0xe2a46c),hot:hMat(0xffffff)};
const handles=Object.values(IKD).map(def=>{
  const m=new THREE.Mesh(hGeo,hMats.idle);m.renderOrder=20;m.userData={id:def.id,joint:def.joint};scene.add(m);return m;
});
let drag=null,shotting=false;
function updateHandles(){
  const show=opts.handles&&rigReady()&&!shotting;
  for(const m of handles){
    m.visible=show;if(!show)continue;
    const def=IKD[m.userData.id];
    m.position.copy(def.eff());
    m.scale.setScalar(camera.position.distanceTo(m.position)*.011*(def.id==='head'?1.3:1));
    m.material=(drag&&drag.def===def)?hMats.hot:(m.userData.joint===sel?hMats.sel:hMats.idle);
  }
}
const pickHandle=e=>{setRay(e);return ray.intersectObjects(handles.filter(h=>h.visible),false)[0]};
dom.addEventListener('pointerdown',e=>{
  if(e.button!==0||!opts.handles||!rigReady())return;
  const hit=pickHandle(e);if(!hit)return;
  e.stopImmediatePropagation();e.preventDefault();
  controls.enabled=false;dom.setPointerCapture(e.pointerId);
  const def=IKD[hit.object.userData.id];
  select(def.joint);applyPose();
  const p=def.eff(),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()).negate(),p),hp=new V3();
  ray.ray.intersectPlane(plane,hp);
  drag={def,plane,off:p.clone().sub(hp),pid:e.pointerId};
  dom.style.cursor='grabbing';
},true);
dom.addEventListener('pointermove',e=>{
  if(drag){
    setRay(e);const hp=new V3();
    if(ray.ray.intersectPlane(drag.plane,hp)){ikSolve(drag.def,hp.add(drag.off));syncJointSliders();queueSave()}
    return;
  }
  if(e.buttons===0&&opts.handles&&rigReady())dom.style.cursor=pickHandle(e)?'grab':'';
});
function endDrag(e){
  if(!drag)return;
  try{dom.releasePointerCapture(drag.pid)}catch(_){}
  drag=null;controls.enabled=true;dom.style.cursor='';
  settle();save();commit();
}
dom.addEventListener('pointerup',endDrag);
dom.addEventListener('pointercancel',endDrag);

// click a body part to select its joint
let downPt=null;
dom.addEventListener('pointerdown',e=>{downPt=(e.button===0&&!drag)?{x:e.clientX,y:e.clientY}:null});
dom.addEventListener('pointerup',e=>{
  if(!downPt||drag||Math.hypot(e.clientX-downPt.x,e.clientY-downPt.y)>4){downPt=null;return}
  downPt=null;setRay(e);
  const cand=opts.mode==='man'?pickables.filter(m=>m.visible):(HUM.ready?[HUM.body,HUM.egg,...HUM.under].filter(Boolean):[]);
  const hit=ray.intersectObjects(cand,false)[0];if(!hit)return;
  if(hit.object.userData.joint)select(hit.object.userData.joint);
  else if(HUM.rigOK){
    const g=hit.object.geometry,vi=hit.face.a,si=g.attributes.skinIndex.array,sw=g.attributes.skinWeight.array;
    let bq=0,bw=-1;for(let q=0;q<4;q++)if(sw[vi*4+q]>bw){bw=sw[vi*4+q];bq=q}
    select(HUM.jointOfBone[si[vi*4+bq]]||'pelvis');
  }
},true);

/* ===================================================================== UI */
function slider(parent,o){
  const w=document.createElement('div');w.className='row';
  w.innerHTML=`<div class="rl"><span>${o.label}</span><output></output></div><input type="range"><div class="hints"><span>${o.lo??''}</span><span>${o.hi??''}</span></div>`;
  const inp=w.querySelector('input'),out=w.querySelector('output');
  inp.min=o.min;inp.max=o.max;inp.step=o.step??1;inp.value=o.value;
  const show=()=>{const v=+inp.value;out.textContent=o.fmt?o.fmt(v):v.toFixed((o.step??1)<1?2:0)+(o.unit??'')};
  show();
  inp.addEventListener('input',()=>{show();o.onInput(+inp.value)});
  inp.addEventListener('change',()=>o.onChange&&o.onChange());
  inp.addEventListener('dblclick',()=>{inp.value=o.def;show();o.onInput(o.def);o.onChange&&o.onChange()});
  parent.appendChild(w);
  return {set(v){inp.value=v;show()},row:w};
}
function chips(box,obj,fn){for(const name of Object.keys(obj)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>fn(name);box.appendChild(b)}}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+b.dataset.tab));
});

// history + persistence
const hist=[];let hi=-1;
const snap=()=>JSON.stringify({body,hm,hx,pose,root:rootState()});
function commit(){const s=snap();if(hist[hi]===s)return;hist.length=hi+1;hist.push(s);if(hist.length>100)hist.shift();hi=hist.length-1}
function restore(i){hi=i;loadState(JSON.parse(hist[i]));syncUI();applyAll();save()}
const undo=()=>{if(hi>0)restore(hi-1)},redo=()=>{if(hi<hist.length-1)restore(hi+1)};

const LS='form-mannequin-v3';let saveT=0;
function save(){try{localStorage.setItem(LS,JSON.stringify({body,hm,hx,pose,opts,url:$('#humUrl').value,root:rootState()}))}catch(e){}}
function queueSave(){clearTimeout(saveT);saveT=setTimeout(save,300)}
function loadState(st){
  const b=defaultBody(),h=defaultHm(),p=defaultPose(),x={},num=v=>typeof v==='number'&&isFinite(v);
  if(st&&st.body)for(const k in b){const v=st.body[k];if(num(v))b[k]=clamp(v,BODY_DEFS[k].min,BODY_DEFS[k].max)}
  if(st&&st.hm)for(const k in h){const v=st.hm[k];if(num(v))h[k]=clamp(v,HDEF[k].min,HDEF[k].max)}
  if(st&&st.hx)for(const n in st.hx){const v=st.hx[n];if(num(v)&&v>0&&!BAD.test(n))x[n]=clamp(v,0,1)}
  if(st&&st.pose)for(const jk in JD)for(const d of JD[jk].dof){const v=st.pose[jk]&&st.pose[jk][d.key];if(num(v))p[jk][d.key]=clamp(v,d.min,d.max)}
  setRoot(st&&st.root);body=b;hm=h;hx=x;pose=p;
}
function update(){applyPose();settle();queueSave()}

/* ---------- mannequin body UI ---------- */
const bodyUI={},humUI={};
function buildBodyUI(){
  const box=$('#bodySliders');
  for(const [group,list] of BODY){
    const h=document.createElement('h3');h.textContent=group;box.appendChild(h);
    for(const d of list)bodyUI[d.k]=slider(box,{label:d.label,min:d.min,max:d.max,step:.01,value:body[d.k],def:d.def,lo:d.lo,hi:d.hi,
      onInput:v=>{body[d.k]=v;applyAll();queueSave()},onChange:commit});
  }
  chips($('#bodyChips'),BODY_PRESETS,n=>{body=Object.assign(defaultBody(),BODY_PRESETS[n]);syncUI();applyAll();save();commit()});
  $('#resetBody').onclick=()=>{body=defaultBody();syncUI();applyAll();save();commit()};
}

/* ---------- human body UI ---------- */
function buildHumanUI(){
  const box=$('#humSliders');
  for(const [group,keys] of HGROUPS){
    const h=document.createElement('h3');h.textContent=group;box.appendChild(h);
    for(const k of keys){
      const s=HDEF[k];
      humUI[k]=slider(box,{label:s.label,min:s.min,max:s.max,step:.01,value:hm[k],def:s.def,lo:s.lo,hi:s.hi,
        onInput:v=>{hm[k]=v;applyAll();queueSave()},onChange:commit});
    }
  }
  chips($('#humChips'),HPRESETS,n=>{hm=Object.assign(defaultHm(),HPRESETS[n]);hx={};syncUI();applyAll();save();commit()});
  $('#resetHum').onclick=()=>{hm=defaultHm();hx={};syncUI();applyAll();save();commit()};
  $('#humReload').onclick=()=>loadHuman();
  $('#humFile').onclick=()=>$('#humFileIn').click();
  $('#humFileIn').onchange=e=>{const f=e.target.files[0];if(f)loadHuman({file:f});e.target.value=''};
  $('#mfilter').oninput=renderMorphList;
}
function updateHumanUI(){
  for(const k in humUI){
    const r=HUM.res[k],ok=!!(r&&(r.neg||r.pos))||(k in PROC);
    humUI[k].row.classList.toggle('dis',!ok);
    humUI[k].row.title=ok?`${r.neg||'-'} / ${r.pos||'-'}`:'No matching morph found in this model';
  }
}
function renderMorphList(){
  const box=$('#mlist');box.innerHTML='';
  if(!HUM.ready){box.textContent='Load the model first.';return}
  const f=($('#mfilter').value||'').toLowerCase().trim();
  const list=HUM.names.filter(n=>!f||n.toLowerCase().includes(f)),shown=list.slice(0,60);
  for(const n of shown)slider(box,{label:n.replace(/[<>&]/g,''),min:0,max:1,step:.01,value:hx[n]||0,def:0,
    onInput:v=>{if(v>0)hx[n]=v;else delete hx[n];applyAll();queueSave()},onChange:commit});
  if(list.length>shown.length){const p=document.createElement('p');p.className='note';p.textContent=`Showing ${shown.length} of ${list.length}. Type in the filter to narrow it down.`;box.appendChild(p)}
}

/* ---------- pose UI ---------- */
function jbtn(k,text){const b=document.createElement('button');b.textContent=text;b.dataset.j=k;b.onclick=()=>select(k);return b}
function buildPoseUI(){
  const g=$('#jointGrid');
  const mid=document.createElement('div');mid.className='chips';
  for(const k of ['head','neck','chest','lumbar','pelvis'])mid.appendChild(jbtn(k,JD[k].short));
  g.appendChild(mid);
  const t=document.createElement('table');
  t.innerHTML='<tr><td></td><td style="text-align:center;color:#92999f">Left</td><td style="text-align:center;color:#92999f">Right</td></tr>';
  for(const [base,label] of [['clav','Shoulder blade'],['shoulder','Shoulder'],['elbow','Elbow'],['wrist','Wrist / hand'],['hip','Hip'],['knee','Knee'],['ankle','Ankle']]){
    const tr=document.createElement('tr'),td=()=>tr.appendChild(document.createElement('td'));
    td().textContent=label;td().appendChild(jbtn(base+'L','L'));td().appendChild(jbtn(base+'R','R'));
    t.appendChild(tr);
  }
  g.appendChild(t);

  $('#undo').onclick=undo;$('#redo').onclick=redo;
  $('#resetPose').onclick=()=>{pose=defaultPose();syncUI();applyAll();save();commit()};
  $('#resetJoint').onclick=()=>{
    const reset=k=>{pose[k]=Object.fromEntries(JD[k].dof.map(d=>[d.key,d.def]))};
    reset(sel);if(opts.mirror&&partner(sel))reset(partner(sel));
    renderJoint();update();commit();
  };
  $('#flip').onclick=()=>{
    const np=defaultPose();
    for(const k in JD){
      const j=JD[k];
      if(j.side)Object.assign(np[k],pose[partner(k)]);
      else for(const d of j.dof){const v=pose[k][d.key];np[k][d.key]=(d.key==='tilt'||d.key==='turn')?-v:v}
    }
    pose=np;syncUI();applyAll();save();commit();
  };
  $('#mirror').onchange=e=>{opts.mirror=e.target.checked;queueSave()};
  $('#ground').onchange=e=>{opts.ground=e.target.checked;applyAll();queueSave()};
}
let jointUI=[];
function renderJoint(){
  const k=sel,j=JD[k];if(!j)return;
  $('#jointTitle').textContent=j.label+(j.side?` — ${j.side==='L'?'left':'right'}`:'');
  const bx=$('#jointSliders');bx.innerHTML='';
  jointUI=j.dof.map(d=>({key:d.key,ui:slider(bx,{label:d.label,min:d.min,max:d.max,step:1,value:pose[k][d.key],def:d.def,lo:d.lo,hi:d.hi,unit:d.axis==='custom'?'%':'°',
    onInput:v=>{pose[k][d.key]=v;const o=opts.mirror&&partner(k);if(o)pose[o][d.key]=v;update()},onChange:commit})}));
}
function syncJointSliders(){const p=pose[sel];if(p)for(const e of jointUI)e.ui.set(p[e.key])}
function select(k){
  sel=k;
  document.querySelectorAll('[data-j]').forEach(b=>b.classList.toggle('on',b.dataset.j===k));
  renderJoint();refreshMats();
}

/* ---------- mode ---------- */
function setMode(m){
  opts.mode=m;
  mann.visible=m==='man';hum.visible=m==='human';
  document.querySelectorAll('[data-mode-btn]').forEach(b=>b.classList.toggle('on',b.dataset.modeBtn===m));
  document.querySelectorAll('[data-only]').forEach(e=>{e.hidden=e.dataset.only!==m});
  if(m==='human'&&!HUM.ready&&!HUM.loading)loadHuman();
  syncUI();applyAll();refreshMats();queueSave();
}
document.querySelectorAll('[data-mode-btn]').forEach(b=>b.onclick=()=>{setMode(b.dataset.modeBtn);commit()});

/* ---------- view UI ---------- */
function buildViewUI(){
  const ls=$('#lightSliders');
  slider(ls,{label:'Light direction',min:-180,max:180,value:opts.az,def:35,unit:'°',onInput:v=>{opts.az=v;setLight();queueSave()}});
  slider(ls,{label:'Light height',min:5,max:85,value:opts.el,def:50,unit:'°',onInput:v=>{opts.el=v;setLight();queueSave()}});
  $('#shading').value=opts.shading;$('#bg').value=opts.bg;
  $('#shading').onchange=e=>{opts.shading=e.target.value;mats=buildMats(opts.shading);refreshMats();queueSave()};
  $('#bg').onchange=e=>{opts.bg=e.target.value;setBg(opts.bg);queueSave()};
  const bind=(id,k,fn)=>{const c=$(id);c.checked=opts[k];c.onchange=()=>{opts[k]=c.checked;fn&&fn();queueSave()}};
  bind('#oShadows','shadows',setLight);
  bind('#oGrid','grid',()=>{grid.visible=opts.grid});
  bind('#oRuler','ruler',updateGuides);
  bind('#oHi','highlight',refreshMats);
  bind('#oHandles','handles');
  bind('#oUnder','under',()=>HUM.under.forEach(m=>m.visible=opts.under));
  $('#mirror').checked=opts.mirror;$('#ground').checked=opts.ground;

  const download=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)};
  $('#shot').onclick=()=>{
    const h=opts.highlight;opts.highlight=false;shotting=true;refreshMats();updateHandles();
    guides.visible=false;if(typeof tcH!=='undefined')tcH.visible=false;if(typeof skel!=='undefined')skel.visible=false;renderer.render(scene,camera);
    dom.toBlob(b=>download(b,'mannequin.png'));
    if(typeof tcH!=='undefined')tcH.visible=true;guides.visible=opts.ruler;opts.highlight=h;shotting=false;refreshMats();
  };
  $('#save').onclick=()=>download(new Blob([JSON.stringify({v:3,mode:opts.mode,body,hm,hx,pose,root:rootState()},null,1)],{type:'application/json'}),'mannequin-pose.json');
  $('#load').onclick=()=>$('#file').click();
  $('#file').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{loadState(JSON.parse(await f.text()));syncUI();applyAll();save();commit()}catch(err){alert('Could not read that file.')}
    e.target.value='';
  };
}

function syncUI(){
  for(const k in bodyUI)bodyUI[k].set(body[k]);
  for(const k in humUI)humUI[k].set(hm[k]);
  renderJoint();renderMorphList();
}

/* ---------- camera ---------- */
function frame(){
  const h=curHeight();
  controls.target.set(0,h*.52,0);
  const dir=camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir,Math.max(2.6,h*2.5));
  controls.update();
}
const VIEWS={front:[0,.08,1],side:[1,.08,0],back:[0,.08,-1],three:[.65,.22,.75],top:[0,1,.001]};
function setView(n){
  const dist=camera.position.distanceTo(controls.target);
  camera.position.copy(controls.target).addScaledVector(new V3(...VIEWS[n]).normalize(),dist);
  controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#frame').onclick=frame;

// keyboard
addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&e.target.type!=='range')return;
  const k=e.key.toLowerCase();
  if(k==='z'){e.preventDefault();e.shiftKey?redo():undo()}
  else if(k==='y'){e.preventDefault();redo()}
});

// resize + loop
function resize(){const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(view);
(function loop(){
  if(HUM.eggDirty&&opts.mode==='human')rebuildEgg();
  controls.update();updateHandles();if(typeof updateExtras==='function')updateExtras();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
})();

/* ===================================================================== INIT */
(function init(){
  let st=null;
  try{st=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){}
  loadState(st);
  if(st&&st.opts)for(const k in opts)if(k in st.opts)opts[k]=st.opts[k];
  const wantMode=opts.mode==='human'?'human':'man';
  opts.mode='man';
  mats=buildMats(opts.shading);
  setBg(opts.bg);setLight();
  $('#humUrl').value=(st&&st.url)||MODEL_BASE;
  buildBodyUI();buildHumanUI();buildPoseUI();buildViewUI();
  select('head');
  setMode(wantMode);
  commit();
  resize();
  camera.position.set(2.4,1.6,3.4);
  frame();setView('three');
})();

/* ===================================================================== FORM v4 EXTRAS */
const dl=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)};
const esc=t=>String(t).replace(/[<>&"]/g,'');
{
  let st=null;try{st=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){}
  opts.guard=st&&st.opts&&typeof st.opts.guard==='boolean'?st.opts.guard:true;
  opts.relax=st&&st.opts&&typeof st.opts.relax==='number'?st.opts.relax:.45;
}

/* ---------- slider -> morph mapping panel ---------- */
function renderMapping(){
  const box=$('#mapBox');if(!box)return;box.innerHTML='';
  if(!HUM.ready){box.textContent='Load the model first.';return}
  const opt=cur=>'<option value="">(none)</option>'+HUM.names.map(n=>`<option${n===cur?' selected':''}>${esc(n)}</option>`).join('');
  for(const s of HSPEC){
    const r=HUM.res[s.k]||{},w=document.createElement('div');
    w.innerHTML=`<div class="note">${s.label}</div><div class="fld"><select data-k="${s.k}" data-d="neg" style="width:48%">${opt(r.neg)}</select><select data-k="${s.k}" data-d="pos" style="width:48%">${opt(r.pos)}</select></div>`;
    box.appendChild(w);
  }
  box.onchange=e=>{
    const t=e.target,k=t.dataset.k;if(!k)return;
    const o=OVR[k]=OVR[k]||{neg:HUM.res[k].neg,pos:HUM.res[k].pos};o[t.dataset.d]=t.value||null;
    HUM.res[k]={neg:o.neg,pos:o.pos};
    try{localStorage.setItem('form-hmap',JSON.stringify(OVR))}catch(_){}
    updateHumanUI();applyAll();
  };
}

/* ---------- pose guard: collisions ---------- */
const _d1=new V3(),_d2=new V3(),_r=new V3();
function segDist(p1,q1,p2,q2){
  _d1.subVectors(q1,p1);_d2.subVectors(q2,p2);_r.subVectors(p1,p2);
  const a=_d1.dot(_d1),e=_d2.dot(_d2),f=_d2.dot(_r);let s,t;
  if(a<=1e-12&&e<=1e-12)return _r.length();
  if(a<=1e-12){s=0;t=clamp(f/e,0,1)}
  else{
    const c=_d1.dot(_r);
    if(e<=1e-12){t=0;s=clamp(-c/a,0,1)}
    else{
      const b=_d1.dot(_d2),den=a*e-b*b;
      s=den>1e-12?clamp((b*f-c*e)/den,0,1):0;t=(b*s+f)/e;
      if(t<0){t=0;s=clamp(-c/a,0,1)}else if(t>1){t=1;s=clamp((b-c)/a,0,1)}
    }
  }
  return p1.clone().addScaledVector(_d1,s).distanceTo(p2.clone().addScaledVector(_d2,t));
}
function collisionE(){
  const H=curHeight(),J=jpos,mid=(a,b,f)=>a.clone().lerp(b,f);
  const torso={a:J('pelvis'),b:J('neck'),r:.07*H};
  const hd=J('head'),hc=hd.clone().lerp(effHead(),.7),head={a:hc,b:hc,r:.06*H};
  const arm={},leg={};
  for(const S of ['L','R']){
    const sh=J('shoulder'+S),el=J('elbow'+S),wr=J('wrist'+S),tip=wr.clone().add(wr.clone().sub(el).setLength(.055*H));
    arm[S]={U:{a:mid(sh,el,.35),b:el,r:.022*H},F:{a:el,b:wr,r:.018*H},Hn:{a:wr,b:tip,r:.02*H}};
    const hp=J('hip'+S),kn=J('knee'+S),an=J('ankle'+S);
    leg[S]={T:{a:mid(hp,kn,.4),b:kn,r:.035*H},S:{a:kn,b:an,r:.028*H}};
  }
  const pairs=[];
  for(const S of ['L','R']){
    const O=S==='L'?'R':'L';
    for(const k of ['U','F','Hn']){pairs.push([arm[S][k],torso],[arm[S][k],head])}
    for(const k of ['F','Hn'])for(const l of ['L','R'])pairs.push([arm[S][k],leg[l].T]);
    for(const k of ['F','Hn'])for(const k2 of ['U','F','Hn'])if(S==='L')pairs.push([arm.L[k],arm.R[k2]],[arm.R[k],arm.L[k2]]);
  }
  for(const a of ['T','S'])for(const b of ['T','S'])pairs.push([leg.L[a],leg.R[b]]);
  let E=0;
  for(const [A,B] of pairs){const pen=A.r+B.r-segDist(A.a,A.b,B.a,B.b)-.004;if(pen>0)E+=pen*pen}
  return E;
}
const penalty=()=>{applyPose();return collisionE()};
function resolveCollisions(){
  const vars=[];
  for(const S of ['L','R'])vars.push(['shoulder'+S,'raise'],['shoulder'+S,'swing'],['elbow'+S,'bend'],['hip'+S,'out'],['hip'+S,'swing'],['knee'+S,'bend']);
  let E=penalty();
  for(let it=0;it<30&&E>1e-7;it++){
    let moved=false;
    for(const [j,k] of vars){
      const d=JD[j].dof.find(x=>x.key===k),o=pose[j][k];let best=E,bv=o;
      for(const st of [-4,4]){const t=clamp(o+st,d.min,d.max);if(t===o)continue;pose[j][k]=t;const e=penalty();if(e<best-1e-9){best=e;bv=t}}
      pose[j][k]=bv;if(bv!==o){E=best;moved=true}
    }
    if(!moved)break;
  }
  applyPose();
}
function commitGuard(){
  if(!opts.guard)return;
  const take=()=>{const e=effPose();if(e!==pose)for(const k in pose)Object.assign(pose[k],e[k])};
  take();resolveCollisions();take();
  syncUI();applyAll();save();commit();
}

/* ---------- pose import (FORM, plus best-effort Euler / quaternion / bend-turn-tilt JSON) ---------- */
function jointFromName(raw){
  const s=String(raw).replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase().replace(/^.*[:|]/,'');
  const L=/(^|[^a-z])l([^a-z]|$)|left/.test(s),R=/(^|[^a-z])r([^a-z]|$)|right/.test(s),side=L?'L':R?'R':null;
  const t=s.replace(/left|right/g,'').replace(/(^|[^a-z])[lr]([^a-z]|$)/g,'$1$2').replace(/[^a-z0-9]/g,'');
  const T=[[/^(pelvis|hips|root)$/,'pelvis'],[/clav|collar/,'clav'],[/forearm|lowerarm|elbow|arm2/,'elbow'],[/upperarm|shoulder|^arm|arm$|arm1/,'shoulder'],
    [/hand|wrist/,'wrist'],[/calf|shin|lowerleg|knee|leg2/,'knee'],[/thigh|upperleg|upleg|^leg|leg$|leg1|hip/,'hip'],[/foot|ankle/,'ankle'],
    [/head/,'head'],[/neck/,'neck'],[/chest|thorax|ribcage|spine2|spine3|torso/,'chest'],[/abdomen|waist|lumbar|spine1?$|stomach|belly/,'lumbar']];
  for(const [re,ty] of T)if(re.test(t)){
    if(['pelvis','head','neck','chest','lumbar'].includes(ty))return ty;
    return side?ty+side:null;
  }
  return null;
}
function collect(o,name,out){
  if(Array.isArray(o)){
    if(o.length>=3&&o.length<=4&&o.every(v=>typeof v==='number')){if(name)out.push([name,o]);return}
    for(const e of o)if(e&&typeof e==='object'){
      const n=e.name??e.joint??e.bone??e.id;
      if(typeof n==='string')out.push([n,e.rotation??e.rot??e.quaternion??e.euler??e.values??e]);else collect(e,name,out);
    }
  }else if(o&&typeof o==='object'){
    if(name&&('bend' in o||'turn' in o||'tilt' in o||('x' in o&&'y' in o&&'z' in o)))out.push([name,o]);
    else for(const k in o)collect(o[k],k,out);
  }
}
function vec(v){   // -> {a:[x,y,z], q:true if already radians from a quaternion}
  const quat=(x,y,z,w)=>{const e=new THREE.Euler().setFromQuaternion(new Q(x,y,z,w).normalize(),'XYZ');return {a:[e.x,e.y,e.z],q:true}};
  if(Array.isArray(v)){if(v.length===4)return quat(v[0],v[1],v[2],v[3]);if(v.length===3)return {a:v.slice(),q:false}}
  else if(v&&typeof v==='object'){
    if('bend' in v||'turn' in v||'tilt' in v)return {a:[v.tilt||0,v.turn||0,v.bend||0],q:false};
    if('w' in v&&'x' in v)return quat(v.x,v.y,v.z,v.w);
    if('x' in v)return {a:[v.x||0,v.y||0,v.z||0],q:false};
  }
  return null;
}
function setEuler(k,x,y,z){
  const j=JD[k],p=pose[k],s=j.s||1,set=(key,v)=>{const d=j.dof.find(q=>q.key===key);if(d)p[key]=clamp(v,d.min,d.max)};
  const base=k.replace(/[LR]$/,'');
  if(!j.side){set('bend',x);set('tilt',-z);set('turn',y)}
  else if(base==='shoulder'){set('raise',s*z);set('swing',-x);set('twist',-s*y)}
  else if(base==='hip'){set('swing',-x);set('out',s*z);set('twist',-s*y)}
  else if(base==='elbow'||base==='knee'){set('bend',Math.abs(Math.abs(x)>=Math.abs(z)?x:z));if(base==='elbow')set('twist',-s*y)}
  else if(base==='wrist'){set('bend',-s*z);set('tilt',-x)}
  else if(base==='ankle'){set('flex',-x);set('roll',-s*z);set('twist',-s*y)}
  else if(base==='clav'){set('shrug',s*z);set('reach',-s*y)}
}
function importPose(o){
  if(o&&o.pose&&typeof o.pose==='object'&&!Array.isArray(o.pose)&&o.pose.head){loadState(o);return 'FORM pose loaded as it is. Pose guard is off; tick it to correct the pose.'}
  const ent=[];collect(o,'',ent);
  const vs=ent.map(([n,v])=>[n,vec(v)]).filter(e=>e[1]);
  if(!vs.length)return 'No joint rotations found in this file. Send me a sample of it and I will add support.';
  let mx=0;for(const [,v] of vs)if(!v.q)for(const a of v.a)mx=Math.max(mx,Math.abs(a));
  const kd=mx>0&&mx<=6.3?1/DEG:1;
  pose=defaultPose();const ok=[],bad=[];
  for(const [n,v] of vs){
    const jk=jointFromName(n);if(!jk||!JD[jk]){bad.push(n);continue}
    const f=v.q?1/DEG:kd;setEuler(jk,v.a[0]*f,v.a[1]*f,v.a[2]*f);ok.push(n);
  }
  return `Imported ${ok.length} joints${bad.length?'; not recognised: '+bad.slice(0,12).join(', '):''}. This is a best-effort read: check the pose, and send me the file if it looks wrong. Pose guard is off; tick it to correct the pose.`;
}

/* ---------- GLB export (posed, baked mesh) ---------- */
async function exportGLB(){
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  figure.updateMatrixWorld(true);
  const sc=new THREE.Scene(),mat=new THREE.MeshStandardMaterial({color:mats.colBase,roughness:.8}),jm=new THREE.MeshStandardMaterial({color:0xa89b8b,roughness:.8});
  const add=(g,m,n)=>{const mm=new THREE.Mesh(g,m);mm.name=n;sc.add(mm)};
  if(opts.mode==='man'){
    let i=0;mann.traverse(o=>{if(o.isMesh&&o.visible)add(o.geometry.clone().applyMatrix4(o.matrixWorld),o.userData.kind==='joint'?jm:mat,'part'+(i++))});
  }else{
    if(!HUM.ready){impNote('Human model is not loaded yet.');return}
    HUM.dirtySkin=true;skinNow();
    for(const PT of HUM.parts){
      if(!PT.mesh.visible)continue;
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(PT.out.slice(),3));
      g.setAttribute('normal',new THREE.BufferAttribute(PT.nrm.slice(),3));
      g.setIndex(new THREE.BufferAttribute(PT.index.slice(),1));
      add(g.applyMatrix4(hum.matrixWorld),PT===HUM.bodyP?mat:jm,PT===HUM.bodyP?'body':'underwear');
    }
  }
  new GLTFExporter().parse(sc,res=>dl(new Blob([res],{type:'model/gltf-binary'}),'mannequin-posed.glb'),err=>impNote('GLB export failed: '+err),{binary:true});
}
const impNote=t=>{const e=$('#impStat');if(e)e.textContent=t};

/* ---------- UI wiring ---------- */
{
  $('#ground').closest('label').insertAdjacentHTML('afterend','<label class="chk"><input type="checkbox" id="oGuard"> Pose guard (humanly possible poses only)</label>');
  const gc=$('#oGuard');gc.checked=opts.guard;
  gc.onchange=()=>{opts.guard=gc.checked;if(opts.guard)commitGuard();else applyAll();queueSave()};

  const rx=document.createElement('div');$('#resetHum').parentElement.before(rx);
  slider(rx,{label:'Skin smoothing',min:0,max:1,step:.01,value:opts.relax,def:.45,lo:'raw',hi:'smooth',
    onInput:v=>{opts.relax=v;HUM.dirtySkin=true;HUM.eggDirty=true;queueSave()}});
  $('#mlist').closest('details').insertAdjacentHTML('afterend','<details><summary>Slider to morph mapping</summary><div class="note">If a slider is greyed out or does the wrong thing, pick the right morph here (left = negative end, right = positive end).</div><div id="mapBox"></div></details>');
  renderMapping();

  $('#load').textContent='Load / import pose';
  $('#save').insertAdjacentHTML('afterend','<button id="glb">Export GLB</button>');
  $('#save').parentElement.insertAdjacentHTML('afterend','<div class="note" id="impStat"></div>');
  $('#glb').onclick=exportGLB;
  $('#file').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    let o;try{o=JSON.parse(await f.text())}catch(err){impNote('That file is not valid JSON.');return}
    const msg=importPose(o);
    opts.guard=false;gc.checked=false;
    syncUI();applyAll();save();commit();impNote(msg);
  };
  $('#jointSliders').addEventListener('change',()=>commitGuard());
  let wasDrag=false;
  dom.addEventListener('pointermove',()=>{if(drag)wasDrag=true});
  dom.addEventListener('pointerup',()=>{if(wasDrag){wasDrag=false;commitGuard()}});
  applyAll();
}
/* ===== FORM v5: gizmo, rig tools, props ===== */
var extrasReady=false;
const tc=new TransformControls(camera,dom),tcH=tc.getHelper();scene.add(tcH);tc.size=.85;
const proxy=new THREE.Object3D();scene.add(proxy);
const gz={target:'joint',prop:null},FQ=new Q(),FQi=new Q(),GQ=new Q(),EU=new THREE.Euler();
let gdrag=false,pmode='translate';
function rootState(){return [figure.position.x,figure.position.z,figure.rotation.x,figure.rotation.y,figure.rotation.z].map(v=>+v.toFixed(4))}
function setRoot(r){if(Array.isArray(r)&&r.length===5&&r.every(Number.isFinite)){figure.position.x=r[0];figure.position.z=r[1];figure.rotation.set(r[2],r[3],r[4])}else{figure.position.x=figure.position.z=0;figure.rotation.set(0,0,0)}}
function jointFrame(k,out){
  if(opts.mode==='man')nodes[k].parent.getWorldQuaternion(out);
  else{const b=HUM.map[k][0].bone,d=HUM.drv.find(x=>x.bone===b);b.parent.getWorldQuaternion(out);if(d)out.multiply(d.rpInv)}
  return out;
}
function syncProxy(){
  if(!rigReady()||!JD[sel])return;
  proxy.position.copy(jpos(sel));
  proxy.quaternion.copy(jointFrame(sel,FQ)).multiply(dq[sel]);proxy.updateMatrixWorld();
}
function jointFromProxy(){
  const j=JD[sel];
  jointFrame(sel,FQ);FQi.copy(FQ).invert();GQ.copy(FQi).multiply(proxy.quaternion);
  EU.setFromQuaternion(GQ,j.order);const v={x:EU.x,y:EU.y,z:EU.z},o=opts.mirror&&partner(sel);
  for(const d of j.dof){if(d.axis==='custom')continue;const val=clamp(v[d.axis]/DEG/d.sign,d.min,d.max);pose[sel][d.key]=val;if(o)pose[o][d.key]=val}
  update();syncJointSliders();
  proxy.quaternion.copy(FQ).multiply(dq[sel]);
}
function gizmoSet(){
  tc.detach();const g=gz.target;tc.showX=tc.showY=tc.showZ=true;
  if(gz.prop){tc.attach(gz.prop);tc.setMode(pmode)}
  else if(g==='joint'&&rigReady()){syncProxy();tc.attach(proxy);tc.setMode('rotate')}
  else if(g==='move'){tc.attach(figure);tc.setMode('translate');tc.showY=false}
  else if(g==='spin'){tc.attach(figure);tc.setMode('rotate')}
  document.querySelectorAll('[data-gz]').forEach(b=>b.classList.toggle('on',!gz.prop&&b.dataset.gz===g));
}
tc.addEventListener('dragging-changed',e=>{gdrag=e.value;controls.enabled=!e.value;if(!e.value&&!gz.prop){settle();save();commit();commitGuard()}});
tc.addEventListener('objectChange',()=>{if(gz.prop)return;if(tc.object===proxy)jointFromProxy();else settle()});

/* skeleton overlay */
const BONES=[['pelvis','lumbar'],['lumbar','chest'],['chest','neck'],['neck','head']];
for(const S of ['L','R']){BONES.push(['chest','clav'+S],['clav'+S,'shoulder'+S],['shoulder'+S,'elbow'+S],['elbow'+S,'wrist'+S],['pelvis','hip'+S],['hip'+S,'knee'+S],['knee'+S,'ankle'+S])}
const skelGeo=new THREE.BufferGeometry();skelGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(BONES.length*6),3));
const skel=new THREE.LineSegments(skelGeo,new THREE.LineBasicMaterial({color:0xe2a46c,depthTest:false,transparent:true}));
skel.renderOrder=6;skel.frustumCulled=false;skel.visible=false;scene.add(skel);opts.skel=false;
function updateExtras(){
  if(!extrasReady)return;
  if(!gdrag){
    if(tc.object===proxy){if(rigReady())syncProxy();else tc.detach()}
    else if(!tc.object&&gz.target==='joint'&&!gz.prop&&rigReady())gizmoSet();
  }
  skel.visible=opts.skel&&rigReady();
  if(skel.visible){const a=skelGeo.attributes.position.array;let i=0;for(const [p,q] of BONES){jpos(p).toArray(a,i);jpos(q).toArray(a,i+3);i+=6}skelGeo.attributes.position.needsUpdate=true}
}

/* rig tools */
function sym(from){
  const to=from==='L'?'R':'L';
  for(const k in JD){const j=JD[k];if(j.side===from)Object.assign(pose[k.slice(0,-1)+to],pose[k]);else if(!j.side)for(const d of j.dof)if(d.key==='tilt'||d.key==='turn')pose[k][d.key]=0}
  syncUI();applyAll();save();commit();commitGuard();
}
$('#symL').onclick=()=>sym('L');$('#symR').onclick=()=>sym('R');
$('#rndPose').onclick=()=>{
  for(const k in JD)for(const d of JD[k].dof)pose[k][d.key]=Math.round(lerp(d.def,d.min+Math.random()*(d.max-d.min),.45));
  syncUI();applyAll();save();commit();commitGuard();
};
$('#oSkel').onchange=e=>{opts.skel=e.target.checked};
document.querySelectorAll('[data-gz]').forEach(b=>b.onclick=()=>{gz.target=b.dataset.gz;gz.prop=null;gizmoSet();propUI()});

/* props */
const props=[],PM=new THREE.MeshStandardMaterial({color:0x8a97a3,roughness:.85});
const bx=(w,h,d,x,y,z,g)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),PM);m.position.set(x,y,z);g.add(m)};
const cy=(r,h,x,y,z,g)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),PM);m.position.set(x,y,z);g.add(m)};
const sp=(r,g)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,28,18),PM);m.position.y=r;g.add(m)};
const PROPS={
 Chair:g=>{bx(.44,.04,.44,0,.45,0,g);bx(.44,.46,.03,0,.7,-.205,g);for(const a of[-1,1])for(const b of[-1,1])bx(.04,.43,.04,a*.2,.215,b*.2,g)},
 Stool:g=>{cy(.17,.04,0,.62,0,g);for(const a of[0,2.09,4.19])bx(.03,.6,.03,Math.sin(a)*.13,.3,Math.cos(a)*.13,g)},
 Bench:g=>{bx(1.2,.05,.38,0,.45,0,g);for(const a of[-1,1])bx(.05,.43,.34,a*.54,.215,0,g)},
 Table:g=>{bx(1,.04,.6,0,.74,0,g);for(const a of[-1,1])for(const b of[-1,1])bx(.05,.72,.05,a*.46,.36,b*.26,g)},
 Box:g=>bx(.5,.5,.5,0,.25,0,g),Cylinder:g=>cy(.25,.5,0,.25,0,g),Sphere:g=>sp(.25,g),Ball:g=>sp(.12,g),
 Steps:g=>{for(let i=0;i<4;i++)bx(.9,.18*(i+1),.3,0,.09*(i+1),-i*.3,g)},
 Wall:g=>bx(2,2.2,.1,0,1.1,0,g),Staff:g=>cy(.015,1.6,0,.8,0,g)
};
function propUI(){
  $('#propTitle').textContent=gz.prop?'Selected: '+gz.prop.userData.prop:'No prop selected';
  document.querySelectorAll('[data-pm]').forEach(b=>b.classList.toggle('on',!!gz.prop&&b.dataset.pm===pmode));
}
function selectProp(g){gz.prop=g;gizmoSet();propUI()}
function addProp(n){
  const g=new THREE.Group();PROPS[n](g);g.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});
  g.userData.prop=n;g.position.set(.9+.15*props.length,0,0);scene.add(g);props.push(g);selectProp(g);
}
for(const n in PROPS){const b=document.createElement('button');b.textContent=n;b.onclick=()=>addProp(n);$('#propChips').appendChild(b)}
document.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{pmode=b.dataset.pm;if(gz.prop)gizmoSet();propUI()});
$('#pSnap').onchange=e=>{const on=e.target.checked;tc.setTranslationSnap(on ? .05 : null);tc.setRotationSnap(on ? 15*DEG : null);tc.setScaleSnap(on ? .1 : null)};
$('#pDup').onclick=()=>{if(!gz.prop)return;const c=gz.prop.clone(true);c.position.x+=.3;scene.add(c);props.push(c);selectProp(c)};
$('#pFloor').onclick=()=>{if(!gz.prop)return;gz.prop.updateMatrixWorld(true);gz.prop.position.y-=new THREE.Box3().setFromObject(gz.prop).min.y};
const rmProp=g=>{scene.remove(g);props.splice(props.indexOf(g),1)};
$('#pDel').onclick=()=>{if(!gz.prop)return;rmProp(gz.prop);gz.prop=null;gizmoSet();propUI()};
$('#pClear').onclick=()=>{props.slice().forEach(rmProp);gz.prop=null;gizmoSet();propUI()};
let pd=null;
dom.addEventListener('pointerdown',e=>{pd=e.button===0?{x:e.clientX,y:e.clientY}:null});
dom.addEventListener('pointerup',e=>{
  const p0=pd;pd=null;
  if(!p0||drag||gdrag||tc.axis||Math.hypot(e.clientX-p0.x,e.clientY-p0.y)>4)return;
  setRay(e);
  const ph=ray.intersectObjects(props,true)[0],
        cand=opts.mode==='man'?pickables.filter(m=>m.visible):(HUM.ready?[HUM.body,...HUM.under].filter(Boolean):[]),
        fh=ray.intersectObjects(cand,false)[0];
  if(ph&&(!fh||ph.distance<fh.distance)){let o=ph.object;while(o.parent&&!o.userData.prop)o=o.parent;selectProp(o)}
  else if(fh&&gz.prop){gz.prop=null;gizmoSet();propUI()}
});
gizmoSet();propUI();extrasReady=true;
/* ===== natural torso/hips deformation (skin-weight regions, normal inflation, smoothed field) ===== */
const AMP={hips:.055,glutes:.05,belly:.075,waist:.05,thighs:.04,calves:.03,shoulders:.04};   // fraction of body height at slider = 1
const gau=(t,c,s)=>Math.exp(-(((t-c)/s)**2));
function buildRW(bp){
  const n=bp.n,jb=HUM.jointOfBone,R={T:new Float32Array(n),H:new Float32Array(n),K:new Float32Array(n),A:new Float32Array(n)};
  const cls={pelvis:'T',lumbar:'T',chest:'T',hipL:'H',hipR:'H',kneeL:'K',kneeR:'K',ankleL:'K',ankleR:'K'};
  for(let v=0;v<n;v++)for(let q=0;q<4;q++){
    const w=bp.wt[v*4+q];if(!w)continue;const j=jb[bp.idx[v*4+q]];
    const c=cls[j]||(/^(clav|shoulder|elbow|wrist)/.test(j)?'A':null);if(c)R[c][v]+=w;
  }
  bp.RW=R;
}
function restNormals(PT){
  const o=PT.rest,ix=PT.index,cv=PT.canon,A=PT.tmp,N=PT.rn||(PT.rn=new Float32Array(PT.n*3));A.fill(0);
  for(let t=0;t<ix.length;t+=3){
    const i0=ix[t]*3,i1=ix[t+1]*3,i2=ix[t+2]*3;
    const ax=o[i1]-o[i0],ay=o[i1+1]-o[i0+1],az=o[i1+2]-o[i0+2],bx=o[i2]-o[i0],by=o[i2+1]-o[i0+1],bz=o[i2+2]-o[i0+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    for(const v of [ix[t],ix[t+1],ix[t+2]]){const c=cv[v]*3;A[c]+=nx;A[c+1]+=ny;A[c+2]+=nz}
  }
  for(let v=0;v<PT.n;v++){const c=cv[v]*3,l=Math.hypot(A[c],A[c+1],A[c+2])||1;N[v*3]=A[c]/l;N[v*3+1]=A[c+1]/l;N[v*3+2]=A[c+2]/l}
  return N;
}
function procField(bp,P){
  const {y0,H,fs}=HUM.dim,r=bp.rest,N=restNormals(bp),R=bp.RW,n=bp.n,F=bp.pf||(bp.pf=new Float32Array(n*3));
  const hp=P.hips||0,be=P.belly||0,wa=P.waist||0,th=P.thighs||0,ca=P.calves||0,sh=P.shoulders||0;
  for(let v=0;v<n;v++){
    const i=v*3,t=(r[i+1]-y0)/H,x=r[i],ax=Math.abs(x)/H,sg=x<0?-1:1;
    const l=Math.hypot(N[i],N[i+2])||1,hx=N[i]/l,hz=N[i+2]/l,fr=hz*fs;
    const T=R.T[v],Hh=R.H[v],K=R.K[v],A=R.A[v],tor=Math.min(1,T+Hh),out=sstep(-.3,.5,hx*sg)*.65+.35;
    let dx=0,dz=0,w;
    if(hp){w=tor*gau(t,.50,.05)*sstep(.2,.7,Math.abs(hx))*AMP.hips*H*hp;dx+=hx*w;dz+=hz*w*.3}
    if(be){w=T*gau(t,.575,.05)*sstep(0,.45,fr)*(1-sstep(.07,.13,ax))*AMP.belly*H*be;dx+=hx*w*.5;dz+=hz*w}
    if(wa){w=T*gau(t,.635,.04)*AMP.waist*H*wa;dx+=hx*w;dz+=hz*w*.8}
    if(th){w=Hh*gau(t,.37,.09)*out*AMP.thighs*H*th;dx+=hx*w;dz+=hz*w}
    if(ca){w=K*gau(t,.21,.06)*out*AMP.calves*H*ca;dx+=hx*w;dz+=hz*w}
    if(sh)dx+=sg*AMP.shoulders*H*sh*(A+.5*T*gau(t,.80,.04)*sstep(.05,.14,ax));
    F[i]=dx;F[i+1]=0;F[i+2]=dz;
  }
}
function smoothField(PT,F){
  const C=PT.C,T=PT.pftmp||(PT.pftmp=new Float32Array(PT.nc*3)),st=PT.st,adj=PT.adj,nc=PT.nc;
  for(let c=0;c<nc;c++){const i=PT.first[c]*3;C[c*3]=F[i];C[c*3+1]=F[i+1];C[c*3+2]=F[i+2]}
  for(let it=0;it<10;it++){
    for(let c=0;c<nc;c++){
      const s0=st[c],s1=st[c+1],c3=c*3;
      if(s1===s0){T[c3]=C[c3];T[c3+1]=C[c3+1];T[c3+2]=C[c3+2];continue}
      let x=0,y=0,z=0;for(let k=s0;k<s1;k++){const q=adj[k]*3;x+=C[q];y+=C[q+1];z+=C[q+2]}
      const m=.6/(s1-s0);T[c3]=C[c3]*.4+x*m;T[c3+1]=C[c3+1]*.4+y*m;T[c3+2]=C[c3+2]*.4+z*m;
    }
    C.set(T);
  }
  for(let v=0;v<PT.n;v++){const c=PT.canon[v]*3;F[v*3]=C[c];F[v*3+1]=C[c+1];F[v*3+2]=C[c+2]}
}
function nearestVerts(PT,bp){
  // Spatial hash keeps underwear-to-body matching practical on dense meshes.
  const a=PT.rest,b=bp.rest,out=new Uint32Array(PT.n),m=bp.n,cell=.025,grid=new Map();
  const key=(x,y,z)=>`${Math.floor(x/cell)},${Math.floor(y/cell)},${Math.floor(z/cell)}`;
  for(let j=0;j<m;j++){const k=key(b[j*3],b[j*3+1],b[j*3+2]);let q=grid.get(k);if(!q)grid.set(k,q=[]);q.push(j)}
  for(let i=0;i<PT.n;i++){
    const x=a[i*3],y=a[i*3+1],z=a[i*3+2],gx=Math.floor(x/cell),gy=Math.floor(y/cell),gz=Math.floor(z/cell);let bd=Infinity,bi=0;
    for(let rad=0;rad<8;rad++){
      for(let xx=gx-rad;xx<=gx+rad;xx++)for(let yy=gy-rad;yy<=gy+rad;yy++)for(let zz=gz-rad;zz<=gz+rad;zz++){
        if(rad&&Math.max(Math.abs(xx-gx),Math.abs(yy-gy),Math.abs(zz-gz))!==rad)continue;
        const q=grid.get(`${xx},${yy},${zz}`);if(!q)continue;
        for(const j of q){const dx=b[j*3]-x,dy=b[j*3+1]-y,dz=b[j*3+2]-z,d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;bi=j}}
      }
      if(bd<Infinity&&bd<Math.pow(rad*cell,2))break;
    }
    out[i]=bi;
  }
  return out;
}
function procApply(){
  const P=HUM.proc,bp=HUM.bodyP;
  if(!bp||!HUM.dim||!P||!Object.keys(P).length)return;
  if(!bp.RW)buildRW(bp);
  for(const PT of HUM.parts)if(PT!==bp&&!PT.near)PT.near=nearestVerts(PT,bp);
  procField(bp,P);smoothField(bp,bp.pf);
  const F=bp.pf;
  for(const PT of HUM.parts){
    const r=PT.rest;
    if(PT===bp)for(let i=0;i<F.length;i++)r[i]+=F[i];
    else for(let v=0;v<PT.n;v++){const j=PT.near[v]*3;r[v*3]+=F[j];r[v*3+1]+=F[j+1];r[v*3+2]+=F[j+2]}
    gluteBump(PT,P.glutes||0);thighBack(PT,P.thighB||0,P.glutes||0);
  }
}
const GLUTE_K=.2;   // internal gain on the glutes slider
const GL={y:.5,up:.085,down:.08,w:.06,cx:.047,back:.05,lift:.01,pow:.38,powUp:1.7,hollow:.3,gW:.5,gUp:.5,gDown:.9,gCx:.2};   // fractions of body height; fuller lower falloff
const lerpG=(a,b,t)=>a+(b-a)*t;
function gluteBump(PT,g){
  if(!g)return;
  const {y0,H,fs,cz}=HUM.dim,r=PT.rest,a=Math.min(1,Math.abs(g));
  // Match added glute volume to the active human height morph (shorter/taller).
  const hs=1+Math.max(-1,Math.min(1,Number(hm.height)||0))*.12,A=g*GLUTE_K*hs;
  const w=GL.w*hs*(1+GL.gW*a),up=GL.up*hs*(1+GL.gUp*a),dn=GL.down*hs*(1+GL.gDown*a),cx=GL.cx*hs*(1+GL.gCx*a),hc=GL.y+up*1.1;
  for(let i=0;i<PT.n;i++){
    const t=(r[i*3+1]-y0)/H;if(t<GL.y-dn||t>hc+.12)continue;
    const m=sstep(0,.04,(cz-r[i*3+2])*fs/H);if(m<=0)continue;
    const ax=Math.abs(r[i*3])/H,dx=(ax-cx)/w,du=Math.max(0,(t-GL.y)/up),dy=t>GL.y?du:(t-GL.y)/dn,q=1-dx*dx-dy*dy;
    let zb=0,yy=0;
    if(q>0){const k=Math.pow(q,lerpG(GL.pow,GL.powUp,sstep(0,.7,du)))*sstep(0,.2,q)*m*A;zb=GL.back*k;yy=GL.lift*k}
    zb-=GL.hollow*GL.back*A*gau(t,hc,.04)*(1-sstep(.06,.16,ax))*m;
    r[i*3+2]-=fs*H*zb;r[i*3+1]+=H*yy;
  }
}
const TB={top:.49,mid:.40,bot:.30,rad:.058,back:.03}; // posterior thigh blends into the lower glute instead of forming a second shelf
function thighBack(PT,v,g=0){
  if(!v)return;
  const {y0,H,fs,cz,tx}=HUM.dim,r=PT.rest;
  // Scale posterior-thigh width and depth with the same active height morph as the glutes.
  const hs=1+Math.max(-1,Math.min(1,Number(hm.height)||0))*.12;
  // Keep the thigh's own footprint independent of glute slider/radius.
  // Use a fixed anatomical seam so increasing glutes cannot erase thigh fullness.
  const gluteLower=GL.y-GL.down;
  for(let i=0;i<PT.n;i++){
    const t=(r[i*3+1]-y0)/H;if(t<TB.bot||t>TB.top+.035)continue;
    const dx=(Math.abs(r[i*3])-tx)/(TB.rad*hs*H);if(dx*dx>=1)continue;
    const m=sstep(-.03,.01,(cz-r[i*3+2])*fs/H);if(m<=0)continue;
    const f=sstep(TB.bot,TB.mid,t)*(1-sstep(TB.top-.01,TB.top+.035,t));
    // Treat posterior-thigh fullness as a continuation of the lower glute:
    // where the glute already has a strong footprint, smoothly yield to it;
    // below its falloff, the thigh adds supporting mass without a second shelf.
    // Fade only across the fixed seam; do not subtract thigh volume where
    // the glute bump grows, since that made the thighs look artificially smaller.
    const blend=1-sstep(gluteLower-.035,gluteLower+.085,t);
    r[i*3+2]-=fs*TB.back*hs*H*v*f*blend*m*Math.pow(1-dx*dx,1.5);
  }
}


/* ===== FORM v6: camera, theme, pose library, BVH ===== */
controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;
controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
dom.addEventListener('auxclick',e=>e.preventDefault());

/* theme */
function setTheme(t,sync){
  document.documentElement.dataset.theme=t;$('#theme').value=t;
  try{localStorage.setItem('form-theme',t)}catch(e){}
  hMats.idle.color.set(t==='light'?0x55524d:0xf0e6d8);hMats.hot.color.set(t==='light'?0x000000:0xffffff);
  if(sync){opts.bg=t==='light'?'light':'dark';$('#bg').value=opts.bg;setBg(opts.bg);queueSave()}
}
$('#theme').onchange=e=>setTheme(e.target.value,true);
{let t=null;try{t=localStorage.getItem('form-theme')}catch(e){}
 setTheme(t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),true)}

/* pose library */
let lib=[],bvh=null;try{lib=JSON.parse(localStorage.getItem('form-poselib')||'[]')}catch(e){}
const libNote=t=>{$('#libStat').textContent=t};
const saveLib=()=>{try{localStorage.setItem('form-poselib',JSON.stringify(lib))}catch(e){libNote('Library storage is full. Export it, then delete some poses.')}};
const poseCopy=()=>JSON.parse(JSON.stringify(pose));
const dlJSON=(o,n)=>dl(new Blob([JSON.stringify(o)],{type:'application/json'}),n);
function applyLib(p){
  const np=defaultPose();
  for(const jk in JD)for(const d of JD[jk].dof){const v=p&&p[jk]&&p[jk][d.key];if(Number.isFinite(v))np[jk][d.key]=clamp(v,d.min,d.max)}
  pose=np;syncUI();applyAll();save();commit();commitGuard();
}
function renderLib(){
  const box=$('#libList'),f=$('#libFilter').value.toLowerCase();box.innerHTML='';
  lib.forEach((e,i)=>{
    if(f&&!e.name.toLowerCase().includes(f))return;
    const r=document.createElement('div'),a=document.createElement('button'),x=document.createElement('button');r.className='li';
    a.textContent=e.name;a.onclick=()=>applyLib(e.pose);
    x.textContent='×';x.title='Delete';x.onclick=()=>{lib.splice(i,1);saveLib();renderLib()};
    r.append(a,x);box.appendChild(r);
  });
  if(!box.children.length)box.innerHTML='<p class="note">'+(lib.length?'No match.':'No poses yet. Import a pack or a .bvh file, or save the current pose.')+'</p>';
}
$('#libFilter').oninput=renderLib;
$('#libSave').onclick=()=>{const n=prompt('Pose name?');if(n){lib.push({name:n.slice(0,60),pose:poseCopy()});saveLib();renderLib()}};
$('#libExpPose').onclick=()=>dlJSON({format:'form-pose',v:3,pose:poseCopy(),root:rootState()},'pose.json');
$('#libExpAll').onclick=()=>dlJSON({format:'form-poses',poses:lib},'form-poses.json');
$('#libImport').onclick=()=>$('#libFile').click();
$('#libFile').onchange=async e=>{const fs=[...e.target.files];e.target.value='';for(const f of fs)await ingest(await f.text(),f.name)};
$('#libUrl').onkeydown=async e=>{
  if(e.key!=='Enter')return;const u=e.target.value.trim();if(!u)return;
  try{const r=await fetch(u);if(!r.ok)throw Error(r.status);await ingest(await r.text(),u.split('/').pop().split('?')[0]||'pose');e.target.value=''}
  catch(err){libNote('Could not fetch that link ('+err.message+'). The host must allow cross-origin requests; raw.githubusercontent.com and jsDelivr do.')}
};
async function ingest(text,name){
  const nm=name.replace(/\.[^.]+$/,'');
  if(/^\s*HIERARCHY/.test(text)){bvhLoad(text,nm);return}
  let o;try{o=JSON.parse(text)}catch(e){libNote('That is not a .bvh file or valid JSON.');return}
  if(o.format==='cuteboii-project'||o.format==='cuteboii-body'){openObj(o);return}
  if(Array.isArray(o.poses)){
    let n=0;for(const p of o.poses)if(p&&p.pose&&p.pose.head){lib.push({name:String(p.name||nm+' '+(n+1)).slice(0,60),pose:p.pose});n++}
    saveLib();renderLib();libNote(n+' poses added.');return;
  }
  if(o.pose&&o.pose.head){applyLib(o.pose)}
  else{const msg=importPose(o);if(msg.startsWith('No joint')){libNote(msg);return}syncUI();applyAll();save();commit()}
  lib.push({name:nm,pose:poseCopy()});saveLib();renderLib();libNote('Pose added to the library.');
}

/* BVH import: position-based retarget (works whatever the file's rest pose or axes) */
const BR=[[/^(hips|root|pelvis)$/,'pelvis'],[/femur|upleg|upperleg|thigh/,'hip'],[/tibia|calf|shin|lowerleg|leg$/,'knee'],[/foot|ankle/,'ankle'],
  [/radius|forearm|lowerarm/,'elbow'],[/wrist|hand/,'wrist'],[/head$/,'head'],[/neck/,'neck']];
const SIDE_T='(hipjoint|femur|tibia|foot|toe|clav|humerus|radius|wrist|hand|finger|thumb|upleg|upperleg|leg|arm|forearm|lowerarm|shoulder|thigh|calf|collar)';
const sideOf=s=>new RegExp('^left|^l'+SIDE_T+'|[._\\- ]l$|[._\\- ]left').test(s)?'L':new RegExp('^right|^r'+SIDE_T+'|[._\\- ]r$|[._\\- ]right').test(s)?'R':null;
function parseBVH(txt){
  const tk=txt.split(/\s+/).filter(Boolean),J=[],st=[];let i=0,nc=0,cur=null;
  while(i<tk.length&&tk[i]!=='MOTION'){
    const t=tk[i++];
    if(t==='ROOT'||t==='JOINT'){cur={name:tk[i++],par:st[st.length-1]||null,off:[0,0,0],ch:[],c0:0,idx:J.length};J.push(cur)}
    else if(t==='End'){i++;cur={end:true}}
    else if(t==='{')st.push(cur);
    else if(t==='}')st.pop();
    else if(t==='OFFSET'){if(!cur.end)cur.off=[+tk[i],+tk[i+1],+tk[i+2]];i+=3}
    else if(t==='CHANNELS'){const n=+tk[i++];cur.ch=tk.slice(i,i+n);cur.c0=nc;nc+=n;i+=n}
  }
  if(i>=tk.length)throw Error('no MOTION section');
  i++;if(!/Frames/.test(tk[i]||''))throw Error('no frame count');
  i++;const N=+tk[i++];i+=3;
  const fr=new Float32Array(N*nc);for(let k=0;k<fr.length;k++)fr[k]=+tk[i+k];
  if(!J.length||!fr.length||!isFinite(fr[0]))throw Error('empty or malformed');
  return {J,N,nc,fr};
}
const _bt=new THREE.Matrix4();
function bvhFK(B,f){
  const W=[],o=f*B.nc;
  for(const j of B.J){
    const m=new THREE.Matrix4().makeTranslation(j.off[0],j.off[1],j.off[2]);
    j.ch.forEach((c,k)=>{
      const v=B.fr[o+j.c0+k],a=c[0].toUpperCase();
      if(/position/i.test(c))m.multiply(_bt.makeTranslation(a==='X'?v:0,a==='Y'?v:0,a==='Z'?v:0));
      else{const r=v*DEG;m.multiply(a==='X'?_bt.makeRotationX(r):a==='Y'?_bt.makeRotationY(r):_bt.makeRotationZ(r))}
    });
    if(j.par)m.premultiply(W[j.par.idx]);
    W.push(m);
  }
  return W;
}
function bvhRoles(B){
  const R={};
  for(const j of B.J){
    const s=j.name.toLowerCase().replace(/^.*[:|]/,''),hit=BR.find(([re])=>re.test(s));if(!hit)continue;
    const central=/^(pelvis|head|neck)$/.test(hit[1]),sd=central?'':sideOf(s);
    if(!central&&!sd)continue;
    const key=hit[1]+sd;if(!(key in R))R[key]=j.idx;
  }
  return R;
}
function bvhApply(f){
  const B=bvh.B,R=bvh.R,W=bvhFK(B,f),P=k=>R[k]===undefined?null:new V3().setFromMatrixPosition(W[R[k]]);
  const pp=P('pelvis'),nk=P('neck'),hd=P('head');
  if(!pp||!nk) {libNote('This BVH frame is missing pelvis or neck positions.');return}
  const ax=new V3().subVectors(P('hipL'),P('hipR')).normalize(),ay=new V3().subVectors(nk,pp);
  ay.addScaledVector(ax,-ay.dot(ax)).normalize();const az=new V3().crossVectors(ax,ay);
  const loc=p=>{const d=p.clone().sub(pp);return new V3(d.dot(ax),d.dot(ay),d.dot(az))};
  const mm=opts.mirror;opts.mirror=false;
  pose=defaultPose();applyPose();
  const o0=jpos('pelvis'),ours=jpos('neck').distanceTo(o0)+(jpos('ankleL').distanceTo(o0)+jpos('ankleR').distanceTo(o0))/2;
  const theirs=nk.distanceTo(pp)+(P('ankleL').distanceTo(pp)+P('ankleR').distanceTo(pp))/2,s=ours/theirs;
  const T=p=>loc(p).multiplyScalar(s).applyQuaternion(figure.quaternion).add(o0);
  for(let pass=0;pass<2;pass++){
    ikSolve(IKD.chest,T(nk));
    if(hd){const dir=loc(hd).sub(loc(nk)).normalize().applyQuaternion(figure.quaternion);ikSolve(IKD.head,T(hd).addScaledVector(dir,effHead().distanceTo(jpos('head'))))}
    for(const S of ['L','R'])for(const k of ['elbow','wrist','knee','ankle']){const p=P(k+S);if(p)ikSolve(IKD[k+S],T(p))}
  }
  opts.mirror=mm;
  syncUI();applyAll();save();commit();commitGuard();
}
function bvhLoad(txt,name){
  let B;try{B=parseBVH(txt)}catch(e){libNote('Could not read that BVH ('+e.message+').');return}
  const R=bvhRoles(B),miss=['pelvis','neck','hipL','hipR','kneeL','kneeR','ankleL','ankleR'].filter(k=>R[k]===undefined);
  if(miss.length){libNote('Skeleton not recognised. Missing: '+miss.join(', ')+'.');return}
  if(!rigReady()){libNote('Load a model with a working rig first.');return}
  bvh={B,R,name,f:0};
  const box=$('#bvhBox');box.innerHTML='';
  if(B.N>1)slider(box,{label:'Mocap frame (of '+B.N+')',min:0,max:B.N-1,step:1,value:0,def:0,lo:'start',hi:'end',onInput:v=>{bvh.f=v},onChange:()=>bvhApply(bvh.f)});
  const b=document.createElement('button');b.textContent='Save this pose to library';
  b.onclick=()=>{lib.push({name:name+(B.N>1?' #'+bvh.f:''),pose:poseCopy()});saveLib();renderLib()};
  box.appendChild(b);
  bvhApply(0);libNote(B.N>1?'Loaded. Move the frame slider and release to apply.':'Loaded.');
}
renderLib();
/* ===== v7: Thai, projects, body configs, persistent history ===== */
const store=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch(e){return d}};
const prjNote=t=>{$('#prjStat').textContent=t};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){prjNote('Browser storage is full. Download the file instead.');return false}};
const clone=o=>JSON.parse(JSON.stringify(o));
let prjs=store('cb-projects',[]),bods=store('cb-bodies',[]);

/* props <-> data */
const propsState=()=>props.map(g=>({n:g.userData.prop,p:g.position.toArray().map(v=>+v.toFixed(4)),q:g.quaternion.toArray().slice(0,4).map(v=>+v.toFixed(5)),s:g.scale.toArray().map(v=>+v.toFixed(4))}));
function restoreProps(list){
  props.slice().forEach(rmProp);gz.prop=null;
  for(const e of list||[]){if(!PROPS[e.n])continue;addProp(e.n);const g=gz.prop;g.position.fromArray(e.p);g.quaternion.fromArray(e.q);g.scale.fromArray(e.s)}
  gz.prop=null;gizmoSet();propUI();
}

/* body config */
const bodyState=name=>clone({format:'cuteboii-body',v:1,name,saved:Date.now(),mode:opts.mode,body,hm,hx});
function applyBody(o){
  const keep=pose,r=rootState();
  loadState({body:o.body,hm:o.hm,hx:o.hx});pose=keep;setRoot(r);
  if(o.mode&&o.mode!==opts.mode)setMode(o.mode==='human'?'human':'man');
  syncUI();applyAll();save();commit();commitGuard();
}

/* project */
const projState=name=>clone({format:'cuteboii-project',v:1,name,saved:Date.now(),mode:opts.mode,body,hm,hx,pose,root:rootState(),props:propsState(),
  cam:{p:camera.position.toArray(),t:controls.target.toArray()},look:{shading:opts.shading,bg:opts.bg}});
function openProject(o){
  const m=o.mode==='human'?'human':'man';if(m!==opts.mode)setMode(m);
  loadState(o);restoreProps(o.props);
  if(o.look){if(o.look.shading){opts.shading=o.look.shading;mats=buildMats(opts.shading);$('#shading').value=opts.shading}
             if(o.look.bg){opts.bg=o.look.bg;$('#bg').value=opts.bg;setBg(opts.bg)}}
  if(o.cam&&o.cam.p&&o.cam.t){camera.position.fromArray(o.cam.p);controls.target.fromArray(o.cam.t);controls.update()}
  syncUI();applyAll();refreshMats();save();commit();commitGuard();
}
function openObj(o){
  if(o.format==='cuteboii-project'){openProject(o);prjNote('Project opened: '+(o.name||''))}
  else if(o.format==='cuteboii-body'){applyBody(o);prjNote('Body config applied: '+(o.name||''))}
}
function renderList(box,arr,key,onOpen){
  box.innerHTML='';
  arr.forEach((e,i)=>{
    const r=document.createElement('div'),a=document.createElement('button'),x=document.createElement('button');r.className='li';
    a.textContent=e.name+' · '+new Date(e.saved||0).toLocaleDateString();a.onclick=()=>onOpen(e);
    x.textContent='×';x.onclick=()=>{arr.splice(i,1);put(key,arr);renderList(box,arr,key,onOpen)};
    r.append(a,x);box.appendChild(r);
  });
  if(!arr.length)box.innerHTML='<p class="note">Nothing saved yet.</p>';
}
const renderPrj=()=>renderList($('#prjList'),prjs,'cb-projects',openObj);
const renderBod=()=>renderList($('#bodyList'),bods,'cb-bodies',openObj);
const nameOf=(id,d)=>($(id).value||'').trim().slice(0,60)||d+' '+new Date().toLocaleString();
$('#prjSave').onclick=()=>{const n=nameOf('#prjName','Project');const i=prjs.findIndex(p=>p.name===n),p=projState(n);if(i>=0)prjs[i]=p;else prjs.unshift(p);put('cb-projects',prjs);renderPrj();prjNote('Saved.')};
$('#prjDl').onclick=()=>dlJSON(projState(nameOf('#prjName','Project')),'cuteboii-project.json');
$('#bodySave').onclick=()=>{const n=nameOf('#bodyName','Body');const i=bods.findIndex(p=>p.name===n),b=bodyState(n);if(i>=0)bods[i]=b;else bods.unshift(b);put('cb-bodies',bods);renderBod();prjNote('Saved.')};
$('#bodyDl').onclick=()=>dlJSON(bodyState(nameOf('#bodyName','Body')),'cuteboii-body.json');
$('#prjOpen').onclick=()=>$('#prjFileIn').click();
$('#prjFileIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(f)await ingest(await f.text(),f.name)};
renderPrj();renderBod();

/* persistent history + autosaved props */
{
  const s=store('cb-history',null);
  if(s&&Array.isArray(s.h)&&s.h.length){hist.length=0;hist.push(...s.h);hi=Math.min(Math.max(0,s.i),hist.length-1);commit()}
  restoreProps(store('cb-props',[]));
  let sig='';
  setInterval(()=>{
    const ps=propsState(),k=hist.length+':'+hi+':'+hist[hi]?.length+':'+JSON.stringify(ps);if(k===sig)return;sig=k;
    const cut=hist.slice(-40),offset=hist.length-cut.length;
    put('cb-history',{i:Math.max(0,hi-offset),h:cut});put('cb-props',ps);
  },2000);
  $('#histClear').onclick=()=>{const cur=hist[hi];hist.length=0;hist.push(cur);hi=0;put('cb-history',{i:0,h:[cur]});prjNote('History cleared.')};
}

let lang='en';const EN=new WeakMap(),OUT=new WeakMap();
function trNode(n){
  if(OUT.get(n)===n.nodeValue)return;
  if(n.parentElement&&n.parentElement.closest('.li'))return;
  EN.set(n,n.nodeValue);OUT.delete(n);
  if(lang!=='th')return;
  const v=tr(n.nodeValue);if(v!==n.nodeValue){n.nodeValue=v;OUT.set(n,v)}
}
const textWalker=root=>document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
function walk(root){const w=textWalker(root);let n;while(n=w.nextNode())trNode(n)}
function trAttrs(){
  for(const el of document.querySelectorAll('[placeholder],[title]')){
    for(const attr of ['placeholder','title']){
      if(!el.hasAttribute(attr))continue;
      const dk=attr==='placeholder'?'enph':'entitle';
      if(el.dataset[dk]===undefined)el.dataset[dk]=el.getAttribute(attr);
      const source=el.dataset[dk],value=lang==='th'?tr(source):source;
      if(el.getAttribute(attr)!==value)el.setAttribute(attr,value);
    }
  }
}
function setLang(l){
  lang=l;try{localStorage.setItem('cb-lang',l)}catch(e){}
  $('#lang').value=l;document.documentElement.lang=l;
  if(l==='en'){const w=textWalker(document.body);let n;while(n=w.nextNode())if(OUT.has(n)&&OUT.get(n)===n.nodeValue){n.nodeValue=EN.get(n);OUT.delete(n)}}
  else walk(document.body);
  trAttrs();
  if(typeof updateWelcomeCopy==='function')updateWelcomeCopy(l);
}
$('#lang').onchange=e=>setLang(e.target.value);
new MutationObserver(ms=>{for(const m of ms){
  if(m.type==='characterData')trNode(m.target);
  else m.addedNodes.forEach(a=>a.nodeType===3?trNode(a):a.nodeType===1&&walk(a));
}}).observe(document.body,{childList:true,subtree:true,characterData:true});
const updateWelcomeCopy=initWelcome($);
{let l=null;try{l=localStorage.getItem('cb-lang')}catch(e){}setLang(l||(/^th/i.test(navigator.language||'')?'th':'en'))}
