import React, { useState, useMemo, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v5 — v24 model + subskill editor
// ═══════════════════════════════════════════════════════════════════════════

// ─── Engine (v24 model, April 2026) ───────────────────────────────────────
const _K1=93,_K2=96,_SL=13,_R=100/18,_U=18,_MX=18;
const _B={pace:99,striker:90,technique:82,defending:82,playmaking:75,passing:75};
const OS=["pace","technique","passing","defending","playmaking","striker"];
const SN={pace:"PAC",technique:"TEC",passing:"PAS",defending:"DEF",playmaking:"PLM",striker:"STR"};
const _XD=Math.round(_K2*_K1/100);
const _XG=Math.round(_K2*_K1*15/10000);

function _fromYS(ys){const db=(300/ys-10)*100/90;return Math.max(0,Math.min(100,db));}
function _te(td){return(40+60*td/100)/100;}
function _dt(sk,lv,a,te){const db=(lv+0.5)*_R;return(_B[sk]/75)*(100+0.5*db*(a-15))/te;}
function _duc(sk,lv,a,te){return _dt(sk,lv,a,te)/_U;}
function _mk(lv,du=0,xp=0){return{lv,du,xp};}
function _mkSub(lv,sub,sk,a,te){
  const tot=sub*_dt(sk,lv,a,te),c=_duc(sk,lv,a,te);
  const d=Math.min(Math.floor(tot/c),_U-1);return _mk(lv,d,tot-d*c);
}
function _applyXp(s,xp,sk,a,te){
  s.xp+=xp;const p=[];
  while(s.lv<_MX){const c=_duc(sk,s.lv,a,te);if(s.xp<c)break;s.xp-=c;s.du++;
    if(s.du>=_U){s.du=0;s.lv++;p.push(s.lv);}}return p;
}
function _sub(s,sk,a,te){const f=_dt(sk,s.lv,a,te);if(f<=0)return 1;return(s.du*(f/_U)+s.xp)/f;}
function _tdb(s,sk,a,te){
  const i=s.lv*_R+s.du*(_R/_U);if(!sk)return i;
  const c=_duc(sk,s.lv,a,te);return c<=0?i:i+(s.xp/c)*(_R/_U);
}
function _xtm(s,sk,a,te){
  if(s.lv>=_MX)return 0;let n=_duc(sk,s.lv,a,te)-s.xp;
  for(let d=s.du+1;d<_U;d++)n+=_duc(sk,s.lv,a,te);
  for(let l=s.lv+1;l<_MX;l++)n+=_dt(sk,l,a,te);return n;
}
function _gwm(s,sk,a,te,w){return s.lv>=_MX?true:w<=0?false:w*_XG>=_xtm(s,sk,a,te);}
function _initSt(skills,a,te,subs){
  const st={};for(const sk of OS)st[sk]=_mkSub(skills[sk]||0,subs?.[sk]??0.25,sk,a,te);return st;
}
function _ageAfter(a,sw,wks){let s=sw,ag=a;for(let i=0;i<wks;i++){s++;if(s>_SL){s=1;ag++;}}return ag;}

// ─── Positions ─────────────────────────────────────────────────────────────
const POS={
  DEF:{name:"DEF",w:{pace:1,technique:.5,passing:.5,defending:1,playmaking:.5,striker:0},d:"Defender"},
  MID:{name:"MID",w:{pace:1,technique:1,passing:1,defending:1,playmaking:1,striker:0},d:"Midfielder"},
  ATT:{name:"ATT",w:{pace:1,technique:1,passing:.5,defending:.5,playmaking:.5,striker:1},d:"Attacker"},
  WING:{name:"WING",w:{pace:1,technique:1,passing:1,defending:.5,playmaking:1,striker:0},d:"Winger"},
};
function _crit(p){return OS.filter(s=>p.w[s]===1);}
function _anyRem(st,p,a,te){
  let b=null,bs=-1;for(const sk of OS){const w=p.w[sk]||0;
    if(w>0&&st[sk].lv<_MX){const c=_dt(sk,st[sk].lv,a,te);
      const s=c>0?w*(_XD-_XG)/c:0;if(s>bs){bs=s;b=sk;}}}return b;
}

// ─── Strategy pickers ──────────────────────────────────────────────────────
function _rr(st,a,p,ctx,te){
  const cr=_crit(p);if(!cr.length)return _anyRem(st,p,a,te);
  if(ctx.i==null)ctx.i=0;for(let x=0;x<cr.length;x++){
    const sk=cr[ctx.i%cr.length];ctx.i++;if(st[sk].lv<_MX)return sk;}
  return _anyRem(st,p,a,te);
}
function _ch(st,a,p,ctx,te){
  let b=null,bc=1e9;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const c=_dt(sk,st[sk].lv,a,te);if(c<bc){bc=c;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _ex(st,a,p,ctx,te){
  let b=null,bc=-1;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const c=_dt(sk,st[sk].lv,a,te);if(c>bc){bc=c;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _ctp(st,a,p,ctx,te){
  let b=null,bf=-1;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const f=_sub(st[sk],sk,a,te);if(f>bf){bf=f;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _pf(tgt){return(st,a,p,ctx,te)=>{
  if(st.pace.lv<tgt)return"pace";const cr=_crit(p).filter(s=>s!=="pace");
  if(ctx.p2==null)ctx.p2=0;for(let x=0;x<cr.length;x++){
    const sk=cr[ctx.p2%cr.length];ctx.p2++;if(st[sk].lv<_MX)return sk;}
  if(st.pace.lv<_MX)return"pace";return _anyRem(st,p,a,te);};}


function _ll(st,a,p,ctx,te){
  // pick_lowest: two-tier maximin — lowest primary first, secondaries only when all primaries maxed
  const prim=_crit(p).filter(s=>st[s].lv<_MX);
  const sec=OS.filter(s=>p.w[s]>0&&p.w[s]<1&&st[s].lv<_MX);
  const pool=prim.length?prim:sec;
  if(!pool.length)return null;
  return pool.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
}
function _bal(st,a,p,ctx,te){
  // balanced 2:1: primaries get 2x slots vs secondaries; maximin within tier
  const prim=_crit(p);const sec=OS.filter(s=>p.w[s]>0&&p.w[s]<1);
  const nPri=prim.length,nSec=sec.length;
  const cycLen=2*nPri+nSec;if(cycLen===0)return null;
  if(ctx.bs==null)ctx.bs=0;
  const slot=ctx.bs%cycLen;ctx.bs++;
  const priAct=prim.filter(s=>st[s].lv<_MX);
  const secAct=sec.filter(s=>st[s].lv<_MX);
  if(slot<2*nPri){
    if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
    if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }else{
    if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
    if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }
  return null;
}
function _pb(st,a,p,ctx,te,rem){
  // positional_balanced: primaries via gt-will-max, then secondaries self-level
  const prim=_crit(p);const sec=OS.filter(s=>p.w[s]>0&&p.w[s]<1);
  if(ctx.pbPhase==null)ctx.pbPhase=1;
  if(ctx.pbPhase===1){
    const needs=prim.filter(s=>st[s].lv<_MX&&!_gwm(st[s],s,a,te,rem||0));
    if(!needs.length){ctx.pbPhase=2;}
    else return needs.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }
  const secAct=sec.filter(s=>st[s].lv<_MX);
  if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  const priAct=prim.filter(s=>st[s].lv<_MX);
  if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  return null;
}

const STRATS={
  round_robin:{name:"Round-Robin",fn:_rr,desc:"Rotate critical skills evenly"},
  cheapest_first:{name:"Cheapest First",fn:_ch,desc:"Train easiest skill to pop next"},
  most_expensive:{name:"Most Expensive",fn:_ex,desc:"Front-load the hardest skill"},
  closest_to_pop:{name:"Closest to Pop",fn:_ctp,desc:"Train skill nearest to next level-up"},
  pace_16_rr:{name:"Pace→16 + RR",fn:_pf(16),desc:"Rush pace to 16, then round-robin"},
  pace_15_rr:{name:"Pace→15 + RR",fn:_pf(15),desc:"Rush pace to 15, then round-robin"},
  pick_lowest:{name:"Pick Lowest",fn:_ll,desc:"Lowest primary first, secondaries only when primaries maxed",validPos:null},
  balanced:{name:"Balanced (2:1)",fn:_bal,desc:"Primaries 2× slots vs secondaries; maximin within each tier",validPos:["DEF","ATT","WING"]},
  positional_balanced:{name:"Positional→Balanced",fn:_pb,desc:"Primaries via GT-will-max (lowest-first), then secondaries self-level",validPos:["DEF","ATT","WING"]},
};

// ─── Core Simulation ───────────────────────────────────────────────────────
function runPlan(skills,td,age,ssw,pos,strat,weeks,subs){
  const prof=POS[pos],fn=STRATS[strat].fn,te=_te(td);
  const st=_initSt(skills,age,te,subs);
  const startSk={};for(const sk of OS)startSk[sk]=st[sk].lv;
  let sw=ssw,ca=age,wk=0;const ctx={},log=[],mx={};
  while(wk<weeks){
    const rem=weeks-wk;let tr=fn(st,ca,prof,ctx,te,rem);if(!tr)break;
    if(tr&&_gwm(st[tr],tr,ca,te,rem)){let alt=null,ac=-1;
      for(const sk of OS){const w=prof.w[sk]||0;
        if(w>0&&st[sk].lv<_MX&&!_gwm(st[sk],sk,ca,te,rem)){
          const sc=w*_dt(sk,st[sk].lv,ca,te);if(sc>ac){ac=sc;alt=sk;}}}
      if(alt)tr=alt;}
    wk++;const g={},wp=[];
    for(const sk of OS){if(st[sk].lv>=_MX){g[sk]=0;continue;}
      const xp=sk===tr?_XD:_XG;g[sk]=xp;
      for(const l of _applyXp(st[sk],xp,sk,ca,te)){wp.push([sk,l]);
        if(l>=_MX&&!(sk in mx))mx[sk]=[wk,ca];}}
    log.push({week:wk,age:ca,sw,trained:tr,
      levels:Object.fromEntries(OS.map(sk=>[sk,st[sk].lv])),
      subs:Object.fromEntries(OS.map(sk=>[sk,_sub(st[sk],sk,ca,te)])),
      gains:g,pops:wp});
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  const fsk={},fdb={};
  for(const sk of OS){fsk[sk]=st[sk].lv;fdb[sk]=_tdb(st[sk],sk,ca,te);}
  return{log,finalSkills:fsk,finalDb:fdb,totalWeeks:wk,maxedAt:mx,startSkills:startSk,startAge:age,isSale:false};
}

// ─── Sale Optimizer ────────────────────────────────────────────────────────
function _simSched(sched,skills,td,age,ssw,subs,prof){
  const te=_te(td);const st=_initSt(skills,age,te,subs);
  let sw=ssw,ca=age;const log=[];
  for(let i=0;i<sched.length;i++){
    const tr=sched[i],wk=i+1,g={},wp=[];
    for(const sk of OS){if(st[sk].lv>=_MX){g[sk]=0;continue;}
      const xp=sk===tr?_XD:_XG;g[sk]=xp;
      for(const l of _applyXp(st[sk],xp,sk,ca,te))wp.push([sk,l]);}
    log.push({week:wk,age:ca,sw,trained:tr,
      levels:Object.fromEntries(OS.map(sk=>[sk,st[sk].lv])),
      subs:Object.fromEntries(OS.map(sk=>[sk,_sub(st[sk],sk,ca,te)])),
      gains:g,pops:wp});
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  return{states:st,log};
}
function _ci(s,sk,a,te){if(s.lv>=_MX)return 0;return s.du*_duc(sk,s.lv,a,te)+s.xp;}
function _tci(st,prof,a,te){let t=0;for(const sk of OS){const w=prof.w[sk]||0;if(w>0)t+=w*_ci(st[sk],sk,a,te);}return t;}
function _buildRR(n,prof){
  const cr=_crit(prof).length?_crit(prof):OS.filter(s=>(prof.w[s]||0)>0);
  if(!cr.length)return OS.slice(0,n);return Array.from({length:n},(_,i)=>cr[i%cr.length]);
}

function runSaleOpt(skills,td,age,deadWeeks,pos,subs,ssw,maxExt=3){
  const prof=POS[pos],te=_te(td);
  const wsk=OS.filter(sk=>(prof.w[sk]||0)>0);
  let best=_buildRR(deadWeeks,prof),extUsed=0,totSwaps=0;
  for(let er=0;er<=maxExt;er++){
    const curLen=deadWeeks+extUsed;let sched=[...best];const pre=[...sched];
    for(let it=0;it<curLen;it++){
      const{states}=_simSched(sched,skills,td,age,ssw,subs,prof);
      const fa=_ageAfter(age,ssw,curLen);
      const sc={};for(const sk of wsk)sc[sk]=states[sk].lv>=_MX?0:_sub(states[sk],sk,fa,te);
      let tgt=null,tf=-1;for(const sk of wsk){if(states[sk].lv<_MX&&sc[sk]>tf){tf=sc[sk];tgt=sk;}}
      if(!tgt)break;
      const srcs=wsk.filter(sk=>sk!==tgt&&sc[sk]>0.15).sort((a,b)=>sc[b]-sc[a]);
      let swapped=false;
      for(const src of srcs){let li=null;for(let w=sched.length-1;w>=0;w--)if(sched[w]===src){li=w;break;}
        if(li==null)continue;sched[li]=tgt;totSwaps++;swapped=true;break;}
      if(!swapped)break;
    }
    const{states:sn}=_simSched(sched,skills,td,age,ssw,subs,prof);
    const{states:so}=_simSched(pre,skills,td,age,ssw,subs,prof);
    const fa=_ageAfter(age,ssw,curLen);
    if(_tci(sn,prof,fa,te)>=_tci(so,prof,fa,te)-0.01){sched=[...pre];totSwaps=0;}
    best=sched;
    if(er>=maxExt)break;
    const{states:bs}=_simSched(best,skills,td,age,ssw,subs,prof);
    const fAge=_ageAfter(age,ssw,best.length);
    const carry={};for(const sk of wsk)carry[sk]=_ci(bs[sk],sk,fAge,te);
    const hsk=wsk.reduce((a,b)=>carry[a]>carry[b]?a:b);
    if(carry[hsk]<=0||bs[hsk].lv>=_MX)break;
    const thr=_dt(hsk,bs[hsk].lv,fAge,te);
    const done=bs[hsk].du*_duc(hsk,bs[hsk].lv,fAge,te)+bs[hsk].xp;
    if(thr-done<=_XD+_XG*(wsk.length-1)){
      const oldCI=_tci(bs,prof,fAge,te);
      const trial=[...best,hsk];
      const{states:ts}=_simSched(trial,skills,td,age,ssw,subs,prof);
      const na=_ageAfter(age,ssw,trial.length);
      if(_tci(ts,prof,na,te)<oldCI-0.01){best=trial;extUsed++;}else break;
    }else break;
  }
  const{states:fs,log}=_simSched(best,skills,td,age,ssw,subs,prof);
  const fAge=_ageAfter(age,ssw,best.length);
  const fsk={},fdb={};
  for(const sk of OS){fsk[sk]=fs[sk].lv;fdb[sk]=_tdb(fs[sk],sk,fAge,te);}
  const carryPct={};for(const sk of wsk){
    if(fs[sk].lv>=_MX){carryPct[sk]=0;continue;}
    const thr=_dt(sk,fs[sk].lv,fAge,te);carryPct[sk]=thr>0?_ci(fs[sk],sk,fAge,te)/thr:0;
  }
  return{log,finalSkills:fsk,finalDb:fdb,totalWeeks:best.length,maxedAt:{},
    startSkills:Object.fromEntries(OS.map(sk=>[sk,skills[sk]||0])),startAge:age,
    isSale:true,schedule:best,carryPct,extensions:extUsed,swaps:totSwaps};
}

// ─── Paste Parser ──────────────────────────────────────────────────────────
const PL={forma:"form",formę:"form",formy:"form",kondycja:"stamina",kondycję:"stamina",
  kondycji:"stamina",szybkość:"pace",szybkości:"pace",technika:"technique",technikę:"technique",
  techniki:"technique",podania:"passing",podanie:"passing",podań:"passing",bramkarz:"keeper",
  bramkarza:"keeper",bramkarski:"keeper",obrońca:"defending",obrońcy:"defending",obrońcę:"defending",
  rozgrywający:"playmaking",rozgrywającego:"playmaking",strzelec:"striker",strzelca:"striker",
  dyscyplina:"tactdisc"};
function parsePaste(text){
  const r={name:"",age:null,value:null,form:null,skills:{},warnings:[]};
  const nm=text.match(/^(.+?),\s*wiek:\s*(\d+)/m);
  if(nm){r.name=nm[1].trim();r.age=parseInt(nm[2]);}
  else{const n2=text.trim().match(/^([A-ZŁŚŹŻĆĄĘÓŃ][^\n,]+)/);if(n2)r.name=n2[1].trim();r.warnings.push("Could not parse name/age");}
  const vm=text.match(/wartość\s*:?\s*([\d\s\u00a0]+)\s*zł/i);
  if(vm)r.value=parseInt(vm[1].replace(/[\s\u00a0]/g,""));
  const sr=/\[(\d+)\]\s+(\S+)/g;let m;
  while((m=sr.exec(text))!==null){const lv=parseInt(m[1]),w=m[2].toLowerCase().replace(/[.,;]/g,"");
    const sk=PL[w];if(sk==="form")r.form=lv;else if(sk==="tactdisc"){}
    else if(sk)r.skills[sk]=lv;else r.warnings.push(`Unknown: "${w}" [${lv}]`);}
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT UI
// ═══════════════════════════════════════════════════════════════════════════
const C={bg:"#0c0e14",card:"#14171f",hi:"#1a1e29",bdr:"#252a38",
  acc:"#4a90d9",pop:"#48c774",warn:"#f5a623",tx:"#dfe3ed",txD:"#8a96a8",txM:"#4e5a6e",red:"#ef4444"};
const _ft="'JetBrains Mono','Fira Code',monospace";
const _fs="'DM Sans','Segoe UI',system-ui,sans-serif";

const YS_PRESETS=[
  {ys:3.00,l:"3.00 (max)"},{ys:3.11,l:"3.11"},{ys:3.30,l:"3.30"},
  {ys:3.50,l:"3.50"},{ys:3.80,l:"3.80"},{ys:4.00,l:"4.00"},
  {ys:4.50,l:"4.50"},{ys:5.00,l:"5.00"},{ys:6.00,l:"6.00"},
];

const DEF_SUBS=Object.fromEntries(OS.map(sk=>[sk,25]));

// ─── SubBar: draggable sub-level bar ───────────────────────────────────────
function SubBar({value,onChange,color}){
  const ref=useRef(null);
  const dragging=useRef(false);
  const update=useCallback((e)=>{
    const rect=ref.current.getBoundingClientRect();
    const x=Math.max(0,Math.min(e.clientX-rect.left,rect.width));
    onChange(Math.round(x/rect.width*99));
  },[onChange]);
  const onDown=useCallback((e)=>{
    dragging.current=true;update(e);
    const onMove=(ev)=>{if(dragging.current)update(ev);};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  },[update]);
  // Touch support
  const onTouch=useCallback((e)=>{
    const t=e.touches[0];if(!t||!ref.current)return;
    const rect=ref.current.getBoundingClientRect();
    const x=Math.max(0,Math.min(t.clientX-rect.left,rect.width));
    onChange(Math.round(x/rect.width*99));
  },[onChange]);

  return(
    <div ref={ref} onMouseDown={onDown} onTouchStart={onTouch} onTouchMove={onTouch}
      style={{position:"relative",height:20,background:C.bg,borderRadius:4,cursor:"pointer",overflow:"hidden",userSelect:"none",touchAction:"none"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${value/99*100}%`,background:color,borderRadius:4,transition:dragging.current?"none":"width 0.1s"}}/>
      <div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:10,fontFamily:_ft,fontWeight:600,
        color:value>60?C.bg:C.txD,zIndex:1}}>.{value.toString().padStart(2,"0")}</div>
    </div>
  );
}

// ─── SkillEditor: unified skill + subskill input ──────────────────────────
function SkillEditor({skills,setSkills,subs,setSubs,age,setAge,pos,name,warnings,editable=true}){
  const prof=POS[pos];
  return(
    <div style={{background:C.bg,borderRadius:6,border:`1px solid ${C.bdr}`,padding:12}}>
      {name&&(
        <div style={{fontWeight:600,marginBottom:8,color:warnings?.length?C.warn:C.pop,fontSize:14}}>
          {name} {age?`· age ${age}`:""}
        </div>
      )}
      {warnings?.length>0&&<div style={{fontSize:11,color:C.warn,marginBottom:8}}>⚠ {warnings.join("; ")}</div>}

      {/* Age row (manual mode) */}
      {editable&&!name&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontSize:11,color:C.txD,fontFamily:_fs,textTransform:"uppercase",letterSpacing:"0.06em"}}>Age</span>
          <input type="number" min={16} max={40} value={age}
            onChange={e=>setAge(Math.max(16,Math.min(40,parseInt(e.target.value)||16)))}
            style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.tx,fontFamily:_ft,fontSize:14,fontWeight:600,
              padding:"4px 8px",width:52,textAlign:"center",outline:"none"}}/>
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:6,fontSize:10,color:C.txM,fontFamily:_ft}}>
        <span style={{width:42}}>Skill</span>
        <span style={{width:40,textAlign:"center"}}>Level</span>
        <span style={{flex:1}}>Sub-level (drag or type — % toward next pop)</span>
        <span style={{width:36,textAlign:"right"}}>%</span>
      </div>

      {OS.map(sk=>{
        const w=prof.w[sk]||0;
        const isCrit=w===1;
        const isHelp=w>0&&w<1;
        const color=w===0?C.txM:isCrit?C.acc:C.txD;
        const barColor=isCrit?"#4a90d9":isHelp?"#6b7a8d":"#3a3f4a";
        return(
          <div key={sk} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            {/* Skill label */}
            <div style={{width:42,fontFamily:_ft,fontSize:12,fontWeight:600,color,display:"flex",alignItems:"center",gap:2}}>
              {SN[sk]}
              {isCrit&&<span style={{fontSize:8,color:C.acc}}>★</span>}
              {isHelp&&<span style={{fontSize:8,color:C.txM}}>{w}</span>}
            </div>
            {/* Level input */}
            <input type="number" min={0} max={18} value={skills[sk]??0}
              onChange={e=>setSkills(p=>({...p,[sk]:Math.max(0,Math.min(18,parseInt(e.target.value)||0))}))}
              style={{width:40,background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.tx,fontFamily:_ft,
                fontSize:14,fontWeight:700,padding:"3px 4px",textAlign:"center",outline:"none"}}/>
            {/* Sub bar */}
            <div style={{flex:1}}>
              <SubBar value={subs[sk]??25} onChange={v=>setSubs(p=>({...p,[sk]:v}))} color={barColor}/>
            </div>
            {/* Pct input */}
            <input type="number" min={0} max={99} value={subs[sk]??25}
              onChange={e=>setSubs(p=>({...p,[sk]:Math.max(0,Math.min(99,parseInt(e.target.value)||0))}))}
              style={{width:36,background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.txD,fontFamily:_ft,
                fontSize:11,padding:"3px 4px",textAlign:"right",outline:"none"}}/>
          </div>
        );
      })}
      <div style={{fontSize:10,color:C.txM,marginTop:6,lineHeight:1.4}}>
        Sub-level = progress within current level toward next pop. 0% = just popped, 99% = about to pop. Default 25% if unknown.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App(){
  const[paste,setPaste]=useState("");
  const[parsed,setParsed]=useState(null);
  const[ysTalent,setYsTalent]=useState("3.50");
  const[pos,setPos]=useState("ATT");
  const[weeks,setWeeks]=useState(52);
  const[ssw,setSsw]=useState(1);
  const[selStrats,setSelStrats]=useState(["round_robin","closest_to_pop","sale_optimizer"]);
  const[results,setResults]=useState(null);
  const[skills,setSkills]=useState({pace:10,technique:8,passing:6,defending:7,playmaking:9,striker:10});
  const[subs,setSubs]=useState({...DEF_SUBS});
  const[age,setAge]=useState(20);
  const[mode,setMode]=useState("paste");
  const[showLog,setShowLog]=useState(null);
  const[playerName,setPlayerName]=useState("");
  const[playerWarnings,setPlayerWarnings]=useState([]);

  const handleParse=useCallback(()=>{
    if(!paste.trim())return;
    const p=parsePaste(paste);setParsed(p);
    if(p.age)setAge(p.age);
    const sk={};for(const s of OS)sk[s]=p.skills[s]??0;
    setSkills(sk);
    setSubs({...DEF_SUBS});
    setPlayerName(p.name||"");
    setPlayerWarnings(p.warnings||[]);
  },[paste]);

  const ysNum=parseFloat(ysTalent)||3.5;
  const td=_fromYS(Math.max(3.0,ysNum));
  const subsFloat=useMemo(()=>{
    const o={};for(const sk of OS)o[sk]=(subs[sk]??25)/100;return o;
  },[subs]);

  const runSim=useCallback(()=>{
    const res={};
    for(const k of selStrats){
      if(k==="sale_optimizer") res[k]=runSaleOpt(skills,td,age,weeks,pos,subsFloat,ssw);
      else res[k]=runPlan(skills,td,age,ssw,pos,k,weeks,subsFloat);
    }
    setResults(res);setShowLog(null);
  },[skills,td,age,ssw,pos,weeks,selStrats,subsFloat]);

  const prof=POS[pos];
  function wScore(r){
    return OS.reduce((s,sk)=>{
      const w=prof.w[sk]||0;
      const sub=r.log.length?r.log[r.log.length-1].subs[sk]:0;
      return s+w*(r.finalSkills[sk]+sub);
    },0);
  }

  // Styles
  const sC={background:C.card,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"16px 20px",marginBottom:12};
  const sL={fontSize:11,fontFamily:_fs,color:C.txD,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4};
  const sI={background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.tx,fontFamily:_ft,fontSize:13,padding:"8px 10px",width:"100%",outline:"none",boxSizing:"border-box"};
  const sSel={...sI,cursor:"pointer",appearance:"none",paddingRight:28,backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a96a8' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"};
  const sB={background:C.acc,color:"#fff",border:"none",borderRadius:6,padding:"10px 20px",fontFamily:_fs,fontWeight:600,fontSize:14,cursor:"pointer"};
  const sBs={...sB,padding:"6px 14px",fontSize:12,background:C.hi,color:C.txD,border:`1px solid ${C.bdr}`};
  const allStrats={...STRATS,sale_optimizer:{name:"Sale Optimizer",desc:"Minimize carry-in — best for selling"}};
  const validStrats=Object.fromEntries(Object.entries(allStrats).filter(([k,v])=>!v.validPos||v.validPos.includes(pos)));

  return(
    <div style={{background:C.bg,minHeight:"100vh",color:C.tx,fontFamily:_fs,padding:"20px 16px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:4}}>
        <span style={{fontSize:22,fontWeight:700,color:C.acc,fontFamily:_ft}}>⚽ Sokker Training Planner</span>
      </div>
      <div style={{fontSize:12,color:C.txM,marginBottom:20}}>
        Paste your player, set YS talent and sub-levels, compare training strategies.
      </div>

      <div style={{display:"grid",gridTemplateColumns:"400px 1fr",gap:16,maxWidth:1300}}>
        {/* ─── LEFT: INPUT ─── */}
        <div>
          {/* Mode toggle */}
          <div style={{display:"flex",gap:4,marginBottom:12}}>
            {[["paste","📋 Paste"],["manual","✏️ Manual"]].map(([k,l])=>(
              <button key={k} onClick={()=>setMode(k)} style={{
                ...sBs,...(mode===k?{background:C.acc,color:"#fff",borderColor:C.acc}:{}),
              }}>{l}</button>
            ))}
          </div>

          {/* Paste mode */}
          {mode==="paste"&&(
            <div style={sC}>
              <div style={sL}>Paste player card (sokker.org)</div>
              <textarea value={paste} onChange={e=>setPaste(e.target.value)}
                placeholder={"Roman Rysio, wiek: 20\nklub: Zabójcze Strzały, kraj: Polska\nwartość : 788 000 zł\nwynagrodzenie: 13 800 zł\ntragiczna [0] forma\nbardzo dobra [9] dyscyplina taktyczna\ndobra [7] kondycja        słaby [4] bramkarz\nświetna [11] szybkość     bardzo dobry [9] obrońca\ndobra [7] technika        celujący [10] rozgrywający\nprzeciętne [5] podania    świetny [11] strzelec"}
                style={{...sI,height:140,resize:"vertical",fontFamily:_ft,fontSize:11,lineHeight:1.5}}/>
              <button onClick={handleParse} style={{...sB,marginTop:8,width:"100%"}}>Parse Player</button>
            </div>
          )}

          {/* Skill editor — always visible after parse or in manual mode */}
          {(mode==="manual"||(mode==="paste"&&parsed))&&(
            <div style={sC}>
              <div style={sL}>{mode==="paste"?"Parsed skills — adjust levels & sub-levels":"Player skills & sub-levels"}</div>
              <SkillEditor
                skills={skills} setSkills={setSkills}
                subs={subs} setSubs={setSubs}
                age={age} setAge={setAge}
                pos={pos}
                name={mode==="paste"?playerName:null}
                warnings={mode==="paste"?playerWarnings:null}
                editable={true}
              />
            </div>
          )}

          {/* ─── Parameters ─── */}
          <div style={sC}>
            <div style={sL}>YS Talent</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
              <input type="text" value={ysTalent}
                onChange={e=>{const v=e.target.value;if(/^\d*\.?\d*$/.test(v))setYsTalent(v);}}
                style={{...sI,width:80,textAlign:"center",fontSize:16,fontWeight:700}}/>
              <span style={{fontSize:12,color:C.txM}}>Lower = better (3.00 = max)</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:12}}>
              {YS_PRESETS.map(p=>(
                <button key={p.ys} onClick={()=>setYsTalent(p.ys.toFixed(2))} style={{
                  ...sBs,padding:"3px 10px",fontSize:11,
                  ...(Math.abs(ysNum-p.ys)<0.005?{background:C.acc,color:"#fff",borderColor:C.acc}:{}),
                }}>{p.l}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <div style={sL}>Position</div>
                <select value={pos} onChange={e=>setPos(e.target.value)} style={sSel}>
                  {Object.entries(POS).map(([k,v])=><option key={k} value={k}>{v.name} — {v.d}</option>)}
                </select>
              </div>
              <div>
                <div style={sL}>Start Season Week</div>
                <input type="number" min={1} max={13} value={ssw}
                  onChange={e=>setSsw(Math.max(1,Math.min(13,parseInt(e.target.value)||1)))}
                  style={{...sI,width:60}}/>
              </div>
            </div>
            <div style={{...sL,marginTop:10}}>Training Horizon (weeks)</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input type="number" min={1} max={500} value={weeks}
                onChange={e=>setWeeks(Math.max(1,parseInt(e.target.value)||1))}
                style={{...sI,width:80}}/>
              <span style={{fontSize:11,color:C.txM}}>= {(weeks/13).toFixed(1)} seasons</span>
              <div style={{display:"flex",gap:3,marginLeft:8}}>
                {[13,26,39,52,78,104].map(w=>(
                  <button key={w} onClick={()=>setWeeks(w)} style={{
                    ...sBs,padding:"2px 8px",fontSize:10,...(weeks===w?{background:C.acc,color:"#fff",borderColor:C.acc}:{}),
                  }}>{w/13}s</button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Strategies ─── */}
          <div style={sC}>
            <div style={sL}>Compare Strategies</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:4}}>
              {Object.entries(validStrats).map(([k,v])=>{
                const sel=selStrats.includes(k);const isSale=k==="sale_optimizer";
                return(
                  <button key={k} onClick={()=>setSelStrats(p=>sel?p.filter(s=>s!==k):[...p,k])} style={{
                    ...sBs,textAlign:"left",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",
                    ...(sel?{background:(isSale?C.warn:C.acc)+"22",borderColor:isSale?C.warn:C.acc,color:isSale?C.warn:C.acc}:{}),
                  }}>
                    <span>{sel?"✓ ":"  "}{v.name} {isSale&&"💰"}</span>
                    <span style={{fontSize:10,color:C.txM,fontWeight:400}}>{v.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={runSim} disabled={selStrats.length===0}
            style={{...sB,width:"100%",fontSize:16,padding:"14px 20px",opacity:selStrats.length===0?.4:1}}>
            ▶ Run Simulation
          </button>
        </div>

        {/* ─── RIGHT: RESULTS ─── */}
        <div>
          {!results&&(
            <div style={{...sC,textAlign:"center",padding:60,color:C.txM}}>
              <div style={{fontSize:40,marginBottom:8}}>📊</div>
              <div>Configure parameters and run the simulation.</div>
            </div>
          )}

          {results&&(()=>{
            const keys=Object.keys(results);const first=results[keys[0]];
            return(<div>
              <div style={{...sC,borderLeft:`3px solid ${C.acc}`}}>
                <div style={{fontSize:13,color:C.txD,marginBottom:4}}>
                  {prof.d} · YS {ysNum.toFixed(2)} · Age {first.startAge} · {weeks} weeks ({(weeks/13).toFixed(1)}s)
                </div>
                <div style={{display:"flex",gap:14,fontSize:12,fontFamily:_ft,flexWrap:"wrap"}}>
                  {OS.map(sk=>(
                    <span key={sk} style={{color:prof.w[sk]===1?C.acc:prof.w[sk]>0?C.txD:C.txM}}>
                      {SN[sk]}:{first.startSkills[sk]}.{(subs[sk]??25).toString().padStart(2,"0")}
                      {prof.w[sk]===1&&" ★"}
                    </span>
                  ))}
                </div>
              </div>

              {/* Comparison table */}
              <div style={{...sC,overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:_ft,fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${C.bdr}`}}>
                      <th style={{textAlign:"left",padding:"6px 8px",color:C.txD}}>Skill</th>
                      <th style={{textAlign:"center",padding:"6px 4px",color:C.txD,width:50}}>Start</th>
                      {keys.map(k=>(
                        <th key={k} style={{textAlign:"center",padding:"6px 8px",fontWeight:600,borderLeft:`1px solid ${C.bdr}`,
                          color:results[k].isSale?C.warn:C.acc}}>
                          {allStrats[k]?.name||k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                      const w=prof.w[sk];
                      return(
                        <tr key={sk} style={{borderBottom:`1px solid ${C.bdr}22`}}>
                          <td style={{padding:"5px 8px",color:w===1?C.tx:C.txD}}>
                            {sk} {w===1?<span style={{fontSize:9,color:C.acc}}>★</span>:<span style={{fontSize:9,color:C.txM}}>({w})</span>}
                          </td>
                          <td style={{textAlign:"center",padding:"5px 4px",fontWeight:600}}>
                            {first.startSkills[sk]}<span style={{fontSize:9,color:C.txM}}>.{(subs[sk]??25).toString().padStart(2,"0")}</span>
                          </td>
                          {keys.map(kk=>{
                            const r=results[kk];const lv=r.finalSkills[sk];const gained=lv-first.startSkills[sk];
                            const lastSub=r.log.length?r.log[r.log.length-1].subs[sk]:0;
                            return(
                              <td key={kk} style={{textAlign:"center",padding:"5px 8px",borderLeft:`1px solid ${C.bdr}`,fontWeight:600}}>
                                <span style={{color:gained>0?C.pop:C.tx}}>{lv}</span>
                                <span style={{fontSize:9,color:C.txM,marginLeft:1}}>({Math.floor(lastSub*100)}%)</span>
                                {gained>0&&<span style={{fontSize:10,color:C.pop,marginLeft:3}}>+{gained}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr style={{borderTop:`2px solid ${C.bdr}`}}>
                      <td colSpan={2} style={{padding:"6px 8px",fontWeight:700,color:C.acc}}>Weighted Score</td>
                      {keys.map(k=>{
                        const sc=wScore(results[k]);const best=Math.max(...keys.map(kk=>wScore(results[kk])));
                        return(<td key={k} style={{textAlign:"center",padding:"6px 8px",fontWeight:700,
                          borderLeft:`1px solid ${C.bdr}`,color:Math.abs(sc-best)<0.05?C.pop:C.tx}}>{sc.toFixed(1)}</td>);
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {(()=>{
                const best=keys.reduce((a,b)=>wScore(results[a])>wScore(results[b])?a:b);
                return(
                  <div style={{...sC,background:C.pop+"11",borderLeft:`3px solid ${C.pop}`}}>
                    <span style={{fontWeight:700,color:C.pop}}>★ Best: {allStrats[best]?.name||best}</span>
                    <span style={{color:C.txD,marginLeft:8}}>(score {wScore(results[best]).toFixed(1)})</span>
                  </div>
                );
              })()}

              {/* CSV Download */}
              {(()=>{
                const logKey=showLog||keys[0];
                const logData=results[logKey]?.log||[];
                const relCols=OS;
                const header=["Wk","Age","SW","Trains","Pops",...relCols.map(sk=>SN[sk]),...relCols.map(sk=>SN[sk]+"_sub")].join(",");
                const rows=logData.map(w=>{
                  const pops=w.pops.map(p=>`${SN[p[0]]}→${p[1]}`).join(" ");
                  const lvls=relCols.map(sk=>w.levels[sk]);
                  const sbs=relCols.map(sk=>Math.floor(w.subs[sk]*100));
                  return[w.week,w.age,w.sw,SN[w.trained],pops,...lvls,...sbs].join(",");
                });
                const csv=[header,...rows].join("\n");
                const blob=new Blob([csv],{type:"text/csv"});
                const url=URL.createObjectURL(blob);
                return(
                  <a href={url} download={`schedule_${pos}_${logKey}.csv`}
                    style={{display:"block",background:C.acc,color:"#fff",border:"none",borderRadius:6,
                      padding:"12px 20px",fontFamily:_fs,fontWeight:600,fontSize:15,cursor:"pointer",
                      textAlign:"center",marginBottom:12,textDecoration:"none",width:"100%",boxSizing:"border-box"}}>
                    ⬇️ Download Schedule CSV
                  </a>
                );
              })()}

              {/* Sale optimizer extras */}
              {keys.filter(k=>results[k].isSale).map(k=>{
                const r=results[k];
                return(
                  <div key={k} style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
                    <div style={{...sL,color:C.warn}}>💰 Sale Optimizer Details</div>
                    <div style={{fontSize:12,color:C.txD,marginBottom:8}}>
                      {r.totalWeeks} weeks{r.extensions>0&&<span style={{color:C.pop}}> (+{r.extensions} extended)</span>}
                      {r.swaps>0&&<span> · {r.swaps} swaps</span>}
                    </div>
                    <div style={{...sL,marginTop:4}}>Schedule</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:12}}>
                      {r.schedule.map((sk,i)=>(
                        <div key={i} style={{padding:"3px 6px",borderRadius:3,fontSize:10,fontFamily:_ft,fontWeight:600,
                          background:C.hi,border:`1px solid ${C.bdr}`,color:C.acc,textAlign:"center",minWidth:32}}>
                          <div style={{fontSize:7,color:C.txM}}>{i+1}</div>{SN[sk]}
                        </div>
                      ))}
                    </div>
                    <div style={sL}>Carry-in at sale (lower = better)</div>
                    {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                      const ci=(r.carryPct?.[sk]||0)*100;
                      return(
                        <div key={sk} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,fontSize:12,fontFamily:_ft}}>
                          <span style={{width:40,color:C.txD}}>{SN[sk]}</span>
                          <div style={{flex:1,height:10,background:C.bg,borderRadius:5,overflow:"hidden"}}>
                            <div style={{width:`${Math.min(ci,100)}%`,height:"100%",borderRadius:5,
                              background:ci>70?C.red:ci>40?C.warn:C.pop}}/>
                          </div>
                          <span style={{width:40,textAlign:"right",color:ci>70?C.red:ci>40?C.warn:C.pop,fontWeight:600}}>
                            {ci.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Week-by-week log */}
              <div style={sC}>
                <div style={sL}>Week-by-Week Log</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                  {keys.map(k=>(
                    <button key={k} onClick={()=>setShowLog(showLog===k?null:k)} style={{
                      ...sBs,...(showLog===k?{background:results[k].isSale?C.warn:C.acc,color:"#fff",
                        borderColor:results[k].isSale?C.warn:C.acc}:{}),
                    }}>{allStrats[k]?.name||k}</button>
                  ))}
                </div>
                {showLog&&results[showLog]&&(
                  <div style={{maxHeight:420,overflow:"auto",borderRadius:6}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:_ft,fontSize:11}}>
                      <thead style={{position:"sticky",top:0,background:C.hi}}>
                        <tr>
                          <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>Wk</th>
                          <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>Age</th>
                          <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>SW</th>
                          <th style={{padding:"4px 6px",textAlign:"left",color:C.txD}}>Train</th>
                          {OS.map(sk=>(
                            <th key={sk} style={{padding:"4px 6px",textAlign:"center",color:prof.w[sk]>0?C.txD:C.txM}}>{SN[sk]}</th>
                          ))}
                          <th style={{padding:"4px 6px",textAlign:"left",color:C.txD}}>Pops</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results[showLog].log.map((w,i)=>(
                          <tr key={i} style={{borderBottom:`1px solid ${C.bdr}22`,
                            background:w.pops.length?C.pop+"0d":"transparent"}}>
                            <td style={{padding:"3px 6px",textAlign:"center"}}>{w.week}</td>
                            <td style={{padding:"3px 6px",textAlign:"center",color:C.txD}}>{w.age}</td>
                            <td style={{padding:"3px 6px",textAlign:"center",color:C.txM}}>{w.sw}</td>
                            <td style={{padding:"3px 6px",color:C.acc,fontWeight:600}}>{SN[w.trained]}</td>
                            {OS.map(sk=>{
                              const hasPop=w.pops.some(p=>p[0]===sk);
                              const dim=prof.w[sk]===0;
                              return(
                                <td key={sk} style={{padding:"3px 6px",textAlign:"center",
                                  color:hasPop?C.pop:dim?C.txM:C.tx,fontWeight:hasPop?700:400,opacity:dim?0.5:1}}>
                                  {w.levels[sk]}<span style={{color:C.txM,fontSize:9}}>.{Math.floor(w.subs[sk]*100).toString().padStart(2,"0")}</span>
                                </td>
                              );
                            })}
                            <td style={{padding:"3px 6px",color:C.pop,fontSize:10}}>
                              {w.pops.map(p=>`${SN[p[0]]}→${p[1]}`).join(" ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>);
          })()}
        </div>
      </div>

      <div style={{marginTop:24,textAlign:"center",fontSize:11,color:C.txM}}>
        Sokker Training Planner v5 · Based on community empirical data
      </div>
    </div>
  );
}
