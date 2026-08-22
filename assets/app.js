let DATA={stages:[],modules:[]};
let ACTIVE_CASE=null;
let CASE2={};
let byId={};
let mods={};
let activeModule="M1", activeStage="G3", activeStep=0, completed=new Set(), playing=false, paused=false;

function E(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}
function resultClass(s){return s.tone==="warn"?"sresult warnResult":"sresult"}

function renderConnection(){
 const root=document.getElementById("connFlow");root.innerHTML="";
 ["G0","G1","G2"].forEach((id,i)=>{
  const s=byId[id],n=E("div","stageCard");n.dataset.id=id;
  n.append(E("div","sid",id));n.append(E("div","stitle",s.title));n.append(E("div",resultClass(s),s.result));
  if(completed.has(id))n.classList.add("done");if(activeStage===id)n.classList.add("selected");
  n.onclick=()=>selectStage(id);root.append(n);if(i<2)root.append(E("div","arrow","→"));
 });
 root.append(E("div","arrow","→"));root.append(E("div","ready","GATEWAY READY"));
}

function renderModules(){
 const root=document.getElementById("moduleRow");root.innerHTML="";
 DATA.modules.forEach(m=>{
  const d=E("div","module"+(activeModule===m.id?" selected":""));d.dataset.id=m.id;
  d.append(E("div","mid",m.id));d.append(E("h3","",m.title));d.append(E("p","",m.subtitle));d.append(E("div","arch",m.arch));d.append(E("div","mresult",m.result));
  if(completed.has(m.id))d.classList.add("done");
  d.onclick=()=>{activeModule=m.id;activeStage=m.stages[0];activeStep=0;renderAll();};
  root.append(d);
 });
}

function renderSubflow(){
 const m=activeModule==="CONN"?{id:"CONN",title:"Connection",stages:["G0","G1","G2"]}:mods[activeModule];
 document.getElementById("expandTitle").textContent=`${m.id} · ${m.title}`;
 document.getElementById("expandCount").textContent=`${m.stages.length} stages`;
 const root=document.getElementById("subflow");root.innerHTML="";
 m.stages.forEach((id,i)=>{
  const s=byId[id],n=E("div","subnode"+(activeStage===id?" selected":""));n.dataset.id=id;
  n.append(E("div","sid",id));n.append(E("div","stitle",s.short));n.append(E("div",resultClass(s),s.result));
  if(completed.has(id))n.classList.add("done");n.onclick=()=>selectStage(id);root.append(n);
  if(i<m.stages.length-1)root.append(E("div","arrow","→"));
 });
}

function renderTabs(){
 const m=activeModule==="CONN"?{stages:["G0","G1","G2"]}:mods[activeModule];
 const root=document.getElementById("tabs");root.innerHTML="";
 m.stages.forEach(id=>{
  const s=byId[id],b=E("div","tab"+(activeStage===id?" selected":""));
  b.append(E("div","sid",id));b.append(E("div","stitle",s.short));b.onclick=()=>selectStage(id);root.append(b);
 });
}

function renderEvidence(s){
 const root=document.getElementById("evidenceBar");root.innerHTML="";
 s.evidence.forEach(ev=>root.append(E("span","echip "+ev,ev.toUpperCase())));
 root.append(E("span","echip",s.module==="CONN"?"CONNECTION":"REQUEST"));
 const labels=[];
 if(s.evidence.includes("runtime"))labels.push("runtime");
 if(s.evidence.includes("native"))labels.push("native");
 if(s.evidence.includes("source"))labels.push("source");
 if(s.evidence.includes("derived"))labels.push("derived");
 document.getElementById("coverageText").textContent=labels.join(" + ") || "—";
}

function renderSteps(s){
 const compact=document.getElementById("compactSteps");compact.innerHTML="";
 document.getElementById("stepCount").textContent=`${s.steps.length} steps`;
 s.steps.forEach((step,i)=>{
   const row=E("div","compactStep"+(i===activeStep?" selected":""));
   row.dataset.step=i;
   row.append(E("div","compactStepNum",`Step ${i+1}`));
   row.append(E("div","compactStepTitle",step.title));
   if(completed.has(`${s.id}:step:${i}`))row.classList.add("done");
   row.onclick=()=>{activeStep=i;sourceDetailOpen=true;renderSteps(s);syncSourceToggle();};
   compact.append(row);
 });
 const list=document.getElementById("sourceStepList");list.innerHTML="";
 s.steps.forEach((step,i)=>{
   const item=E("div","sourceStepItem"+(i===activeStep?" selected":""));
   item.dataset.step=i;
   item.append(E("div","sourceStepItemNum",`STEP ${i+1}`));
   item.append(E("div","sourceStepItemTitle",step.title));
   item.append(E("div","sourceStepItemSource",step.source));
   if(completed.has(`${s.id}:step:${i}`))item.classList.add("done");
   item.onclick=()=>{activeStep=i;renderSteps(s)};
   list.append(item);
 });
 const step=s.steps[activeStep] || s.steps[0];
 document.getElementById("stepPanelTitle").textContent=`Step ${activeStep+1} · ${step.title}`;
 document.getElementById("stepPanelText").textContent=step.detail;
 document.getElementById("stepCode").textContent=step.code;
 document.getElementById("stepSource").textContent=step.source;
 document.getElementById("stepStageChip").textContent=`${s.id} · STEP ${activeStep+1}`;
}

