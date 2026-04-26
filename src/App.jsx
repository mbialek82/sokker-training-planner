import React, { useState, useMemo, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v8 — corpus submission (opt-out)
// v8: Anonymous bundle submission to a Supabase corpus on every successful
//     "Load History" call. Default-on, opt-out toggle on the History tile,
//     choice persisted in localStorage. Opt-outs increment a separate
//     counter table (no player data attached). Fire-and-forget — failures
//     do not block the user-visible flow. Bundle shape unchanged from v7,
//     so users can audit what they're sharing by exporting locally.
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
  // pick_lowest: pure maximin across all weighted skills
  let b=null,bl=99;for(const sk of OS){const w=p.w[sk]||0;
    if(w>0&&st[sk].lv<_MX&&st[sk].lv<bl){bl=st[sk].lv;b=sk;}}return b;
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
  pick_lowest:{name:"Pick Lowest",fn:_ll,desc:"Always train lowest-level weighted skill (pure maximin)",validPos:null},
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

// ─── XML History Parser (port of xml_history_parser.py, DOMParser-based) ──
const _SKTAG={
  stamina:"stamina",pace:"pace",technique:"technique",passing:"passing",
  keeper:"keeper",keeping:"keeper",
  defending:"defending",defence:"defending",defense:"defending",
  playmaking:"playmaking",striker:"striker",striking:"striker",
  form:"form",experience:"experience",teamwork:"teamwork",
  tactdisc:"tacticalDiscipline",tacticaldiscipline:"tacticalDiscipline",
  tactical_discipline:"tacticalDiscipline",
};
const _TRTAG={
  pace:"pace",technique:"technique",passing:"passing",
  keeper:"keeper",keeping:"keeper",
  defending:"defending",defence:"defending",defense:"defending",
  playmaking:"playmaking",striker:"striker",striking:"striker",
  stamina:"stamina",
};
const _WKTAG=new Set(["week","training","record","entry","row"]);

function _fc(elem,...tags){
  const s=new Set(tags.map(t=>t.toLowerCase()));
  for(const c of elem.children)if(s.has(c.tagName.toLowerCase()))return c;
  return null;
}
function _is(v,d=0){const n=parseInt(v,10);return isNaN(n)?d:n;}
function _tx(e){return e?(e.textContent||"").trim():"";}
function _parseSkBlock(c){
  const o={};for(const ch of c.children){const k=_SKTAG[ch.tagName.toLowerCase()];
    if(k)o[k]=_is(ch.textContent);}return o;
}
function _collectWeeks(root){
  let o=Array.from(root.children).filter(c=>_WKTAG.has(c.tagName.toLowerCase()));
  if(o.length)return o;
  if(_WKTAG.has(root.tagName.toLowerCase()))return[root];
  for(const ch of root.children){
    const gc=Array.from(ch.children).filter(c=>_WKTAG.has(c.tagName.toLowerCase()));
    if(gc.length)return gc;
  }
  return Array.from(root.children).filter(c=>_fc(c,"SKILL","SKILLS"));
}
function _parseWeekElem(e){
  const week=_is(e.getAttribute("id")||e.getAttribute("week"))
    ||_is(_tx(_fc(e,"WEEKID","WEEKNO","WEEKNUMBER","WEEK")))||0;
  const sc=_fc(e,"SKILL","SKILLS");
  const skills=_parseSkBlock(sc||e);
  if(!Object.keys(skills).length)return null;
  const scCont=_fc(e,"SKILLUP","SKILLSCHANGE","SKILLCHANGE","CHANGE","CHANGES","DELTA");
  const skillsChange={};
  if(scCont)for(const ch of scCont.children){
    const k=_SKTAG[ch.tagName.toLowerCase()];
    if(k){const v=_is(ch.textContent);if(v!==0)skillsChange[k]=v;}
  }
  const age=_is(_tx(_fc(e,"AGE","ALTER","EDAD")),21);
  const vE=_fc(e,"VALUE","PLAYERVALUE","PLAYVALUE","WERT","VALEUR","WARTOSC");
  let vR=vE?_is(_tx(vE)):0;
  if(!vR)vR=_is(e.getAttribute("value"),0);
  let trained=null,kind="individual",intensity=100;
  const tr=_fc(e,"TRAINING","TRAININGTYPE");
  if(tr){
    const rt=(tr.getAttribute("type")||"").toLowerCase().trim();
    const rk=(tr.getAttribute("kind")||"individual").toLowerCase();
    intensity=_is(tr.getAttribute("intensity"),100);
    trained=_TRTAG[rt]||null;
    kind=rk.includes("indiv")?"individual":"general";
    if(!trained){const nE=_fc(tr,"NAME");if(nE)trained=_TRTAG[_tx(nE).toLowerCase()]||null;}
    if(!trained&&tr.textContent)trained=_TRTAG[tr.textContent.toLowerCase().trim()]||null;
  }
  const tE=_fc(e,"TYPETRAINING","TRAINTYPE","TYPE");
  if(tE&&!trained){const nE=_fc(tE,"NAME");trained=_TRTAG[_tx(nE||tE).toLowerCase()]||null;}
  const kE=_fc(e,"KINDTRAINING","KIND","TRAINMODE","TRAININGKIND");
  if(kE){const nE=_fc(kE,"NAME");kind=_tx(nE||kE).toLowerCase().includes("indiv")?"individual":"general";}
  const iE=_fc(e,"INTENSITY","INTENSITAET");
  if(iE&&intensity===100)intensity=_is(_tx(iE),100);
  const jE=_fc(e,"INJURY","VERLETZUNG","BLESSURE");
  let severe=false;
  if(jE){const sr=(jE.getAttribute("severe")||jE.getAttribute("schwer")||"0").toLowerCase().trim();
    severe=["1","true","yes","ja"].includes(sr);}
  return{
    week,skills,skillsChange,age,
    playerValue:vR?{value:vR}:{},
    type:trained?{name:trained}:{},
    kind:{name:kind},
    intensity,
    injury:{severe},
  };
}
function parseTrainingXml(xmlText){
  const doc=new DOMParser().parseFromString(xmlText.trim(),"text/xml");
  const perr=doc.querySelector("parsererror");
  if(perr)throw new Error("XML parse error: "+perr.textContent.slice(0,180));
  const root=doc.documentElement;
  const we=_collectWeeks(root);
  if(!we.length)throw new Error("No recognisable week/training records. Expected <WEEK>, <TRAINING>, or similar.");
  const recs=[];
  for(const el of we){const r=_parseWeekElem(el);if(r)recs.push(r);}
  if(!recs.length)throw new Error("XML parsed but no usable records (missing skill data?).");
  recs.sort((a,b)=>(a.week||0)-(b.week||0));
  return recs;
}
function detectPlayerMeta(xmlText){
  const meta={};
  try{
    const doc=new DOMParser().parseFromString(xmlText.trim(),"text/xml");
    if(doc.querySelector("parsererror"))return meta;
    const root=doc.documentElement;
    for(const a of["playerid","playerID","player_id","id"]){
      const v=root.getAttribute(a);if(v){meta.player_id=_is(v);break;}
    }
    const pE=_fc(root,"PLAYERID","PLAYER_ID");
    if(pE&&!meta.player_id)meta.player_id=_is(_tx(pE));
    const nE=_fc(root,"PLAYERNAME","NAME","SURNAME","LASTNAME")||_fc(root,"PLAYER");
    if(nE){const sE=_fc(nE,"SURNAME","LAST","LASTNAME");meta.name=_tx(sE||nE);}
  }catch{}
  return meta;
}
function parseTrainingData(text){
  text=(text||"").trim();
  if(!text)throw new Error("Input is empty.");
  if(text.startsWith("{")||text.startsWith("[")){
    let data;try{data=JSON.parse(text);}catch(ex){throw new Error("JSON parse error: "+ex.message);}
    if(typeof data==="object"&&!Array.isArray(data)){
      const keys=["reports","training","history","weeks","list","items","data","trainings","records"];
      let found=false;
      for(const k of keys)if(Array.isArray(data[k])){data=data[k];found=true;break;}
      if(!found){
        if("skills" in data)data=[data];
        else throw new Error('JSON object has no recognisable list key (expected "reports", "training", "history", ...).');
      }
    }
    if(!Array.isArray(data))throw new Error("Expected a JSON array of training records.");
    if(!data.length)throw new Error("JSON array is empty.");
    data.sort((a,b)=>(a.week||0)-(b.week||0));
    return data;
  }
  return parseTrainingXml(text);
}

// ─── Mikoos Subskill Estimator ─────────────────────────────────────────────
// Exact JS port of mikooss_estimate_subskill from subskill.py (lines 155–322).
// Backs out a uniform subskill estimate from player value via binary search
// over the value formula. v7-only: no per-skill forward simulation (the
// desktop calibration tool does that). This anchors the bundle and makes
// the planner immediately useful instead of defaulting subs to 25%.
const _MK_TM=1.088,_MK_EM=1.252,_MK_BV=1588.0,_MK_FM=1/40,_MK_SB=216.4,_MK_SE=1.511;
const _MK_TBL=(()=>{
  const bv=[0.0,_MK_BV];for(let i=0;i<18;i++)bv.push(bv[bv.length-1]*_MK_TM);
  const st=[0.0,_MK_BV];for(let i=0;i<18;i++)st.push(st[st.length-1]+bv[i+2]);return st;
})();
function _mkSk(lf,isKp){
  lf=Math.min(lf,18.0);const fl=Math.floor(lf),off=lf-fl,fl1=Math.min(fl+1,18);
  const v=(_MK_TBL[fl]+(_MK_TBL[fl1]-_MK_TBL[fl])*off)*Math.pow(_MK_EM,lf);
  return isKp?v*4.0:v;
}
function _mkSt(lf){return lf*_MK_SB*Math.pow(_MK_SE,lf);}
const _MK_ORDER=["keeper","pace","defending","technique","playmaking","passing","striker"];
function _mkTotal(skills,bonus,formType){
  const form=skills.form??14,stam=skills.stamina??0;
  let v=_mkSt(stam+bonus);
  for(let i=0;i<_MK_ORDER.length;i++){
    const sk=_MK_ORDER[i];const lv=Math.min((skills[sk]??0)+bonus,18.0);
    v+=_mkSk(lv,i===0);
  }
  let nf;
  if(formType==="min")nf=form;
  else if(formType==="max")nf=form+1;
  else nf=form+bonus;
  if(nf<18.0)v*=1.0-(18.0-nf)*_MK_FM;
  return v;
}
function _mkBS(skills,realVal,formType){
  let lo=0,hi=1000;
  while(lo<=hi){
    const mid=(lo+hi)>>1;const v=_mkTotal(skills,mid/1000.0,formType);
    if(v<=realVal)lo=mid+1;else hi=mid-1;
  }
  return Math.min(lo,1000);
}
// Returns {expected, lo, hi, valueMin, valueMax, inRange}
// Subskill values are 0–1 (display-level fraction). Multiply by 100 for editor %.
function mikoosEstimateSubskill(skills,form,realValue){
  if(!realValue||realValue<=0)return null;
  const skf={...skills,form:form??14};
  const vMin=Math.round(_mkTotal(skf,0.0,"dynamic"));
  const vMax=Math.round(_mkTotal(skf,1.0,"dynamic"));
  const inRange=realValue>=vMin&&realValue<=vMax;
  const avgN=_mkBS(skf,realValue,"dynamic");
  const avgL=_mkBS(skf,realValue,"max");  // lo bound (more form penalty)
  const avgH=_mkBS(skf,realValue,"min");  // hi bound (less form penalty)
  return{
    expected:avgN/1000.0,
    lo:avgL/1000.0,
    hi:avgH/1000.0,
    valueMin:vMin,valueMax:vMax,inRange,
  };
}

// ─── Per-Skill Forward Simulator ──────────────────────────────────────────
// Faithful JS port of subskill.py PlayerTracker (April 2026 model, v11).
// Walks the training history forward from the first record, accumulating
// integer DB per skill, handling pops, formation training, fractional XP
// buffering, and stamina's fixed-rate exception. Returns per-skill subskills
// at the LATEST report — far better than uniform Mikoos when history is
// available.
//
// Sources: constants.py v9, training_week.py v2, subskill.py v11.
// ──────────────────────────────────────────────────────────────────────────

// Constants (constants.py)
const _LEVELS_STD=18,_LEVELS_STAM=11;
const _DB_PER_LV=100/18,_DB_PER_STAM=100/11;
const _GT_RATE=15,_COACH_DB=93;
const _B_INT={pace:99,striker:90,technique:82,defending:82,playmaking:75,passing:75,keeper:75,stamina:null};
const _B_NORM=75,_THR_BASE=100,_STAM_THR=80,_PROD_SLOPE=0.5,_AGE_OFF=15;
const _FORM_CODE_TO_SK={0:"keeper",1:"defending",2:"playmaking",3:"striker"};
const _GT_THR=93,_W_CL_OFF=93,_W_CL_FRI=70,_W_NT_OFF=70;
// Value formula (in-game-calibrated VALUE_*, not Mikoos)
const _VAL_BASE=11000.0,_VAL_TM=1.088,_VAL_LM=1.252;
const _VAL_CM=_VAL_TM*_VAL_LM;
const _VAL_KP_W=4.0,_VAL_FORM_PEN=1/40;
const _VAL_STAM_BASE=216.4,_VAL_STAM_MULT=1.511;

// DB geometry (subskill.py)
function _dbFloor(lv,isStam){const d=isStam?11:18;return Math.ceil(lv*100/d);}
function _dbThresh(lv,isStam){return _dbFloor(lv+1,isStam)-_dbFloor(lv,isStam);}

// Talent eff (constants.py)
function _talEffSenior(td){return 40.0+60.0*(td/100.0);}

// Canonical pop threshold — v24 product model
function _canonThr(skill,level,age){
  if(skill==="stamina")return _STAM_THR;
  const b=_B_INT[skill];if(b==null)return Infinity;
  const dbMid=(level+0.5)*(100.0/18.0);
  const years=Math.max(0.0,age-_AGE_OFF);
  return(b/_B_NORM)*(_THR_BASE+_PROD_SLOPE*dbMid*years);
}

// DB gain per week for one skill
function _dbGainPerWeek(td,skill,level,age,intensity,coachEff){
  if(skill==="stamina")return 0.0;
  if(level>=_LEVELS_STD)return 0.0;
  const thr=_canonThr(skill,level,age);
  if(thr<=0||thr===Infinity)return 0.0;
  const eff=_talEffSenior(td);
  return _DB_PER_LV*intensity*coachEff*(eff/100.0)/thr;
}

// Geston intensity estimators
function _gWeightedMin(co,cf,no){
  return co*_W_CL_OFF/_GT_THR+cf*_W_CL_FRI/_GT_THR+no*_W_NT_OFF/_GT_THR;
}
function _advIntensity(co,cf,no){
  const ws=_gWeightedMin(co,cf,no);
  const m1=Math.min(ws,90),m2=Math.max(0.0,Math.min(ws-90,90));
  const t1=(m1*_GT_THR/100)/90,t2=(m2*(100-_GT_THR)/100)/90;
  return Math.round(10000*((t1+t2)/2+0.5))/100;
}
function _formIntensity(co,cf,no){
  const ws=_gWeightedMin(co,cf,no);
  const m1=Math.min(ws,90),m2=Math.max(0.0,Math.min(ws-90,90));
  const t1=(m1*_GT_THR/100)/90,t2=(m2*(100-_GT_THR)/100)/90;
  return Math.round(10000*(t1+t2))/100;
}

// Decode one API record into a TrainingWeek-equivalent object
function _parseRecord(rec){
  const kindName=(rec.kind||{}).name||"";
  const trainedSkill=kindName==="individual"?((rec.type||{}).name||null):null;
  const isFormation=kindName==="formation";
  let formationSkill=null,advInt=0.0,fInt=0.0;
  if(isFormation){
    const code=(rec.formation||{}).code;
    if(code!=null)formationSkill=_FORM_CODE_TO_SK[code]||null;
    const g=rec.games||{};
    const co=g.minutesOfficial||0,cf=g.minutesFriendly||0,no=g.minutesNtOfficial||g.minutesNational||0;
    advInt=_advIntensity(co,cf,no);
    fInt=_formIntensity(co,cf,no);
  }
  const skills=rec.skills||{};
  return{
    week:rec.week||0,
    age:parseInt(rec.age??21,10),
    intensity:rec.intensity||0,
    trainedSkill,isFormation,formationSkill,
    advancedIntensity:advInt,
    formationIntensity:fInt,
    severeInjury:(rec.injury||{}).severe===true,
    skills:{...skills},
    skillsChange:{...(rec.skillsChange||{})},
    form:skills.form??14,
    value:(rec.playerValue||{}).value??null,
  };
}

// Infer formation fallback from a history (most-common formation.code)
function _inferFormationSkill(history){
  const cnt={};
  for(const r of history){
    const c=(r.formation||{}).code;
    if(c!=null)cnt[c]=(cnt[c]||0)+1;
  }
  let best=null,bestN=0;
  for(const k in cnt)if(cnt[k]>bestN){best=k;bestN=cnt[k];}
  return best!=null?_FORM_CODE_TO_SK[best]||null:null;
}

// In-game-calibrated value formula (for sanity checking, distinct from Mikoos)
function _skillValue(skill,level,sub){
  if(sub==null)sub=0;
  let v0,v1;
  if(skill==="stamina"){
    v0=level>0?level*_VAL_STAM_BASE*Math.pow(_VAL_STAM_MULT,level):0.0;
    v1=level<_LEVELS_STAM?(level+1)*_VAL_STAM_BASE*Math.pow(_VAL_STAM_MULT,level+1):v0;
  }else{
    v0=_VAL_BASE*Math.pow(_VAL_CM,level);
    v1=level<_LEVELS_STD?_VAL_BASE*Math.pow(_VAL_CM,level+1):v0;
  }
  let v=v0+sub*(v1-v0);
  if(skill==="keeper")v*=_VAL_KP_W;
  return v;
}
function _computeValue(skills,form,subs){
  if(!subs)subs={};
  const allSk=["pace","technique","passing","defending","playmaking","striker","keeper","stamina"];
  let tot=0;
  for(const sk of allSk)tot+=_skillValue(sk,skills[sk]??0,subs[sk]??0.0);
  return tot*(1.0-(18-form)*_VAL_FORM_PEN);
}

// Per-skill state with fractional XP buffer
function _makeState(skill,level,dbAccum){
  return{skill,level,dbAccum:dbAccum|0,gainBuf:0.0,popsSeen:0,weeksAtLv:0};
}
function _stateThreshold(s){return _dbThresh(s.level,s.skill==="stamina");}
function _stateSubskill(s){
  const max=s.skill==="stamina"?_LEVELS_STAM:_LEVELS_STD;
  if(s.level>=max)return 0.0;
  const t=_stateThreshold(s);
  return t>0?Math.min(1.0,s.dbAccum/t):0.0;
}
function _stateAddGain(s,gain){
  s.gainBuf+=gain;const earned=Math.floor(s.gainBuf);s.gainBuf-=earned;return earned;
}

// Compute DB gain for one skill in one week, given context
function _weekGain(state,tw,td,coachEff,formSk){
  const sk=state.skill,level=state.level,age=tw.age;
  const max=sk==="stamina"?_LEVELS_STAM:_LEVELS_STD;
  if(level>=max)return 0.0;
  if(sk==="stamina")return _DB_PER_STAM/52.0; // fixed: ~1 level/season
  const gtFactor=_GT_RATE/100.0; // 0.15
  let effInt;
  if(sk===tw.trainedSkill){
    effInt=tw.intensity;
  }else if(formSk!=null){
    if(tw.formationIntensity===0)return 0.0; // formation + no game → 0 XP
    const gtInt=tw.advancedIntensity>0?tw.advancedIntensity:96.0;
    const fInt=tw.formationIntensity;
    if(sk===formSk)effInt=(gtInt+fInt)*gtFactor;
    else effInt=gtInt*gtFactor;
  }else{
    effInt=tw.intensity*gtFactor;
  }
  return _dbGainPerWeek(td,sk,level,age,effInt,coachEff);
}

// Initialise per-skill states from a Mikoos uniform anchor
function _initStates(skills,form,realValue){
  // Uniform subskill from Mikoos (or 0.5 fallback if out of range)
  let s=0.5;
  if(realValue&&realValue>0){
    const est=mikoosEstimateSubskill(skills,form,realValue);
    if(est&&est.inRange)s=est.expected;
  }
  const states={};
  const allSk=["pace","technique","passing","defending","playmaking","striker","keeper","stamina"];
  for(const sk of allSk){
    const isStam=sk==="stamina";
    const lv=skills[sk]??0;
    const max=isStam?_LEVELS_STAM:_LEVELS_STD;
    let dbInt=0;
    if(lv<max){
      const thr=_dbThresh(lv,isStam);
      dbInt=Math.max(0,Math.min(thr-1,Math.round(s*thr)));
    }
    states[sk]=_makeState(sk,lv,dbInt);
  }
  return{states,uniformAnchor:s};
}

// Process one week's update on the states
function _updateStates(states,tw,td,coachEff,formationFallback){
  if(tw.severeInjury)return; // no XP this week
  const formSk=tw.isFormation?(tw.formationSkill||formationFallback):null;
  for(const sk in states){
    const state=states[sk];
    const newLevel=tw.skills[sk]??state.level;
    const popped=(tw.skillsChange[sk]||0)>0||newLevel>state.level;
    const gain=_weekGain(state,tw,td,coachEff,formSk);
    if(popped){
      const earned=_stateAddGain(state,gain);
      const totalAccum=state.dbAccum+earned;
      const thresh=_stateThreshold(state);
      const carry=Math.max(0,totalAccum-thresh);
      state.level=newLevel;
      const max=sk==="stamina"?_LEVELS_STAM:_LEVELS_STD;
      state.dbAccum=newLevel>=max?0:carry;
      state.gainBuf=0.0; // fractional XP doesn't carry across levels
      state.popsSeen+=1;
      state.weeksAtLv=0;
    }else{
      const earned=_stateAddGain(state,gain);
      state.dbAccum=Math.min(state.dbAccum+earned,_stateThreshold(state)-1);
      state.weeksAtLv+=1;
    }
  }
}

// Top-level driver: full forward simulation over a sorted history
// Returns per-skill subskills (0–1 fractions) at the latest report.
// `td` is talent_db (0–100, NOT YS talent). Pass NaN to use td=70 default.
function simulateSubskills(reports,td,coachEff){
  if(!reports||reports.length===0)return null;
  if(coachEff==null)coachEff=1.0;
  if(!isFinite(td))td=70.0;
  // Sort ascending just to be safe
  const hist=[...reports].sort((a,b)=>(a.week||0)-(b.week||0));
  // First report = anchor
  const first=hist[0];
  const anchorSkills=first.skills||{};
  const anchorForm=anchorSkills.form??14;
  const anchorValue=(first.playerValue||{}).value;
  const{states,uniformAnchor}=_initStates(anchorSkills,anchorForm,anchorValue);
  // Formation fallback from history
  const formationFallback=_inferFormationSkill(hist);
  // Walk forward from the SECOND report (first is anchor, no update)
  for(let i=1;i<hist.length;i++){
    const tw=_parseRecord(hist[i]);
    _updateStates(states,tw,td,coachEff,formationFallback);
  }
  // Extract subskills (0–1 fractions)
  const subs={};
  for(const sk in states)subs[sk]=_stateSubskill(states[sk]);
  // Last report's value-formula residual (sanity, optional consumer)
  const last=hist[hist.length-1];
  const lastSkills=last.skills||{};
  const lastForm=lastSkills.form??14;
  const lastValue=(last.playerValue||{}).value;
  let valueResidualPct=null;
  if(lastValue&&lastValue>0){
    const pred=_computeValue(lastSkills,lastForm,subs);
    valueResidualPct=(pred-lastValue)/lastValue*100;
  }
  return{
    subskills:subs,
    uniformAnchor,
    valueResidualPct,
    weeksProcessed:hist.length,
    formationFallback,
    talentUsed:td,
  };
}

// ─── Calibration Bundle Builder ───────────────────────────────────────────
function buildBundle(ctx){
  const{reports,rawText,playerMeta,skills,subs,age,ysTalent,td,pos,weeks,ssw,playerName}=ctx;
  const subsEst={};for(const sk of OS)subsEst[sk]=(subs[sk]??25)/100;
  const lastReport=reports&&reports.length?reports[reports.length-1]:null;
  return{
    format_version:"1.0",
    source:"sokker-training-planner-online-v8",
    exported_at:new Date().toISOString(),
    player:{
      player_id:playerMeta?.player_id??null,
      name:playerMeta?.name||playerName||null,
    },
    user_snapshot:{
      current_skills:{...skills},
      subskills_estimate:subsEst,
      age_current:age,
      ys_talent_user:parseFloat(ysTalent)||null,
      talent_db_estimate:td,
      position_assumed:pos,
      horizon_weeks:weeks,
      start_season_week:ssw,
      coach_value_assumed:93,
      latest_report_week:lastReport?.week??null,
    },
    reports:reports||[],
    raw_history:rawText||null,
  };
}
function downloadBundle(bundle,filename){
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}

// ─── Corpus Submission (Supabase) ──────────────────────────────────────────
// Fire-and-forget POSTs to a Supabase project with row-level security set
// to allow anonymous inserts only. Failures are logged to console and never
// surfaced to the user — the corpus is best-effort, not a critical path.
const _SB_URL="https://ahyxijjqzxnypbmavgrr.supabase.co";
// v8.4.2: swapped legacy JWT (eyJ...) for the publishable key. The legacy
// JWT was authenticating but its claimed "anon" role wasn't being honored
// by Supabase's gateway, so requests reached Postgres roleless and tripped
// the RLS policy with 42501. The publishable key resolves to anon cleanly.
const _SB_KEY="sb_publishable_bwRysMoewn__ViB0Nyxm2Q_2nrXasid";
const _SB_OPT_OUT_KEY="sokker_corpus_opt_out_v1"; // localStorage key

// SHA-256 of a stable identity string → hex digest. Used to dedupe so the
// same player loaded twice in the same state doesn't fill the corpus.
async function _sha256Hex(str){
  const buf=new TextEncoder().encode(str);
  const hash=await crypto.subtle.digest("SHA-256",buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function submitBundleToCorpus(bundle){
  try{
    const reportsLen=Array.isArray(bundle.reports)?bundle.reports.length:0;
    const lastWeek=reportsLen>0?bundle.reports[reportsLen-1].week:null;
    const idStr=`${bundle.player?.player_id||"none"}|${lastWeek||"none"}|${reportsLen}`;
    const payloadHash=await _sha256Hex(idStr);
    const row={
      player_id:bundle.player?.player_id||null,
      player_name:bundle.player?.name||null,
      format_version:bundle.format_version||null,
      source:bundle.source||null,
      user_snapshot:bundle.user_snapshot||{},
      reports:bundle.reports||[],
      raw_history:bundle.raw_history||null,
      payload_hash:payloadHash,
      user_agent:typeof navigator!=="undefined"?navigator.userAgent:null,
    };
    const res=await fetch(`${_SB_URL}/rest/v1/submissions`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":_SB_KEY,
        "Authorization":`Bearer ${_SB_KEY}`,
        "Prefer":"return=minimal",
      },
      body:JSON.stringify(row),
    });
    if(res.ok)return{ok:true};
    if(res.status===409)return{ok:true,duplicate:true}; // unique-hash collision = already shared
    const txt=await res.text().catch(()=>"");
    console.warn("[corpus] submission failed:",res.status,txt.slice(0,200));
    return{ok:false,status:res.status};
  }catch(ex){
    console.warn("[corpus] submission error:",ex?.message||ex);
    return{ok:false,error:ex?.message||"unknown"};
  }
}

async function recordOptOut(){
  try{
    await fetch(`${_SB_URL}/rest/v1/opt_outs`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":_SB_KEY,
        "Authorization":`Bearer ${_SB_KEY}`,
        "Prefer":"return=minimal",
      },
      body:JSON.stringify({}),
    });
  }catch{} // truly fire-and-forget; opt-out tracking failure is harmless
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
  // ─── Stage navigation ──────────────────────────────────────────────────
  const[stage,setStage]=useState("player"); // "player" | "plan" | "export"

  // ─── Player ID (drives all fetch/handoff actions) ──────────────────────
  const[pid,setPid]=useState("");

  // ─── Stage 1: input tile activation (multi-select) ─────────────────────
  const[tilesOn,setTilesOn]=useState({card:true,history:false,manual:false});
  const toggleTile=(k)=>setTilesOn(t=>({...t,[k]:!t[k]}));

  // ─── Card paste state ──────────────────────────────────────────────────
  const[paste,setPaste]=useState("");
  const[parsed,setParsed]=useState(null);
  const[playerName,setPlayerName]=useState("");
  const[playerWarnings,setPlayerWarnings]=useState([]);

  // ─── Training history state ────────────────────────────────────────────
  const[historyText,setHistoryText]=useState("");
  const[historyReports,setHistoryReports]=useState(null);
  const[historyMeta,setHistoryMeta]=useState({});
  const[historyError,setHistoryError]=useState("");

  // v8: corpus share state — default ON, persisted in localStorage as opt-out
  const[shareEnabled,setShareEnabled]=useState(()=>{
    try{return localStorage.getItem(_SB_OPT_OUT_KEY)!=="1";}catch{return true;}
  });
  const[shareStatus,setShareStatus]=useState(""); // "" | "sent" | "duplicate" | "failed"
  const[showShareInfo,setShowShareInfo]=useState(false);
  const updateShare=useCallback((on)=>{
    setShareEnabled(on);
    try{
      if(on)localStorage.removeItem(_SB_OPT_OUT_KEY);
      else localStorage.setItem(_SB_OPT_OUT_KEY,"1");
    }catch{}
    if(!on)recordOptOut(); // record the opt-out moment
  },[]);

  // ─── Skill editor state ────────────────────────────────────────────────
  const[skills,setSkills]=useState({pace:10,technique:8,passing:6,defending:7,playmaking:9,striker:10});
  const[subs,setSubs]=useState({...DEF_SUBS});
  const[age,setAge]=useState(20);
  const[hasPlayerData,setHasPlayerData]=useState(false);

  // ─── Stage 2: simulation params + results ──────────────────────────────
  const[ysTalent,setYsTalent]=useState("3.50");
  const[pos,setPos]=useState("ATT");
  const[weeks,setWeeks]=useState(52);
  const[ssw,setSsw]=useState(1);
  const[selStrats,setSelStrats]=useState(["round_robin","closest_to_pop","sale_optimizer"]);
  const[results,setResults]=useState(null);
  const[showLog,setShowLog]=useState(null);

  // ─── Derived values (declared before callbacks for TDZ safety) ─────────
  const ysNum=parseFloat(ysTalent)||3.5;
  const td=_fromYS(Math.max(3.0,ysNum));
  const subsFloat=useMemo(()=>{
    const o={};for(const sk of OS)o[sk]=(subs[sk]??25)/100;return o;
  },[subs]);

  // ─── Callbacks ─────────────────────────────────────────────────────────
  const handleParse=useCallback(()=>{
    if(!paste.trim())return;
    const p=parsePaste(paste);setParsed(p);
    if(p.age)setAge(p.age);
    const sk={};for(const s of OS)sk[s]=p.skills[s]??0;
    setSkills(sk);
    // v7.1: estimate subskills from card value (Mikoos uniform anchor)
    if(p.value&&p.value>0){
      const allSk={...p.skills};
      const est=mikoosEstimateSubskill(allSk,p.form,p.value);
      if(est){
        const pct=Math.round(est.expected*100);
        const newSubs={};for(const s of OS)newSubs[s]=pct;
        setSubs(newSubs);
      }else{
        setSubs({...DEF_SUBS});
      }
    }else{
      setSubs({...DEF_SUBS});
    }
    setPlayerName(p.name||"");setPlayerWarnings(p.warnings||[]);
    setHasPlayerData(true);
  },[paste]);

  const handleLoadHistory=useCallback(()=>{
    setHistoryError("");
    if(!historyText.trim()){setHistoryError("Paste training history first.");return;}
    let reports;
    try{reports=parseTrainingData(historyText);}
    catch(ex){setHistoryError(ex.message||"Parse failed.");return;}
    const meta=historyText.trim().startsWith("<")?detectPlayerMeta(historyText):{};
    setHistoryReports(reports);setHistoryMeta(meta);
    const last=reports[reports.length-1];
    if(last){
      if(last.age)setAge(last.age);
      const sk={};for(const s of OS)sk[s]=last.skills?.[s]??0;
      setSkills(sk);
      // v7.2: full forward simulation per skill (replaces uniform Mikoos)
      // Falls back to uniform Mikoos if sim returns null (no value, no anchor).
      const tdNow=_fromYS(Math.max(3.0,parseFloat(ysTalent)||3.5));
      const sim=simulateSubskills(reports,tdNow,1.0);
      if(sim&&sim.subskills){
        const newSubs={};
        for(const s of OS){
          const f=sim.subskills[s];
          newSubs[s]=Math.max(0,Math.min(99,Math.round((f??0.25)*100)));
        }
        setSubs(newSubs);
      }else{
        // Fallback: uniform Mikoos from latest snapshot
        const lastVal=last.playerValue?.value;const lastForm=last.skills?.form;
        if(lastVal&&lastVal>0){
          const est=mikoosEstimateSubskill({...last.skills},lastForm,lastVal);
          if(est){
            const pct=Math.round(est.expected*100);
            const newSubs={};for(const s of OS)newSubs[s]=pct;
            setSubs(newSubs);
          }else setSubs({...DEF_SUBS});
        }else setSubs({...DEF_SUBS});
      }
      if(meta.name&&!playerName)setPlayerName(meta.name);
      setHasPlayerData(true);
      // v8: fire-and-forget corpus submission (unless opted out)
      if(shareEnabled){
        setShareStatus(""); // clear any previous status
        const bundle=buildBundle({
          reports,rawText:historyText,playerMeta:meta,
          skills:sk,subs:{},age:last.age||21,
          ysTalent,td:tdNow,pos,weeks,ssw,playerName:meta.name||playerName,
        });
        submitBundleToCorpus(bundle).then(r=>{
          if(r.ok)setShareStatus(r.duplicate?"duplicate":"sent");
          else setShareStatus("failed");
          setTimeout(()=>setShareStatus(""),4000);
        });
      }
    }
  },[historyText,playerName,ysTalent,shareEnabled,pos,weeks,ssw]);

  const handleManualActivate=useCallback(()=>{
    // Activating manual entry alone marks data as "ready" so the user can proceed
    setHasPlayerData(true);
  },[]);

  const handleOpenTrainingReport=useCallback(()=>{
    if(!pid||!/^\d+$/.test(pid.trim()))return;
    window.open(`https://sokker.org/api/training/${pid.trim()}/report`,"_blank","noopener,noreferrer");
  },[pid]);

  const handleExportBundle=useCallback(()=>{
    const bundle=buildBundle({
      reports:historyReports,
      rawText:historyText||null,
      playerMeta:{...historyMeta,player_id:historyMeta?.player_id||(pid&&/^\d+$/.test(pid)?parseInt(pid,10):null)},
      skills,subs,age,
      ysTalent,td,pos,weeks,ssw,playerName,
    });
    const idPart=pid&&/^\d+$/.test(pid)?pid:(historyMeta?.player_id?`${historyMeta.player_id}`:(playerName||"player").replace(/[^a-zA-Z0-9]+/g,"_").slice(0,40)||"player");
    const ts=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
    downloadBundle(bundle,`sokker_bundle_${idPart}_${ts}.json`);
  },[historyReports,historyText,historyMeta,pid,skills,subs,age,ysTalent,td,pos,weeks,ssw,playerName]);

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

  // ─── Shared styles ─────────────────────────────────────────────────────
  const sC={background:C.card,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"16px 20px",marginBottom:12};
  const sL={fontSize:11,fontFamily:_fs,color:C.txD,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4};
  const sI={background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.tx,fontFamily:_ft,fontSize:13,padding:"8px 10px",width:"100%",outline:"none",boxSizing:"border-box"};
  const sSel={...sI,cursor:"pointer",appearance:"none",paddingRight:28,backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a96a8' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"};
  const sB={background:C.acc,color:"#fff",border:"none",borderRadius:6,padding:"10px 20px",fontFamily:_fs,fontWeight:600,fontSize:14,cursor:"pointer"};
  const sBs={...sB,padding:"6px 14px",fontSize:12,background:C.hi,color:C.txD,border:`1px solid ${C.bdr}`};
  const allStrats={...STRATS,sale_optimizer:{name:"Sale Optimizer",desc:"Minimize carry-in — best for selling"}};
  const validStrats=Object.fromEntries(Object.entries(allStrats).filter(([k,v])=>!v.validPos||v.validPos.includes(pos)));

  // ─── Stage tab styling ─────────────────────────────────────────────────
  const stageTab=(k,label,num,enabled=true)=>{
    const active=stage===k;
    return(
      <button key={k} disabled={!enabled} onClick={()=>setStage(k)} style={{
        flex:1,padding:"14px 10px",background:active?C.acc:"transparent",
        color:active?"#fff":enabled?C.tx:C.txM,
        border:`1px solid ${active?C.acc:C.bdr}`,
        borderRadius:8,fontFamily:_fs,fontWeight:active?600:500,fontSize:14,
        cursor:enabled?"pointer":"not-allowed",opacity:enabled?1:0.5,
        transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
      }}>
        <span style={{
          display:"inline-flex",alignItems:"center",justifyContent:"center",
          width:24,height:24,borderRadius:"50%",
          background:active?"rgba(255,255,255,0.18)":C.hi,
          color:active?"#fff":C.txD,fontSize:12,fontWeight:700,fontFamily:_ft,
        }}>{num}</span>
        {label}
      </button>
    );
  };

  // ─── Tile styling ──────────────────────────────────────────────────────
  const inputTile=(k,icon,title,desc)=>{
    const on=tilesOn[k];
    return(
      <button key={k} onClick={()=>toggleTile(k)} style={{
        flex:1,minWidth:140,padding:"14px 14px",
        background:on?C.acc+"18":C.card,
        border:`1px solid ${on?C.acc:C.bdr}`,
        borderLeft:on?`3px solid ${C.acc}`:`1px solid ${C.bdr}`,
        borderRadius:8,cursor:"pointer",textAlign:"left",
        display:"flex",flexDirection:"column",gap:4,
        transition:"all .15s",fontFamily:_fs,
      }}>
        <div style={{fontSize:13,fontWeight:600,color:on?C.acc:C.tx}}>
          {on?"✓ ":""}{icon} {title}
        </div>
        <div style={{fontSize:11,color:C.txM,lineHeight:1.4}}>{desc}</div>
      </button>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return(
    <div style={{background:C.bg,minHeight:"100vh",color:C.tx,fontFamily:_fs,padding:"20px 24px"}}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:4}}>
        <span style={{fontSize:22,fontWeight:700,color:C.acc,fontFamily:_ft}}>⚽ Sokker Training Planner</span>
        <span style={{fontSize:12,color:C.txM}}>v8.4.2 · staged interface</span>
      </div>
      <div style={{fontSize:12,color:C.txM,marginBottom:20}}>
        Load a player, plan their training, export a calibration bundle.
      </div>

      {/* ── Stage tabs (freely navigable) ────────────────────────────── */}
      <div style={{display:"flex",gap:8,maxWidth:1300,marginBottom:20}}>
        {stageTab("player","Player",1)}
        {stageTab("plan","Plan",2)}
        {stageTab("export","Export",3)}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 1 — PLAYER                                                  */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {stage==="player"&&(
        <div style={{maxWidth:1300}}>
          {/* PID input — top of stage */}
          <div style={sC}>
            <div style={sL}>Player ID</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input type="text" value={pid} placeholder="e.g. 39028856"
                onChange={e=>{const v=e.target.value;if(/^\d*$/.test(v))setPid(v);}}
                style={{...sI,maxWidth:220,fontSize:15,fontFamily:_ft,letterSpacing:"0.05em"}}/>
              <span style={{fontSize:11,color:C.txM,lineHeight:1.4}}>
                Find it in the URL of any Sokker player page. Optional — but unlocks the one-click training-report fetch below.
              </span>
            </div>
          </div>

          {/* Tile picker + skill editor — two columns on desktop */}
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}
            className="player-stage-grid">
            {/* LEFT: input tiles + their active blocks */}
            <div>
              <div style={sC}>
                <div style={sL}>How are you loading this player?</div>
                <div style={{fontSize:11,color:C.txM,marginBottom:10,lineHeight:1.4}}>
                  Pick one or more — they can stack. Manual entry on top of a parsed card lets you fix anything the parser got wrong.
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {inputTile("card","📋","Paste card","Player card text from sokker.org — fastest path.")}
                  {inputTile("history","📄","Training history","Best accuracy. JSON from the API endpoint.")}
                  {inputTile("manual","✏️","Manual entry","Type skills directly. Useful for hypothetical players.")}
                </div>
              </div>

              {/* Card paste block */}
              {tilesOn.card&&(
                <div style={sC}>
                  <div style={sL}>📋 Paste player card</div>
                  <textarea value={paste} onChange={e=>setPaste(e.target.value)}
                    placeholder={"Roman Rysio, wiek: 20\nklub: Zabójcze Strzały, kraj: Polska\nwartość : 788 000 zł\nwynagrodzenie: 13 800 zł\ntragiczna [0] forma\nbardzo dobra [9] dyscyplina taktyczna\ndobra [7] kondycja        słaby [4] bramkarz\nświetna [11] szybkość     bardzo dobry [9] obrońca\ndobra [7] technika        celujący [10] rozgrywający\nprzeciętne [5] podania    świetny [11] strzelec"}
                    style={{...sI,height:130,resize:"vertical",fontFamily:_ft,fontSize:11,lineHeight:1.5}}/>
                  <button onClick={handleParse} style={{...sB,marginTop:8,width:"100%"}}>Parse Player Card</button>
                </div>
              )}

              {/* Training history block */}
              {tilesOn.history&&(
                <div style={sC}>
                  <div style={sL}>📄 Training history</div>
                  <div style={{fontSize:11,color:C.txM,marginBottom:8,lineHeight:1.4}}>
                    Two steps. <b style={{color:C.tx}}>1.</b> Click the button below — it opens your training report in a new tab.
                    <b style={{color:C.tx}}> 2.</b> Select all the JSON, copy it, come back, paste it in the box.
                    Your Sokker login is required (works only for players on your active roster).
                  </div>
                  <button onClick={handleOpenTrainingReport}
                    disabled={!pid||!/^\d+$/.test(pid.trim())}
                    style={{...sB,width:"100%",marginBottom:10,
                      background:(!pid||!/^\d+$/.test(pid.trim()))?C.hi:C.acc,
                      color:(!pid||!/^\d+$/.test(pid.trim()))?C.txM:"#fff",
                      border:(!pid||!/^\d+$/.test(pid.trim()))?`1px solid ${C.bdr}`:"none",
                      cursor:(!pid||!/^\d+$/.test(pid.trim()))?"not-allowed":"pointer"}}>
                    {pid&&/^\d+$/.test(pid.trim())
                      ?`↗ Open training report for player ${pid}`
                      :"↗ Enter player ID above first"}
                  </button>
                  {/* v8: share toggle */}
                  <div style={{
                    background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,
                    padding:"8px 10px",marginBottom:8,fontSize:11,lineHeight:1.5,
                  }}>
                    <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",userSelect:"none"}}>
                      <input type="checkbox" checked={shareEnabled}
                        onChange={e=>updateShare(e.target.checked)}
                        style={{marginTop:2,cursor:"pointer",accentColor:C.acc}}/>
                      <span style={{color:shareEnabled?C.tx:C.txM}}>
                        Share this with the maintainer to improve the model
                        <button type="button"
                          onClick={()=>setShowShareInfo(v=>!v)}
                          style={{background:"none",border:"none",color:C.acc,
                            cursor:"pointer",padding:0,marginLeft:6,fontSize:11,
                            textDecoration:"underline"}}>
                          {showShareInfo?"hide details":"what's shared?"}
                        </button>
                      </span>
                    </label>
                    {showShareInfo&&(
                      <div style={{marginTop:6,paddingLeft:24,color:C.txM,fontSize:10,lineHeight:1.5}}>
                        Sent: player ID and name (if present in your paste), the training-history records you pasted, and the snapshot of estimates this app derived from them (current skills, talent, position).
                        Not sent: your sokker.org credentials, your IP address (we don't log it), your email, anything from other browser tabs.
                        Used for: backtesting the training model against real pop outcomes — the more bundles, the more accurate the planner gets for everyone.
                      </div>
                    )}
                  </div>
                  <textarea value={historyText} onChange={e=>setHistoryText(e.target.value)}
                    placeholder={'Paste here ↓\n\n{\n  "reports": [\n    { "week": 1184, "skills": {...}, ... },\n    ...\n  ]\n}'}
                    style={{...sI,height:120,resize:"vertical",fontFamily:_ft,fontSize:10,lineHeight:1.4}}/>
                  <button onClick={handleLoadHistory} style={{...sB,marginTop:8,width:"100%"}}>Load History</button>
                  {historyError&&<div style={{fontSize:11,color:C.red,marginTop:6}}>⚠ {historyError}</div>}
                  {historyReports&&(()=>{
                    const last=historyReports[historyReports.length-1];
                    const first=historyReports[0];
                    return(
                      <div style={{fontSize:11,color:C.txD,marginTop:8,lineHeight:1.5,fontFamily:_ft}}>
                        <div>✓ Weeks {first.week} → {last.week} ({historyReports.length} records loaded)</div>
                        {historyMeta?.player_id&&<div>Player ID: {historyMeta.player_id}</div>}
                        {historyMeta?.name&&<div>Name: {historyMeta.name}</div>}
                        <div style={{color:C.pop,marginTop:4}}>Current skills/age auto-filled from week {last.week}.</div>
                        {shareStatus==="sent"&&<div style={{color:C.pop}}>✓ Shared with maintainer.</div>}
                        {shareStatus==="duplicate"&&<div style={{color:C.txM}}>· Already shared previously.</div>}
                        {shareStatus==="failed"&&<div style={{color:C.warn}}>· Share failed (your data is fine — just didn't reach the corpus).</div>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Manual entry block */}
              {tilesOn.manual&&(
                <div style={sC}>
                  <div style={sL}>✏️ Manual entry</div>
                  <div style={{fontSize:11,color:C.txM,marginBottom:8,lineHeight:1.4}}>
                    Edit the skill levels and sub-levels directly in the panel on the right. Useful for hypothetical players or to fix anything the card parser misread.
                  </div>
                  <button onClick={handleManualActivate} style={{...sB,width:"100%"}}>I'll edit on the right →</button>
                </div>
              )}
            </div>

            {/* RIGHT: live skill editor */}
            <div>
              <div style={{...sC,minHeight:300}}>
                {hasPlayerData?(
                  <>
                    <div style={sL}>Player skills & sub-levels</div>
                    <SkillEditor
                      skills={skills} setSkills={setSkills}
                      subs={subs} setSubs={setSubs}
                      age={age} setAge={setAge}
                      pos={pos}
                      name={playerName||null}
                      warnings={playerWarnings}
                      editable={true}
                    />
                  </>
                ):(
                  <div style={{textAlign:"center",padding:"60px 20px",color:C.txM}}>
                    <div style={{fontSize:48,marginBottom:12,opacity:0.4}}>👤</div>
                    <div style={{fontSize:13,marginBottom:6,color:C.txD}}>No player loaded yet</div>
                    <div style={{fontSize:12,lineHeight:1.5,maxWidth:280,margin:"0 auto"}}>
                      Pick an input method on the left — paste a card, fetch training history, or enter skills by hand. The editor will populate here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <button onClick={()=>setStage("plan")} disabled={!hasPlayerData}
              style={{...sB,fontSize:14,padding:"12px 28px",
                opacity:hasPlayerData?1:0.4,cursor:hasPlayerData?"pointer":"not-allowed"}}>
              Continue to planner →
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 2 — PLAN                                                    */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {stage==="plan"&&(
        <div style={{maxWidth:1300}}>
          {!hasPlayerData&&(
            <div style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
              <div style={{color:C.warn,fontWeight:600,marginBottom:4}}>No player loaded</div>
              <div style={{fontSize:12,color:C.txD}}>
                Go back to <button onClick={()=>setStage("player")} style={{...sBs,padding:"2px 10px",fontSize:11,marginLeft:4,marginRight:4}}>1 · Player</button>
                to load skills before planning.
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"minmax(0,360px) minmax(0,1fr)",gap:16}}>
            {/* LEFT: parameters + strategies + run */}
            <div>
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
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
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

              <button onClick={runSim} disabled={selStrats.length===0||!hasPlayerData}
                style={{...sB,width:"100%",fontSize:16,padding:"14px 20px",
                  opacity:(selStrats.length===0||!hasPlayerData)?0.4:1,
                  cursor:(selStrats.length===0||!hasPlayerData)?"not-allowed":"pointer"}}>
                ▶ Run Simulation
              </button>
            </div>

            {/* RIGHT: results */}
            <div>
              {!results&&(
                <div style={{...sC,textAlign:"center",padding:60,color:C.txM}}>
                  <div style={{fontSize:40,marginBottom:8,opacity:0.4}}>📊</div>
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

                  <div style={{...sC,overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:_ft,fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:`2px solid ${C.bdr}`}}>
                          <th style={{textAlign:"left",padding:"6px 8px",color:C.txD}}>Skill</th>
                          <th style={{textAlign:"center",padding:"6px 4px",color:C.txD,width:50}}>Start</th>
                          {keys.map(k=>(
                            <th key={k} style={{textAlign:"center",padding:"6px 8px",fontWeight:600,borderLeft:`1px solid ${C.bdr}`,
                              color:results[k].isSale?C.warn:C.acc}}>{allStrats[k]?.name||k}</th>
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

                  {(()=>{
                    const logKey=showLog||keys[0];
                    const logData=results[logKey]?.log||[];
                    const relCols=OS.filter(sk=>prof.w[sk]>0);
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
                              {OS.filter(sk=>prof.w[sk]>0).map(sk=>(
                                <th key={sk} style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>{SN[sk]}</th>
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
                                {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                                  const hasPop=w.pops.some(p=>p[0]===sk);
                                  return(
                                    <td key={sk} style={{padding:"3px 6px",textAlign:"center",
                                      color:hasPop?C.pop:C.tx,fontWeight:hasPop?700:400}}>
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

                  <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                    <button onClick={()=>setStage("export")} style={{...sB,fontSize:14,padding:"12px 28px"}}>
                      Continue to export →
                    </button>
                  </div>
                </div>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 3 — EXPORT                                                  */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {stage==="export"&&(
        <div style={{maxWidth:900}}>
          {!hasPlayerData&&(
            <div style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
              <div style={{color:C.warn,fontWeight:600,marginBottom:4}}>Nothing to export yet</div>
              <div style={{fontSize:12,color:C.txD}}>
                Load a player on <button onClick={()=>setStage("player")} style={{...sBs,padding:"2px 10px",fontSize:11,marginLeft:4,marginRight:4}}>1 · Player</button>
                first.
              </div>
            </div>
          )}

          {hasPlayerData&&(
            <>
              <div style={sC}>
                <div style={sL}>What's in the bundle</div>
                <div style={{fontSize:13,color:C.tx,lineHeight:1.6,marginTop:8}}>
                  A self-contained JSON file describing this player's current state plus, if you loaded training history, the full weekly record. The desktop calibration tool consumes it directly.
                </div>
                <ul style={{fontSize:12,color:C.txD,lineHeight:1.7,marginTop:8,paddingLeft:20}}>
                  <li><b style={{color:C.tx}}>Snapshot</b> — current skills and your sub-level estimates, age, YS talent, position, horizon you planned for.</li>
                  <li><b style={{color:C.tx}}>Reports</b> — {historyReports?`${historyReports.length} weekly training records (week ${historyReports[0].week} → ${historyReports[historyReports.length-1].week})`:"empty (no training history loaded — load it on Stage 1 for richer calibration)"}.</li>
                  <li><b style={{color:C.tx}}>Player ID</b> — {pid&&/^\d+$/.test(pid)?pid:historyMeta?.player_id?historyMeta.player_id:"not set (the file will use the player name instead)"}.</li>
                </ul>
              </div>

              <div style={sC}>
                <div style={sL}>Bundle preview</div>
                <pre style={{
                  background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,
                  padding:12,fontSize:11,fontFamily:_ft,color:C.txD,
                  maxHeight:200,overflow:"auto",margin:"8px 0 0",lineHeight:1.5,
                }}>
{JSON.stringify({
  format_version:"1.0",
  source:"sokker-training-planner-online-v7",
  player:{player_id:pid&&/^\d+$/.test(pid)?parseInt(pid,10):historyMeta?.player_id||null,name:playerName||historyMeta?.name||null},
  user_snapshot:{
    current_skills:skills,
    subskills_estimate:Object.fromEntries(OS.map(sk=>[sk,(subs[sk]??25)/100])),
    age_current:age,
    talent_db_estimate:Number(td.toFixed(2)),
    position_assumed:pos,
    horizon_weeks:weeks,
  },
  reports:historyReports?`[ ${historyReports.length} reports ]`:[],
},null,2)}
                </pre>
              </div>

              <div style={sC}>
                <button onClick={handleExportBundle} style={{...sB,width:"100%",fontSize:15,padding:"14px 20px",
                  background:historyReports?C.pop:C.acc}}>
                  ⬇ Download Calibration Bundle (.json)
                </button>
                <div style={{fontSize:11,color:C.txM,marginTop:10,lineHeight:1.5}}>
                  {historyReports
                    ?`Bundle includes ${historyReports.length} training weeks plus your subskill/talent estimates. Drop into the desktop calibration tool to backtest the model against your real pop history.`
                    :"Bundle includes the current snapshot only. Loading training history on Stage 1 makes the bundle dramatically more useful — it lets the calibration backtest weekly predictions against real outcomes."}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{marginTop:24,textAlign:"center",fontSize:11,color:C.txM}}>
        Sokker Training Planner v8.4.2 · Three-stage interface · Calibration corpus enabled
      </div>

      {/* Mobile responsiveness — collapse 2-col grids below 720px */}
      <style>{`
        @media (max-width: 720px) {
          .player-stage-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