function stageNumber(id){return Number(String(id).replace("G",""));}
function setStateChip(id,label,tone){const el=document.getElementById(id);el.textContent=label;el.className=`stateChip ${tone}`;}
function setContextValue(valueId,stateId,value,stateLabel,tone,known){const valueEl=document.getElementById(valueId);valueEl.textContent=value;valueEl.classList.toggle("pendingValue",!known);setStateChip(stateId,stateLabel,tone);}

function renderKnownContext(s){
 const n=stageNumber(s.id);
 setContextValue("ctxRawSession","ctxRawSessionState",n>=4?CASE2.rawSessionKey:"—",n>=4?"raw":"—",n>=4?"info":"neutral",n>=4);
 setContextValue("ctxCanonicalSession","ctxCanonicalSessionState",n>=7?CASE2.canonicalSessionKey:"—",n>=7?"canonical":"—",n>=7?"good":"neutral",n>=7);
 setContextValue("ctxSessionEntry","ctxSessionEntryState",n>=7?"resolved":"—",n>=7?"resolved":"—",n>=7?"good":"neutral",n>=7);
 setContextValue("ctxSessionId","ctxSessionIdState",n>=8?CASE2.sessionId:"—",n>=8?"confirmed":"—",n>=8?"good":"neutral",n>=8);
 setContextValue("ctxAgent","ctxAgentState",n>=9?CASE2.agent:"—",n>=9?"resolved":"—",n>=9?"good":"neutral",n>=9);
 setContextValue("ctxPolicy","ctxPolicyState",n>=10?CASE2.sendPolicy:"—",n>=10?"allow":"—",n>=10?"good":"neutral",n>=10);
 setContextValue("ctxMsgContext","ctxMsgContextState",n>=13?"constructed":"—",n>=13?"built":"—",n>=13?"good":"neutral",n>=13);
 setContextValue("ctxDownstreamAgent","ctxDownstreamAgentState",n>=17?CASE2.downstreamAgent:"—",n>=17?"re-confirmed":"—",n>=17?"good":"neutral",n>=17);
}

function renderRiskState(s){
 const snapshot=ACTIVE_CASE?.stateByStage?.[s.id];
 if(!snapshot)return;
 setStateChip("riskAuth",snapshot.authentication.label,snapshot.authentication.tone);
 setStateChip("riskPolicy",snapshot.policy.label,snapshot.policy.tone);
 setStateChip("riskRuntime",snapshot.runtime.label,snapshot.runtime.tone);
 setStateChip("riskRouting",snapshot.routing.label,snapshot.routing.tone);
 setStateChip("riskOverall",snapshot.overall.label,snapshot.overall.tone);
}

function renderRuntimeIdentity(s){
 const n=stageNumber(s.id);
 const agent=document.getElementById("sideAgent");agent.textContent=n>=9?CASE2.agent:"—";agent.classList.toggle("pendingValue",n<9);
 const resolver=document.getElementById("sideResolver");resolver.textContent=n>=18?CASE2.resolver:"—";resolver.classList.toggle("pendingValue",n<18);
 const provider=document.getElementById("sideProvider");const model=document.getElementById("sideModel");const tools=document.getElementById("sideTools");const runtimeKnown=n>=18;
 provider.textContent=runtimeKnown?CASE2.provider:"—";model.textContent=runtimeKnown?CASE2.model:"—";tools.textContent=runtimeKnown?CASE2.tools:"—";
 [provider,model,tools].forEach(el=>el.classList.toggle("pendingValue",!runtimeKnown));
}

function renderDetail(){
 const s=byId[activeStage];
 document.getElementById("detailTitle").textContent=`${s.id} · ${s.title}`;
 ["purpose","case2","input","output","process","risk","source"].forEach(k=>document.getElementById(k).textContent=s[k]);
 document.getElementById("time").textContent=`time: ${s.time}`;document.getElementById("tokens").textContent=`tokens: ${s.tokens}`;document.getElementById("result").textContent=s.result;
 document.getElementById("sideStage").textContent=s.id;document.getElementById("sideResult").textContent=s.result;document.getElementById("sideResult").style.color=s.tone==="warn"?"var(--warn)":"var(--good)";
 document.getElementById("sideTime").textContent=s.time;document.getElementById("sideTokens").textContent=s.tokens;
 document.getElementById("concreteInput").textContent=s.concreteInput;document.getElementById("concreteOutput").textContent=s.concreteOutput;document.getElementById("inputEvidence").textContent=s.concreteInputEvidence;document.getElementById("outputEvidence").textContent=s.concreteOutputEvidence;
 renderEvidence(s);renderTabs();renderSteps(s);renderBreadcrumb(s);renderKnownContext(s);renderRiskState(s);renderRuntimeIdentity(s);
}

function renderBreadcrumb(s){
 const root=document.getElementById("detailBreadcrumb");root.innerHTML="";const parts=[];
 if(s.module==="CONN"){parts.push(["Layer","System / Connection"]);}else{const m=mods[s.module];parts.push(["Module",`${s.module} · ${m.title}`]);}
 parts.push(["Stage",`${s.id} · ${s.title}`]);parts.push(["Step",`${activeStep+1} · ${s.steps[activeStep].title}`]);
 parts.forEach((p,i)=>{const c=E("span","crumb");c.innerHTML=`${p[0]}: <strong>${p[1]}</strong>`;root.append(c);if(i<parts.length-1)root.append(E("span","crumbSep","›"));});
}

function renderLog(){const root=document.getElementById("log");root.innerHTML="";DATA.stages.forEach(s=>{const l=E("div","logline",`${s.id.padEnd(3)} ${s.result}`);l.dataset.id=s.id;root.append(l);});}
function renderAll(){renderConnection();renderModules();renderSubflow();renderDetail();}
function selectStage(id){activeStage=id;activeModule=byId[id].module;activeStep=0;renderAll();}

function setRunning(id){
 activeStage=id;activeModule=byId[id].module;activeStep=0;renderAll();
 document.querySelectorAll(".running").forEach(x=>x.classList.remove("running"));document.querySelectorAll(`[data-id="${id}"]`).forEach(x=>x.classList.add("running"));document.querySelectorAll(".logline").forEach(x=>x.classList.toggle("active",x.dataset.id===id));
 const s=byId[id];if(s.module!=="CONN"){const mc=document.querySelector(`.module[data-id="${s.module}"]`);if(mc)mc.classList.add("running");}
}

async function waitWhilePaused(){while(paused){await new Promise(r=>setTimeout(r,60));}}
async function sleepPausable(ms){let remaining=ms;const slice=50;while(remaining>0){await waitWhilePaused();const chunk=Math.min(slice,remaining);await new Promise(r=>setTimeout(r,chunk));remaining-=chunk;}}
async function animateSteps(s,baseMs){const per=Math.max(90,Math.floor(baseMs/Math.max(1,s.steps.length)));for(let i=0;i<s.steps.length;i++){await waitWhilePaused();activeStep=i;renderSteps(s);renderBreadcrumb(s);document.querySelectorAll(".compactStep,.sourceStepItem").forEach(x=>x.classList.remove("running"));const compact=document.querySelector(`.compactStep[data-step="${i}"]`);const source=document.querySelector(`.sourceStepItem[data-step="${i}"]`);if(compact)compact.classList.add("running");if(source)source.classList.add("running");await sleepPausable(per);completed.add(`${s.id}:step:${i}`);}}
function markDone(id){completed.add(id);const s=byId[id];if(s.module!=="CONN"){const m=mods[s.module];if(m.stages.every(x=>completed.has(x)))completed.add(s.module);}const doneStages=DATA.stages.filter(s=>completed.has(s.id)).length,pct=Math.round(doneStages/DATA.stages.length*100);document.getElementById("progressBar").style.width=pct+"%";document.getElementById("progressText").textContent=pct+"%";renderAll();}

function reset(){completed.clear();playing=false;paused=false;activeModule="M1";activeStage="G3";activeStep=0;const playBtn=document.getElementById("playBtn");playBtn.textContent="▶ Replay";playBtn.classList.remove("pauseState");const requestState=document.getElementById("requestState");requestState.textContent="READY";requestState.classList.remove("pausedState");document.getElementById("progressBar").style.width="0%";document.getElementById("progressText").textContent="0%";renderAll();renderLog();}
async function replay(){if(playing)return;reset();playing=true;paused=false;const playBtn=document.getElementById("playBtn");const requestState=document.getElementById("requestState");playBtn.textContent="⏸ Pause";playBtn.classList.add("pauseState");requestState.textContent="RUNNING";requestState.classList.remove("pausedState");for(const s of DATA.stages){await waitWhilePaused();setRunning(s.id);const ms=Number(document.getElementById("speed").value);await animateSteps(s,ms);await waitWhilePaused();markDone(s.id);}requestState.textContent="FINISHED";requestState.classList.remove("pausedState");playBtn.textContent="▶ Replay";playBtn.classList.remove("pauseState");playing=false;paused=false;}
function toggleReplay(){const playBtn=document.getElementById("playBtn");const requestState=document.getElementById("requestState");if(!playing){replay();return;}paused=!paused;if(paused){playBtn.textContent="▶ Resume";playBtn.classList.remove("pauseState");requestState.textContent="PAUSED";requestState.classList.add("pausedState");}else{playBtn.textContent="⏸ Pause";playBtn.classList.add("pauseState");requestState.textContent="RUNNING";requestState.classList.remove("pausedState");}}

let sourceDetailOpen=false;
function syncSourceToggle(){const d=document.getElementById("sourceDetail");const label=document.getElementById("sourceToggleLabel");const mark=document.getElementById("toggleMark");d.classList.toggle("open",sourceDetailOpen);label.textContent=sourceDetailOpen?"Hide source":"Source detail";mark.textContent=sourceDetailOpen?"−":"＋";}
document.getElementById("sourceToggle").onclick=()=>{sourceDetailOpen=!sourceDetailOpen;syncSourceToggle();};
document.getElementById("copyStepCode").onclick=async()=>{const value=document.getElementById("stepCode").textContent;try{await navigator.clipboard.writeText(value);const b=document.getElementById("copyStepCode");b.textContent="Copied";setTimeout(()=>b.textContent="Copy code",800);}catch(e){}};
document.getElementById("copyStepSource").onclick=async()=>{const value=document.getElementById("stepSource").textContent;try{await navigator.clipboard.writeText(value);const b=document.getElementById("copyStepSource");b.textContent="Copied";setTimeout(()=>b.textContent="Copy source",800);}catch(e){}};
document.addEventListener("keydown",e=>{if(e.key==="Escape" && sourceDetailOpen){sourceDetailOpen=false;syncSourceToggle();}});
document.getElementById("playBtn").onclick=toggleReplay;document.getElementById("resetBtn").onclick=reset;

function loadScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[data-case-src="${src}"]`);if(existing){resolve();return;}const el=document.createElement("script");el.src=src;el.dataset.caseSrc=src;el.onload=resolve;el.onerror=()=>reject(new Error(`Failed to load ${src}`));document.head.appendChild(el);});}
function mergeCase(caseData){const stages=window.GATEWAY_STAGE_CATALOG.map(base=>({...base,...(caseData.stages?.[base.id] || {})}));return {stages, modules:window.GATEWAY_MODULES};}
function populateCaseSelect(activeId){const select=document.getElementById("caseSelect");select.innerHTML="";(window.GATEWAY_CASE_INDEX || []).forEach(item=>{const opt=document.createElement("option");opt.value=item.id;opt.textContent=item.title;opt.selected=item.id===activeId;select.append(opt);});select.onchange=()=>{const url=new URL(window.location.href);url.searchParams.set("case",select.value);window.location.href=url.toString();};}
function applyCaseMeta(){const meta=ACTIVE_CASE.meta;CASE2=meta;document.title=`OpenClaw Gateway · ${meta.title}`;document.getElementById("queryText").textContent=meta.prompt || meta.title;document.getElementById("ackValue").textContent=meta.ack || "—";document.getElementById("titleSyncValue").textContent=meta.titleSync || "—";document.getElementById("resolverBoundaryText").innerHTML=`resolver: <code>${meta.resolverSource || meta.resolver || "—"}</code>`;}
async function initApp(){const params=new URLSearchParams(window.location.search);const requested=params.get("case");const index=window.GATEWAY_CASE_INDEX || [];const selected=index.find(x=>x.id===requested) || index[0];if(!selected){document.body.innerHTML="<pre>No trace cases are configured.</pre>";return;}await loadScript(selected.file);ACTIVE_CASE=window.GATEWAY_CASES?.[selected.id];if(!ACTIVE_CASE){throw new Error(`Trace case '${selected.id}' did not register.`);}DATA=mergeCase(ACTIVE_CASE);byId=Object.fromEntries(DATA.stages.map(s=>[s.id,s]));mods=Object.fromEntries(DATA.modules.map(m=>[m.id,m]));populateCaseSelect(selected.id);applyCaseMeta();completed.clear();activeModule="M1";activeStage="G3";activeStep=0;renderAll();renderLog();syncSourceToggle();}
initApp().catch(err=>{console.error(err);document.body.innerHTML=`<pre style="padding:24px;color:#eee">Failed to initialize trace viewer:\n${err.message}</pre>`;});
