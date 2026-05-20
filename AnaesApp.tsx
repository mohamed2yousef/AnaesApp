// @ts-nocheck
import { useState, useEffect } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#060d1a", surface:"#0c1a2e", card:"#0f2035", border:"#1c3456", dim:"#1a2e4a",
  cyan:"#00d4b8", cyanDim:"#00d4b812", cyanMid:"#00d4b830",
  blue:"#3b82f6", blueDim:"#3b82f618",
  green:"#22c55e", greenDim:"#22c55e18",
  red:"#f43f5e", redDim:"#f43f5e18",
  amber:"#f59e0b", amberDim:"#f59e0b18",
  purple:"#a855f7", purpleDim:"#a855f718",
  orange:"#fb923c", orangeDim:"#fb923c18",
  text:"#e2ecf8", muted:"#6b8aaa", faint:"#3a5472",
};
const LIGHT = {
  bg:"#f0f5fb", surface:"#ffffff", card:"#ffffff", border:"#d4e0ed", dim:"#e5eef8",
  cyan:"#0891b2", cyanDim:"#0891b212", cyanMid:"#0891b228",
  blue:"#2563eb", blueDim:"#2563eb12",
  green:"#16a34a", greenDim:"#16a34a12",
  red:"#dc2626", redDim:"#dc262612",
  amber:"#d97706", amberDim:"#d9770612",
  purple:"#7c3aed", purpleDim:"#7c3aed12",
  orange:"#ea580c", orangeDim:"#ea580c12",
  text:"#0f1e35", muted:"#4a6280", faint:"#8eacc4",
};
let C = { ...DARK };

// ─── MEDICAL CALCULATIONS ─────────────────────────────────────────────────────
const rnd = (n, dp=0) => dp===0 ? Math.round(n) : +n.toFixed(dp);
const calcBMI = (wt,ht) => ht>0 ? rnd(wt/(ht/100)**2, 1) : 0;
const calcIBW = (ht,sex) => { const i=ht/2.54, b=sex==="F"?45.5:50; return rnd(Math.max(b+2.3*(i-60),b),1); };
const calcLBW = (wt,ht,sex) => { const bmi=calcBMI(wt,ht); if(!bmi||!wt) return wt; return sex==="F" ? rnd((9270*wt)/(8780+244*bmi),1) : rnd((9270*wt)/(6680+216*bmi),1); };
const vc = (dose,conc,dp=1) => rnd(dose/conc, dp);

// ─── NSQIP RISK ───────────────────────────────────────────────────────────────
const calcNSQIP = (pt, po) => {
  let s = 0;
  const age = pt.age||0;
  if(age>=85) s+=5; else if(age>=75) s+=4; else if(age>=65) s+=3; else if(age>=50) s+=1;
  if(pt.sex==="M") s+=0.5;
  const asa = parseInt(pt.asa)||1;
  if(asa===2) s+=1; else if(asa===3) s+=3; else if(asa===4) s+=5; else if(asa>=5) s+=7;
  if(po.emergency) s+=4;
  if(po.funcStatus==="partial") s+=2; else if(po.funcStatus==="dependent") s+=4;
  const bmi = pt.weight&&pt.height ? calcBMI(pt.weight,pt.height) : 0;
  if(bmi>=40) s+=2; else if(bmi>0&&bmi<18.5) s+=1;
  if(po.diabetesType==="oral") s+=1; else if(po.diabetesType==="insulin") s+=2;
  if(po.dyspnoea==="exertion") s+=1; else if(po.dyspnoea==="rest") s+=3;
  if(po.copd) s+=2;
  if(po.smoker) s+=1;
  if(po.chf) s+=4;
  if(po.htn) s+=1;
  if(po.dialysis) s+=5;
  if(po.disseminatedCancer) s+=4;
  if(po.steroidUse) s+=1;
  if(po.ascites) s+=2;
  if(po.sepsisStatus==="sirs") s+=1; else if(po.sepsisStatus==="sepsis") s+=3; else if(po.sepsisStatus==="shock") s+=6;
  if(po.woundClass==="clean-cont") s+=1; else if(po.woundClass==="contaminated") s+=2; else if(po.woundClass==="dirty") s+=3;
  if(po.procComplexity==="minor") s-=2; else if(po.procComplexity==="major") s+=2; else if(po.procComplexity==="complex") s+=4;
  s = Math.max(0, Math.round(s));
  const lg = (base,mul) => +(100/(1+Math.exp(-(mul*s+base)))).toFixed(1);
  const mortality = lg(-5.2,0.28), anyComp = lg(-3.0,0.25), cardiac = lg(-5.8,0.26);
  const pneumonia = lg(-5.5,0.27), ssi = lg(-3.8,0.22), vte = lg(-5.2,0.22);
  const renal = lg(-6.5,0.28), returnOR = lg(-3.5,0.20);
  let category="Low", catColor=C.green;
  if(s>=14){category="Very High";catColor=C.red;} else if(s>=9){category="High";catColor=C.red;} else if(s>=5){category="Moderate";catColor=C.amber;}
  return {score:s,category,catColor,mortality,anyComp,cardiac,pneumonia,ssi,vte,renal,returnOR};
};

// ─── DRUG SHEET ────────────────────────────────────────────────────────────────
const buildDrugs = (pt) => {
  const {weight:tbw,height,sex,age} = pt;
  if(!tbw||!height||!sex) return null;
  const bmi=calcBMI(tbw,height), ibw=calcIBW(height,sex), lbw=calcLBW(tbw,height,sex);
  const obese=bmi>=30, elderly=age>=70;
  const pDW=obese?lbw:tbw, oDW=obese?lbw:tbw, nDW=obese?ibw:tbw;
  const pR=elderly||obese?[1.0,1.5]:[1.5,2.5];
  const d = (name,min,max,unit,conc,cv,dw) => ({name,min,max,unit,conc,dw,
    vMin:cv&&min!=null?vc(min,cv,min<5?2:1):null, vMax:cv&&max!=null?vc(max,cv,max<5?2:1):null});
  return {meta:{tbw,ibw,lbw,bmi,obese,elderly}, sections:[
    {title:"INDUCTION",color:C.cyan,drugs:[
      d("Propofol 1%",rnd(pR[0]*pDW),rnd(pR[1]*pDW),"mg","10mg/ml",10,`${obese?"LBW":elderly?"TBW↓":"TBW"} ${pDW}kg`),
      d("Thiopentone",rnd(3*tbw),rnd(5*tbw),"mg","25mg/ml",25,`TBW ${tbw}kg`),
      d("Ketamine IV",rnd(tbw),rnd(2*tbw),"mg","dilute 10mg/ml",10,`TBW ${tbw}kg`),
      d("Etomidate",rnd(0.3*tbw),null,"mg","2mg/ml",2,`TBW ${tbw}kg`),
    ]},
    {title:"MUSCLE RELAXANTS",color:C.blue,drugs:[
      d("Suxamethonium",rnd(1.5*tbw),null,"mg","50mg/ml",50,`TBW always`),
      d("Rocuronium (intub.)",rnd(0.6*nDW),null,"mg","10mg/ml",10,`${obese?"IBW":"TBW"} ${nDW}kg`),
      d("Rocuronium (RSI)",rnd(1.2*nDW),null,"mg","10mg/ml",10,`${obese?"IBW":"TBW"} ${nDW}kg`),
      d("Atracurium",rnd(0.5*nDW),null,"mg","10mg/ml",10,`${obese?"IBW":"TBW"} ${nDW}kg`),
      d("Cisatracurium",rnd(0.15*nDW),rnd(0.2*nDW),"mg","2mg/ml",2,`${obese?"IBW":"TBW"} ${nDW}kg`),
    ]},
    {title:"OPIOIDS",color:C.purple,drugs:[
      d("Fentanyl",rnd(oDW),rnd(3*oDW),"mcg","50mcg/ml",50,`${obese?"LBW":"TBW"} ${oDW}kg`),
      d("Morphine",rnd(0.1*oDW,1),rnd(0.2*oDW,1),"mg","10mg/ml",10,`${obese?"LBW":"TBW"} ${oDW}kg`),
      d("Alfentanil",rnd(10*oDW),rnd(20*oDW),"mcg","500mcg/ml",500,`${obese?"LBW":"TBW"} ${oDW}kg`),
    ]},
    {title:"REVERSAL",color:C.green,drugs:[
      d("Neostigmine",null,Math.min(rnd(50*tbw),5000),"mcg","2500mcg/ml",2500,`TBW max 5mg`),
      d("Glycopyrrolate",null,Math.min(rnd(10*tbw),400),"mcg","200mcg/ml",200,`with neostigmine`),
      d("Sugammadex (mod.)",rnd(2*tbw),null,"mg","200mg/ml",200,`TBW ${tbw}kg`),
      d("Sugammadex (deep)",rnd(4*tbw),null,"mg","200mg/ml",200,`TBW ${tbw}kg`),
      d("Atropine",null,Math.min(rnd(20*tbw),600),"mcg","600mcg/ml",600,`max 600mcg`),
    ]},
    {title:"LOCAL ANAESTHETICS — max doses",color:C.amber,drugs:[
      d("Lidocaine 1% plain",null,Math.min(rnd(3*tbw),200),"mg","10mg/ml",10,`max 200mg`),
      d("Lidocaine 1% +adr.",null,Math.min(rnd(7*tbw),500),"mg","10mg/ml",10,`max 500mg`),
      d("Bupivacaine 0.5%",null,Math.min(rnd(2*tbw),150),"mg","5mg/ml",5,`max 150mg`),
      d("Levobupivacaine 0.25%",null,Math.min(rnd(2*tbw),150),"mg","2.5mg/ml",2.5,`max 150mg`),
      d("Ropivacaine 0.75%",null,Math.min(rnd(3*tbw),200),"mg","7.5mg/ml",7.5,`max 200mg`),
    ]},
    {title:"ANTIEMETICS & ANALGESICS",color:C.orange,drugs:[
      d("Ondansetron",4,null,"mg","2mg/ml",2,"Fixed dose"),
      d("Dexamethasone",6,8,"mg","4mg/ml",4,"PONV prophylaxis"),
      d("Paracetamol IV",null,tbw<50?rnd(15*tbw):1000,"mg","10mg/ml",10,tbw<50?`15mg/kg`:`1g max`),
      d("Ketorolac",15,30,"mg","10mg/ml",10,"Fixed — check CI"),
    ]},
    {title:"VASOPRESSORS",color:C.red,drugs:[
      {name:"Metaraminol",min:"0.5",max:"2",unit:"mg",conc:"Diluted bolus",dw:"Titrate",vMin:null,vMax:null},
      {name:"Ephedrine",min:3,max:9,unit:"mg",conc:"Diluted bolus",dw:"Titrate",vMin:null,vMax:null},
      {name:"Phenylephrine",min:50,max:200,unit:"mcg",conc:"Diluted bolus",dw:"Titrate",vMin:null,vMax:null},
    ]},
  ]};
};

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const defaultIO = () => ({
  airwayType:"ETT",tubeSize:"",tubeType:"Cuffed",tubeDepth:"",clGrade:"1",attempts:"",
  bougie:false,vlary:false,airwayNotes:"",
  ventMode:"Volume Control",tv:"",rr:"",peep:"5",fio2:"40",breathNotes:"",
  artLine:false,cvl:false,lineNotes:"",inotropes:false,inotropeDetails:"",haemoNotes:"",
  analgesia:"",regional:"",
  crystType:"Hartmann's",crystVol:"",collType:"",collVol:"",
  rbc:"",ffp:"",plt:"",cryo:"",cell:"",ebl:"",urine:"",hbEnd:"",lactate:"",
  tSpo2:true,tMap:true,tUop:true,tTemp:true,tHb:false,tHbVal:"",tGluc:false,tGlucVal:"4-10",
  regAnalgesia:"",rescAnalgesia:"",abx:true,vte:true,extra:""
});

const defaultPreop = () => ({
  fastingConfirmed:false,lastFood:"",lastFluid:"",
  idConfirmed:false,consentSigned:false,siteMarked:false,allergiesChecked:false,
  ivAccess:false,ivDetails:"",airwayDone:false,planDiscussed:false,
  premed:false,premedDetails:"",whoChecklist:false,
  hb:"",wcc:"",plt:"",
  inr:"",pt:"",aptt:"",fibrinogen:"",
  na:"",k:"",urea:"",creatinine:"",egfr:"",glucose:"",alt:"",bili:"",
  ecgDate:"",ecgResult:"",
  echoDate:"",echoEF:"",echoFindings:"",
  cxrDate:"",cxrResult:"",
  otherInvests:"",
  consentNausea:true,consentSoreThroat:true,consentHeadache:true,consentDizziness:true,
  consentShivering:true,consentBruising:true,consentPainInj:true,consentConfusion:true,
  consentItching:true,consentBackache:true,consentChestInf:false,
  consentAwareness:true,consentAnaphylaxis:true,consentAspiration:true,
  consentDentalDmg:true,consentNerveInj:true,consentEyeInj:false,
  consentDVT:true,consentMI:false,consentStroke:false,consentDeath:false,
  consentFailedBlock:false,consentPDPH:false,consentTempNeuro:false,
  consentPermNeuro:false,consentEpiHaem:false,consentLAST:false,
  consentExtra:"",patientUnderstands:false,patientAgrees:false,
  anaesSig:"",witness:"",preAssessNotes:"",
  nsqipDone:false,funcStatus:"independent",emergency:false,
  diabetesType:"none",dyspnoea:"none",copd:false,smoker:false,
  htn:false,chf:false,dialysis:false,disseminatedCancer:false,
  steroidUse:false,ascites:false,sepsisStatus:"none",
  woundClass:"clean",procComplexity:"intermediate",
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,9);
const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = iso => new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"2-digit"});
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—";
const minsBetween = (a,b) => a&&b ? Math.round((new Date(b)-new Date(a))/60000) : null;
const fmtMins = m => m===null?"—":m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`;
const weekOf = iso => { const d=new Date(iso+"T12:00:00"),wd=d.getDay(),mon=new Date(d); mon.setDate(d.getDate()-(wd===0?6:wd-1)); const fri=new Date(mon); fri.setDate(mon.getDate()+4); return `${mon.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} – ${fri.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"})}`; };
const or = (v,fb="—") => v||fb;
const chk = (v,l) => `${v?"[✓]":"[ ]"} ${l}`;
const SEP = "─────────────────────────────────────";

// ─── STORAGE (localStorage) ───────────────────────────────────────────────────
const STORE = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ─── NOTE GENERATORS ──────────────────────────────────────────────────────────
const genHandover = (pt,list,io) => {
  const r = (v,u="")=>v?`${v}${u}`:"—";
  const lines = [SEP,"ANAESTHETIC HANDOVER NOTE",SEP,
    `Patient   : ${pt.name}${pt.age?` | ${pt.age}y`:""} ${pt.sex==="M"?"Male":"Female"}  |  ASA ${or(pt.asa)}`,
    `Procedure : ${or(pt.surgery)}  |  Technique: ${or(pt.technique)}`,
    `Date      : ${list?fmtDate(list.date):"—"}  |  ${or(list?.theatre)}`,
    "",
    "AIRWAY",
    `Device: ${or(io.airwayType)}${io.tubeSize?` | ${io.tubeSize}mm ${io.tubeType||""}`:""}`+`${io.tubeDepth?` | Depth: ${io.tubeDepth}cm`:""}`,
    ...(["ETT","Awake FOI","Reinforced","Double-lumen"].includes(io.airwayType)?
      [`C&L: Grade ${or(io.clGrade)}${io.attempts?` | Attempts: ${io.attempts}`:""}${io.bougie?" | Bougie":""}${io.vlary?" | VL":""}`]:[]),
    ...(io.airwayNotes?[`Notes: ${io.airwayNotes}`]:[]),
    "","BREATHING",
    `${or(io.ventMode)}${io.tv?` | TV:${io.tv}ml`:""}${io.rr?` | RR:${io.rr}`:""}${io.peep?` | PEEP:${io.peep}`:""}${io.fio2?` | FiO2:${io.fio2}%`:""}`,
    ...(io.breathNotes?[io.breathNotes]:[]),
    "","CIRCULATION",
    `Lines: ${[io.artLine?"Art line":null,io.cvl?"CVL":null,io.lineNotes||null].filter(Boolean).join(", ")||"Peripheral IV only"}`,
    `Vasopressors: ${io.inotropes?or(io.inotropeDetails,"Used"):"None"}`,
    ...(io.haemoNotes?[io.haemoNotes]:[]),
    "","PAIN MANAGEMENT",
    ...(io.analgesia?[io.analgesia]:[]),
    ...(io.regional?[`Regional: ${io.regional}`]:[]),
    ...(!io.analgesia&&!io.regional?["—"]:[]),
    "","FLUIDS & BLOOD PRODUCTS",
    `Crystalloid : ${io.crystVol?`${io.crystType} ${io.crystVol}ml`:"Not recorded"}`,
    ...(io.collVol?[`Colloid     : ${io.collType||"Colloid"} ${io.collVol}ml`]:[]),
    ...(io.rbc?[`pRBC        : ${io.rbc} unit(s)`]:[]),
    ...(io.ffp?[`FFP         : ${io.ffp} unit(s)`]:[]),
    ...(io.plt?[`Platelets   : ${io.plt} unit(s)`]:[]),
    ...(io.cryo?[`Cryo        : ${io.cryo} unit(s)`]:[]),
    ...(io.cell?[`Cell salvage: ${io.cell}ml`]:[]),
    `EBL: ${r(io.ebl,"ml")}  |  Urine: ${r(io.urine,"ml")}  |  Hb end: ${r(io.hbEnd," g/dL")}${io.lactate?`  |  Lactate: ${io.lactate}mmol/L`:""}`,
    "",SEP,"POST-OPERATIVE TARGETS",SEP,
    chk(io.tSpo2,"SpO2 > 94%"), chk(io.tMap,"MAP > 65 mmHg"),
    chk(io.tUop,"UOP > 0.5 ml/kg/hr"), chk(io.tTemp,"Temperature ≥ 36°C"),
    ...(io.tHb?[chk(true,`Hb target: ${io.tHbVal||"> 8"} g/dL`)]:[]),
    ...(io.tGluc?[chk(true,`Glucose: ${io.tGlucVal||"4-10"} mmol/L`)]:[]),
    "","POST-OP ANALGESIA",
    `Regular  : ${or(io.regAnalgesia)}`, `Rescue   : ${or(io.rescAnalgesia)}`,
    "", chk(io.abx,"Antibiotics — as per surgical team"),
    chk(io.vte,"VTE prophylaxis — as per surgical team"),
    ...(io.extra?[`\nADDITIONAL NOTES\n${io.extra}`]:[]),
    "",SEP,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
  ];
  return lines.flat().join("\n");
};

const genPreop = (pt,list,po) => {
  const bmi=pt.weight&&pt.height?calcBMI(pt.weight,pt.height):null;
  const ibw=pt.weight&&pt.height?calcIBW(pt.height,pt.sex):null;
  const lbw=pt.weight&&pt.height?calcLBW(pt.weight,pt.height,pt.sex):null;
  const isReg=["Spinal","Epidural","GA+Regional","GA+Spinal","Regional"].includes(pt.technique||"");
  const nsqip=po.nsqipDone?calcNSQIP(pt,po):null;
  const r=(v,u="")=>v?`${v}${u}`:"—";
  const lines=[SEP,"PRE-OPERATIVE ANAESTHETIC ASSESSMENT",SEP,
    `Patient    : ${pt.name}${pt.age?` | ${pt.age}y`:""} ${pt.sex==="M"?"Male":"Female"}  |  ASA ${or(pt.asa)}`,
    `Procedure  : ${or(pt.surgery)}  |  Technique: ${or(pt.technique)}`,
    `Date       : ${list?fmtDate(list.date):"—"}  |  ${or(list?.theatre)}`,
    `Weight     : ${r(pt.weight,"kg")}  |  Height: ${r(pt.height,"cm")}  |  BMI: ${bmi||"—"}`,
    ...(ibw?[`IBW (Devine): ${ibw}kg  |  LBW (Al-Sallami): ${lbw||"—"}kg`]:[]),
    pt.allergies?`\n⚠ ALLERGIES: ${pt.allergies}`:"Allergies  : NKDA",
    ...(pt.medHistory?[`\n${SEP}\nPAST MEDICAL HISTORY\n${SEP}\n${pt.medHistory}`]:[]),
    ...(pt.medications?[`\n${SEP}\nCURRENT MEDICATIONS\n${SEP}\n${pt.medications}`]:[]),
    `\n${SEP}`,`FASTING STATUS`,SEP,
    chk(po.fastingConfirmed,"Fasting confirmed")+
    (po.lastFood||po.lastFluid?` — Last food: ${po.lastFood||"—"} | Last fluid: ${po.lastFluid||"—"}`:""),
    "RCoA/AAGBI: Solids ≥6h · Clear fluids ≥2h",
    `\n${SEP}`,"INVESTIGATIONS",SEP,
    "HAEMATOLOGY",
    `Hb: ${r(po.hb," g/dL")}   WCC: ${r(po.wcc," ×10⁹/L")}   Platelets: ${r(po.plt," ×10⁹/L")}`,
    "\nCOAGULATION",
    `INR: ${r(po.inr)}   PT: ${r(po.pt," s")}   APTT: ${r(po.aptt," s")}   Fibrinogen: ${r(po.fibrinogen," g/L")}`,
    "\nBIOCHEMISTRY",
    `Na: ${r(po.na," mmol/L")}   K: ${r(po.k," mmol/L")}   Urea: ${r(po.urea," mmol/L")}   Creatinine: ${r(po.creatinine," µmol/L")}   eGFR: ${r(po.egfr," ml/min")}`,
    `Glucose: ${r(po.glucose," mmol/L")}   ALT: ${r(po.alt," U/L")}   Bilirubin: ${r(po.bili," µmol/L")}`,
    ...(po.ecgResult?[`\nECG — Date: ${po.ecgDate||"—"}\n${po.ecgResult}`]:[]),
    ...(po.echoFindings||po.echoEF?[`\nECHO — Date: ${po.echoDate||"—"}   EF: ${po.echoEF?po.echoEF+"%":"—"}\n${or(po.echoFindings)}`]:[]),
    ...(po.cxrResult?[`\nCXR — Date: ${po.cxrDate||"—"}\n${po.cxrResult}`]:[]),
    ...(po.otherInvests?[`\nOTHER INVESTIGATIONS\n${po.otherInvests}`]:[]),
    `\n${SEP}`,"ESSENTIAL PRE-OP CHECKS",SEP,
    ...[
      [po.idConfirmed,      "Patient identity confirmed"],
      [po.consentSigned,    "Consent form signed and reviewed"],
      [po.siteMarked,       "Operative site marked"],
      [po.allergiesChecked, "Allergy status documented and checked"],
      [po.ivAccess,         `IV access secured${po.ivDetails?` — ${po.ivDetails}`:""}`],
      [po.airwayDone,       "Airway assessment documented"],
      [po.planDiscussed,    "Anaesthetic plan discussed with patient"],
      [po.premed,           `Pre-medication${po.premedDetails?` — ${po.premedDetails}`:""}`],
      [po.whoChecklist,     "WHO Sign In completed"],
    ].filter(([v])=>v).map(([,l])=>`[✓] ${l}`),
    ...(nsqip?[`\n${SEP}`,"ACS NSQIP SURGICAL RISK ESTIMATE",SEP,
      `Risk Category  : ${nsqip.category}   (Score: ${nsqip.score}/30)`,
      `30-day Mortality          : ~${nsqip.mortality}%`,
      `Any Serious Complication  : ~${nsqip.anyComp}%`,
      `Cardiac Event             : ~${nsqip.cardiac}%`,
      `Pneumonia                 : ~${nsqip.pneumonia}%`,
      `SSI                       : ~${nsqip.ssi}%`,
      `VTE                       : ~${nsqip.vte}%`,
      `Renal Failure             : ~${nsqip.renal}%`,
      `Return to OR              : ~${nsqip.returnOR}%`,
      "Simplified estimate — see riskcalculator.facs.org for full calculator"]:[]),
    `\n${SEP}`,"CONSENT — ANAESTHESIA RISKS DISCUSSED (RCoA)",SEP,
    "The following risks were discussed with the patient:",
    "",
    "COMMON SIDE EFFECTS",
    ...[
      [po.consentNausea,   "Nausea & vomiting (PONV) — very common"],
      [po.consentSoreThroat,"Sore throat (ETT/LMA) — very common"],
      [po.consentHeadache, "Headache — common"],
      [po.consentDizziness,"Dizziness / feeling faint — common"],
      [po.consentShivering,"Shivering / feeling cold — common"],
      [po.consentBruising, "Bruising at cannula site — common"],
      [po.consentPainInj,  "Pain on injection (propofol) — common"],
      [po.consentConfusion,"Temporary confusion (especially elderly) — common"],
      [po.consentItching,  "Itching if opioids used — common"],
      [po.consentBackache, "Backache from positioning — common"],
      [po.consentChestInf, "Chest infection post-operatively"],
    ].filter(([v])=>v).map(([,l])=>`[✓] ${l}`),
    "\nRARE BUT SERIOUS RISKS",
    ...[
      [po.consentAwareness,  "Awareness during GA — ~1 in 19,000"],
      [po.consentAnaphylaxis,"Serious allergic reaction — ~1 in 10,000–20,000"],
      [po.consentAspiration, "Aspiration of stomach contents"],
      [po.consentDentalDmg,  "Dental/lip/tongue damage — ~1 in 4,500"],
      [po.consentNerveInj,   "Peripheral nerve injury (usually temporary)"],
      [po.consentEyeInj,     "Eye injury or visual disturbance"],
      [po.consentDVT,        "DVT / pulmonary embolism"],
      [po.consentMI,         "Heart attack"],
      [po.consentStroke,     "Stroke — very rare in healthy patients"],
      [po.consentDeath,      "Death from anaesthesia — ~1 in 100,000 healthy patients"],
    ].filter(([v])=>v).map(([,l])=>`[✓] ${l}`),
    ...(isReg?[
      "\nREGIONAL ANAESTHESIA — ADDITIONAL RISKS",
      ...[
        [po.consentFailedBlock,"Failed/incomplete block → may need GA — up to 1 in 20"],
        [po.consentPDPH,       "Post-dural puncture headache — ~1 in 100"],
        [po.consentTempNeuro,  "Temporary neurological symptoms — ~1 in 1,000"],
        [po.consentPermNeuro,  "Permanent neurological injury — ~1 in 24,000"],
        [po.consentEpiHaem,    "Epidural haematoma/abscess — ~1 in 168,000"],
        [po.consentLAST,       "Local anaesthetic systemic toxicity (LAST)"],
      ].filter(([v])=>v).map(([,l])=>`[✓] ${l}`),
    ]:[]),
    ...(po.consentExtra?[`\nAdditional risks discussed: ${po.consentExtra}`]:[]),
    "",
    ...(po.patientUnderstands?["[✓] Patient understands risks and had opportunity to ask questions"]:[]),
    ...(po.patientAgrees?["[✓] Patient agrees to proceed with anaesthesia"]:[]),
    `\nAnaesthetist : ${or(po.anaesSig)}`,
    `Witness      : ${or(po.witness)}`,
    `Date/Time    : ${new Date().toLocaleString("en-GB")}`,
    ...(po.preAssessNotes?[`\n${SEP}\nADDITIONAL NOTES\n${SEP}\n${po.preAssessNotes}`]:[]),
    `\n${SEP}`,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
  ];
  return lines.flat().join("\n");
};

const genListSummary = (list, patients) => {
  const pts = patients.filter(p => p.listId === list.id).sort((a,b) => a.order - b.order);
  const dur = minsBetween(list.listStart, list.listEnd);
  const header = [
    SEP, "THEATRE LIST HANDOVER", SEP,
    `Date      : ${fmtDate(list.date)}`,
    `Theatre   : ${or(list.theatre)}  |  Type: ${or(list.type)}`,
    ...(list.consultant ? [`Consultant: ${list.consultant}`] : []),
    `List Start: ${fmtTime(list.listStart)}  |  List End: ${fmtTime(list.listEnd)}${dur !== null ? `  |  Duration: ${fmtMins(dur)}  (${(dur/240).toFixed(2)} PAs)` : ""}`,
    ...(list.notes ? [`Notes     : ${list.notes}`] : []),
    "", `PATIENTS — ${pts.length}`, SEP,
  ];
  const ptLines = pts.map((pt, i) => {
    const bmi = calcBMI(pt.weight, pt.height);
    const pdur = minsBetween(pt.inRoomTime, pt.outTime);
    const io = pt.io || {};
    const po = pt.preop || {};
    const hasPreop = po.consentSigned || po.fastingConfirmed || po.hb || po.nsqipDone;
    const hasIntraop = io.airwayType || io.crystVol || io.analgesia || io.regAnalgesia;
    const lines = [
      `${i+1}. ${pt.name}${pt.age ? `  |  ${pt.age}y` : ""}  ${pt.sex==="M"?"Male":"Female"}  |  ASA ${or(pt.asa)}`,
      `   Procedure  : ${or(pt.surgery)}`,
      `   Technique  : ${or(pt.technique)}${pt.weight ? `  |  Weight: ${pt.weight}kg` : ""}${bmi ? `  |  BMI: ${bmi}` : ""}`,
      ...(pt.allergies ? [`   ⚠ ALLERGIES: ${pt.allergies}`] : []),
      ...(pt.medHistory ? [`   PMH        : ${pt.medHistory.slice(0,120)}${pt.medHistory.length>120?"…":""}`] : []),
      ...(pt.medications ? [`   Medications: ${pt.medications.slice(0,100)}${pt.medications.length>100?"…":""}`] : []),
      ...(pt.airway ? [`   Airway     : ${pt.airway}`] : []),
      ...(pt.surgeon ? [`   Surgeon    : ${pt.surgeon}`] : []),
    ];
    if (pt.inRoomTime || pt.inductionTime || pt.knifeTime || pt.outTime) {
      lines.push(`   Timing     : ${[
        pt.inRoomTime ? `In ${fmtTime(pt.inRoomTime)}` : null,
        pt.inductionTime ? `Induction ${fmtTime(pt.inductionTime)}` : null,
        pt.knifeTime ? `Knife ${fmtTime(pt.knifeTime)}` : null,
        pt.closureTime ? `Closure ${fmtTime(pt.closureTime)}` : null,
        pt.outTime ? `Out ${fmtTime(pt.outTime)}` : null,
        pdur !== null ? `(${fmtMins(pdur)})` : null,
      ].filter(Boolean).join(" | ")}`);
    }
    if (hasPreop) {
      lines.push(`   Pre-op     : ${[
        po.fastingConfirmed ? "Fasting ✓" : null,
        po.consentSigned ? "Consent ✓" : null,
        po.idConfirmed ? "ID ✓" : null,
        po.ivAccess ? `IV ✓${po.ivDetails?` (${po.ivDetails})`:""}`  : null,
        po.whoChecklist ? "WHO Sign-In ✓" : null,
      ].filter(Boolean).join(" | ") || "Documented"}`);
    }
    if (hasIntraop) {
      lines.push(`   Intraop    :`);
      if (io.airwayType) lines.push(`     Airway  : ${io.airwayType}${io.tubeSize?` ${io.tubeSize}mm`:""}${io.tubeDepth?` depth ${io.tubeDepth}cm`:""}${io.clGrade?` | CL Grade ${io.clGrade}`:""}`);
      if (io.crystVol) lines.push(`     Fluids  : ${io.crystType||"Crystalloid"} ${io.crystVol}ml${io.collVol?` + ${io.collType||"Colloid"} ${io.collVol}ml`:""}${io.ebl?` | EBL ${io.ebl}ml`:""}${io.urine?` | Urine ${io.urine}ml`:""}`);
      if (io.rbc||io.ffp||io.plt) lines.push(`     Blood   : ${[io.rbc?`pRBC ${io.rbc}u`:null,io.ffp?`FFP ${io.ffp}u`:null,io.plt?`Plt ${io.plt}u`:null].filter(Boolean).join(", ")}`);
      if (io.analgesia) lines.push(`     Analgesia: ${io.analgesia.slice(0,100)}`);
      if (io.regional) lines.push(`     Regional : ${io.regional}`);
      if (io.regAnalgesia) lines.push(`     Post-op  : ${io.regAnalgesia.slice(0,100)}`);
      if (io.rescAnalgesia) lines.push(`     Rescue   : ${io.rescAnalgesia.slice(0,80)}`);
      if (io.hbEnd) lines.push(`     Hb end   : ${io.hbEnd} g/dL${io.lactate?` | Lactate ${io.lactate} mmol/L`:""}`);
    }
    return lines.join("\n");
  });
  return [...header, ...ptLines.join("\n\n").split("\n"), "", SEP, `AnaesApp — ${new Date().toLocaleString("en-GB")}`, SEP].join("\n");
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const makeCSS = (c) => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:${c.bg};color:${c.text};font-family:'Inter',system-ui,sans-serif}
.mono{font-family:'JetBrains Mono',monospace}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${c.border};border-radius:2px}
@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes sp{to{transform:rotate(360deg)}}
.fu{animation:fu .2s ease both}.live{animation:blink 1.6s infinite}
input,select,textarea{font-family:'Inter',system-ui,sans-serif;background:${c.surface};color:${c.text};border:1px solid ${c.border};border-radius:10px;padding:10px 13px;font-size:14px;width:100%;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:${c.cyan};box-shadow:0 0 0 3px ${c.cyanMid}}
input::placeholder,textarea::placeholder{color:${c.faint}}
select option{background:${c.card}}
.lbl{font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${c.muted};margin-bottom:5px;display:block}
.btn{border:none;cursor:pointer;border-radius:10px;font-family:'Inter',system-ui,sans-serif;font-weight:600;display:inline-flex;align-items:center;gap:6px;transition:all .13s;white-space:nowrap}
.btn:active{transform:scale(.95)}
.bc{background:${c.cyan};color:${c.bg};padding:11px 18px;font-size:13px}
.bsm{padding:8px 14px;font-size:12px;border-radius:9px}
.bxs{padding:5px 10px;font-size:11px;border-radius:7px}
.bgh{background:${c.dim};color:${c.text};border:1px solid ${c.border}}
.bred{background:${c.redDim};color:${c.red};border:1px solid ${c.red}40}
.card{background:${c.card};border:1px solid ${c.border};border-radius:14px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.chip{display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
.cc{background:${c.cyanDim};color:${c.cyan};border:1px solid ${c.cyan}30}
.cb{background:${c.blueDim};color:${c.blue};border:1px solid ${c.blue}30}
.cg{background:${c.greenDim};color:${c.green};border:1px solid ${c.green}30}
.cr{background:${c.redDim};color:${c.red};border:1px solid ${c.red}30}
.ca{background:${c.amberDim};color:${c.amber};border:1px solid ${c.amber}30}
.cp{background:${c.purpleDim};color:${c.purple};border:1px solid ${c.purple}30}
.nb{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;border:none;background:none;cursor:pointer;color:${c.muted};font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;transition:color .15s}
.nb.on{color:${c.cyan}}
.shdr{font-size:10px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${c.muted};margin:16px 0 8px}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Ic = ({n,s=20,c="currentColor"}) => {
  const p = {
    home:<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    list:<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r=".6" fill="currentColor"/><circle cx="3" cy="12" r=".6" fill="currentColor"/><circle cx="3" cy="18" r=".6" fill="currentColor"/></>,
    audit:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    back:<><polyline points="15 18 9 12 15 6"/></>,
    trash:<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></>,
    warn:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    chev:<><polyline points="9 18 15 12 9 6"/></>,
    cal:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    play:<><polygon points="5 3 19 12 5 21 5 3"/></>,
    drug:<><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></>,
    clip:<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></>,
    intra:<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
    check:<><polyline points="20 6 9 17 4 12"/></>,
    moon:<><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    sun:<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    send:<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    ai:<><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><circle cx="18" cy="6" r="3" fill="currentColor" opacity=".6"/></>,
    spark:<><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8z" opacity=".6"/></>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[n]}</svg>;
};

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const Fld = ({label,mb=10,children}) => <div style={{marginBottom:mb}}><span className="lbl">{label}</span>{children}</div>;
const G2 = ({children,gap=8,mb=10}) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap,marginBottom:mb}}>{children}</div>;
const G3 = ({children,gap=6,mb=10}) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap,marginBottom:mb}}>{children}</div>;
const G4 = ({children,gap=6,mb=10}) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap,marginBottom:mb}}>{children}</div>;

const SHdr = ({title,color=C.cyan,right}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
    <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color}}>{title}</div>
    {right&&<div style={{fontSize:11,color:C.muted}}>{right}</div>}
  </div>
);

const TimeStamp = ({label,value,onStart,onClear,color=C.cyan}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",marginBottom:8}}>
    <div style={{fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.muted,marginBottom:5}}>{label}</div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div className="mono" style={{fontSize:22,fontWeight:700,color:value?color:C.faint}}>{value?fmtTime(value):"—:——"}</div>
      <div style={{display:"flex",gap:6}}>
        {!value&&<button className="btn bsm" style={{background:color+"18",color,border:`1px solid ${color}30`}} onClick={onStart}><Ic n="play" s={13}/>Now</button>}
        {value&&<button className="btn bred bxs" onClick={onClear}><Ic n="trash" s={12}/>Clear</button>}
      </div>
    </div>
  </div>
);

const Toggle = ({label,checked,onChange,color=C.green,sub}) => (
  <div style={{marginBottom:8}}>
    <button onClick={()=>onChange(!checked)} style={{
      width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
      border:`1px solid ${checked?color+"40":C.border}`,borderRadius:10,
      background:checked?color+"12":C.dim,cursor:"pointer",
      fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:12,
      color:checked?color:C.muted,transition:"all .15s",textAlign:"left"
    }}>
      <div style={{width:18,height:18,borderRadius:5,background:checked?color:C.faint,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background .15s"}}>
        {checked&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#060d1a" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <span style={{flex:1,lineHeight:1.3}}>{label}</span>
    </button>
    {sub&&<div style={{fontSize:10,color:C.faint,marginLeft:36,marginTop:2}}>{sub}</div>}
  </div>
);

const CRow = ({label,checked,onChange,color=C.green,sub,detail,detailPh,onDetail}) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <button onClick={()=>onChange(!checked)} style={{
        width:20,height:20,borderRadius:5,border:`2px solid ${checked?color:C.border}`,
        background:checked?color:C.dim,flexShrink:0,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"
      }}>
        {checked&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#060d1a" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </button>
      <span onClick={()=>onChange(!checked)} style={{fontSize:12,color:checked?C.text:C.muted,fontWeight:checked?600:400,flex:1,cursor:"pointer",lineHeight:1.4}}>{label}</span>
    </div>
    {sub&&<div style={{fontSize:10,color:C.faint,marginLeft:28,marginTop:1}}>{sub}</div>}
    {detail!==undefined&&checked&&onDetail&&(
      <input style={{marginLeft:28,marginTop:5,width:"calc(100% - 28px)",
        background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
        color:C.text,padding:"6px 10px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}
        placeholder={detailPh||"Details..."} value={detail} onChange={e=>onDetail(e.target.value)}/>
    )}
  </div>
);

const ResultInput = ({label,unit,val,onChange,ph}) => (
  <div style={{marginBottom:6}}>
    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",color:C.muted,marginBottom:2}}>
      {label}{unit&&<span style={{color:C.faint}}> {unit}</span>}
    </div>
    <input type="number" placeholder={ph||"—"} value={val} onChange={e=>onChange(e.target.value)}
      style={{padding:"6px 8px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",
        borderColor:val?C.cyan+"60":C.border,borderRadius:8}}/>
  </div>
);

const copyText = async (text,setCopied,setFallback) => {
  try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),3000);}
  catch{setFallback(text);}
};

const downloadText = (text, filename) => {
  const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const CopyFooter = ({onGenerate,copied,fallback,setFallback,label}) => (
  <>
    <button className="btn bc" style={{width:"100%",justifyContent:"center",padding:"14px",fontSize:14,marginBottom:10}} onClick={onGenerate}>
      <Ic n="clip" s={16}/>{copied?"✓ Copied to clipboard!":label}
    </button>
    {copied&&<div style={{background:C.greenDim,border:`1px solid ${C.green}35`,borderRadius:12,padding:"10px 14px",textAlign:"center",color:C.green,fontWeight:700,fontSize:13,marginBottom:10}}>✓ Paste directly into EPR</div>}
    {fallback&&(
      <div className="card fu" style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:C.cyan}}>Copy text below:</span>
          <button className="btn bgh bxs" onClick={()=>setFallback("")}>Close</button>
        </div>
        <textarea readOnly value={fallback} rows={16} style={{resize:"none",fontSize:11,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6}} onFocus={e=>e.target.select()}/>
      </div>
    )}
  </>
);

// ══════════════════════════════════════════════════════════════════════════════
// PRE-OP TAB
// ══════════════════════════════════════════════════════════════════════════════
function PreopTab({patient,patients,setPatients,list}){
  const po = patient.preop || defaultPreop();
  const [copied,setCopied] = useState(false);
  const [fallback,setFallback] = useState("");
  const up = patch => setPatients(prev=>prev.map(p=>p.id===patient.id?{...p,preop:{...(p.preop||defaultPreop()),...patch}}:p));
  const isReg = ["Spinal","Epidural","GA+Regional","GA+Spinal","Regional"].includes(patient.technique||"");
  const nsqip = po.nsqipDone ? calcNSQIP(patient,po) : null;

  const RI = ({label,unit,fk,ph}) => <ResultInput label={label} unit={unit} val={po[fk]} onChange={v=>up({[fk]:v})} ph={ph}/>;

  const commonSE = [
    {k:"consentNausea",l:"Nausea & vomiting (PONV)",sub:"Very common"},
    {k:"consentSoreThroat",l:"Sore throat (ETT/LMA)",sub:"Very common"},
    {k:"consentHeadache",l:"Headache",sub:"Common"},
    {k:"consentDizziness",l:"Dizziness / feeling faint",sub:"Common"},
    {k:"consentShivering",l:"Shivering on waking",sub:"Common"},
    {k:"consentBruising",l:"Bruising at cannula site",sub:"Common"},
    {k:"consentPainInj",l:"Pain on injection (propofol)",sub:"Common"},
    {k:"consentConfusion",l:"Temporary confusion (elderly)",sub:"Common"},
    {k:"consentItching",l:"Itching if opioids used",sub:"Common"},
    {k:"consentBackache",l:"Backache from positioning",sub:"Common"},
    {k:"consentChestInf",l:"Chest infection post-op",sub:"Uncommon"},
  ];
  const seriousRisks = [
    {k:"consentAwareness",l:"Awareness during GA",sub:"~1 in 19,000"},
    {k:"consentAnaphylaxis",l:"Serious allergic reaction",sub:"~1 in 10,000–20,000"},
    {k:"consentAspiration",l:"Aspiration of stomach contents",sub:"Higher risk in emergency"},
    {k:"consentDentalDmg",l:"Dental/lip/tongue damage",sub:"~1 in 4,500"},
    {k:"consentNerveInj",l:"Peripheral nerve injury",sub:"Rare, usually temporary"},
    {k:"consentEyeInj",l:"Eye injury",sub:"Very rare"},
    {k:"consentDVT",l:"DVT / pulmonary embolism",sub:"Rare"},
    {k:"consentMI",l:"Heart attack",sub:"Higher risk with cardiac disease"},
    {k:"consentStroke",l:"Stroke",sub:"Very rare in healthy patients"},
    {k:"consentDeath",l:"Death from anaesthesia",sub:"~1 in 100,000 healthy patients"},
  ];
  const regionalRisks = [
    {k:"consentFailedBlock",l:"Failed/incomplete block → may need GA",sub:"Up to 1 in 20"},
    {k:"consentPDPH",l:"Post-dural puncture headache",sub:"~1 in 100"},
    {k:"consentTempNeuro",l:"Temporary neurological symptoms",sub:"~1 in 1,000"},
    {k:"consentPermNeuro",l:"Permanent neurological injury",sub:"~1 in 24,000"},
    {k:"consentEpiHaem",l:"Epidural haematoma/abscess",sub:"~1 in 168,000"},
    {k:"consentLAST",l:"Local anaesthetic systemic toxicity",sub:"Rare — Intralipid available"},
  ];
  const cc = arr => arr.filter(i=>po[i.k]).length;

  return (
    <div className="fu" style={{paddingBottom:20}}>
      {(patient.medHistory||patient.medications||patient.allergies)&&(
        <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.muted}`}}>
          <SHdr title="Patient Summary (from Info tab)" color={C.muted}/>
          {patient.allergies&&(
            <div style={{background:C.redDim,border:`1px solid ${C.red}30`,borderRadius:8,padding:"8px 10px",marginBottom:8,display:"flex",gap:6}}>
              <Ic n="warn" s={14} c={C.red}/>
              <div><div style={{fontSize:10,fontWeight:700,color:C.red,letterSpacing:"0.8px"}}>ALLERGIES</div><div style={{fontSize:12,marginTop:1}}>{patient.allergies}</div></div>
            </div>
          )}
          {patient.medHistory&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:3}}>Past Medical History</div><div style={{fontSize:12,lineHeight:1.5,color:C.text}}>{patient.medHistory}</div></div>}
          {patient.medications&&<div><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:3}}>Current Medications</div><div style={{fontSize:12,lineHeight:1.5,color:C.text}}>{patient.medications}</div></div>}
        </div>
      )}

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.amber}`}}>
        <SHdr title="Fasting Status" color={C.amber}/>
        <CRow label="Fasting confirmed" checked={po.fastingConfirmed} onChange={v=>up({fastingConfirmed:v})} color={C.amber}/>
        {po.fastingConfirmed&&<G2 mb={8}>
          <Fld label="Last food" mb={0}><input placeholder="e.g. 06:00, toast" value={po.lastFood} onChange={e=>up({lastFood:e.target.value})}/></Fld>
          <Fld label="Last clear fluid" mb={0}><input placeholder="e.g. 08:30, water" value={po.lastFluid} onChange={e=>up({lastFluid:e.target.value})}/></Fld>
        </G2>}
        <div style={{background:C.amberDim,border:`1px solid ${C.amber}25`,borderRadius:8,padding:"7px 10px",fontSize:11,color:C.amber}}>
          RCoA/AAGBI: Solids ≥6h · Breast milk ≥4h · Clear fluids ≥2h
        </div>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.blue}`}}>
        <SHdr title="Investigations & Results" color={C.blue}/>
        <div style={{fontSize:10,fontWeight:700,color:C.red,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Haematology</div>
        <G3 mb={12}>
          <RI label="Hb" unit="g/dL" fk="hb" ph="13.2"/>
          <RI label="WCC" unit="×10⁹/L" fk="wcc" ph="7.8"/>
          <RI label="Platelets" unit="×10⁹/L" fk="plt" ph="220"/>
        </G3>
        <div style={{fontSize:10,fontWeight:700,color:C.purple,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Coagulation</div>
        <G4 mb={12}>
          <RI label="INR" fk="inr" ph="1.0"/>
          <RI label="PT" unit="s" fk="pt" ph="12"/>
          <RI label="APTT" unit="s" fk="aptt" ph="30"/>
          <RI label="Fibrinogen" unit="g/L" fk="fibrinogen" ph="3.2"/>
        </G4>
        <div style={{fontSize:10,fontWeight:700,color:C.cyan,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Biochemistry</div>
        <G4 mb={6}>
          <RI label="Na" unit="mmol/L" fk="na" ph="138"/>
          <RI label="K" unit="mmol/L" fk="k" ph="4.2"/>
          <RI label="Urea" unit="mmol/L" fk="urea" ph="5.1"/>
          <RI label="Creatinine" unit="µmol/L" fk="creatinine" ph="82"/>
        </G4>
        <G4 mb={12}>
          <RI label="eGFR" unit="ml/min" fk="egfr" ph="85"/>
          <RI label="Glucose" unit="mmol/L" fk="glucose" ph="5.8"/>
          <RI label="ALT" unit="U/L" fk="alt" ph="28"/>
          <RI label="Bilirubin" unit="µmol/L" fk="bili" ph="12"/>
        </G4>
        <div style={{fontSize:10,fontWeight:700,color:C.amber,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Cardiac & Imaging</div>
        <div style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.amber,marginBottom:6}}>ECG</div>
          <G2 mb={0}>
            <Fld label="Date" mb={0}><input type="text" placeholder="dd/mm/yyyy" value={po.ecgDate} onChange={e=>up({ecgDate:e.target.value})}/></Fld>
            <Fld label="Interpretation" mb={0}><input type="text" placeholder="e.g. Sinus rhythm" value={po.ecgResult} onChange={e=>up({ecgResult:e.target.value})}/></Fld>
          </G2>
        </div>
        <div style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>Echocardiogram</div>
          <G3 mb={0}>
            <Fld label="Date" mb={0}><input type="text" placeholder="dd/mm/yyyy" value={po.echoDate} onChange={e=>up({echoDate:e.target.value})}/></Fld>
            <Fld label="EF %" mb={0}><input type="number" placeholder="e.g. 60" value={po.echoEF} onChange={e=>up({echoEF:e.target.value})}/></Fld>
            <Fld label="Findings" mb={0}><input type="text" placeholder="e.g. Normal LV" value={po.echoFindings} onChange={e=>up({echoFindings:e.target.value})}/></Fld>
          </G3>
        </div>
        <div style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:6}}>CXR</div>
          <G2 mb={0}>
            <Fld label="Date" mb={0}><input type="text" placeholder="dd/mm/yyyy" value={po.cxrDate} onChange={e=>up({cxrDate:e.target.value})}/></Fld>
            <Fld label="Result" mb={0}><input type="text" placeholder="e.g. Clear lung fields" value={po.cxrResult} onChange={e=>up({cxrResult:e.target.value})}/></Fld>
          </G2>
        </div>
        <Fld label="Other investigations / results" mb={0}>
          <textarea placeholder="CPET, spirometry, blood gas, specialist investigations..." value={po.otherInvests} onChange={e=>up({otherInvests:e.target.value})} rows={2} style={{resize:"none"}}/>
        </Fld>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.cyan}`}}>
        <SHdr title="Essential Pre-op Checks" color={C.cyan}/>
        {[
          {k:"idConfirmed",l:"Patient identity confirmed (name, DOB, hospital no.)",c:C.green},
          {k:"consentSigned",l:"Consent form signed and reviewed",c:C.amber},
          {k:"siteMarked",l:"Operative site marked (if applicable)",c:C.green},
          {k:"allergiesChecked",l:"Allergy status documented & cross-checked",c:C.red},
          {k:"airwayDone",l:"Airway assessment documented",c:C.amber},
          {k:"planDiscussed",l:"Anaesthetic plan discussed with patient",c:C.green},
          {k:"whoChecklist",l:"WHO Sign In completed",c:C.purple},
        ].map(i=><CRow key={i.k} label={i.l} checked={po[i.k]} onChange={v=>up({[i.k]:v})} color={i.c}/>)}
        <div style={{height:1,background:C.border,margin:"6px 0"}}/>
        <CRow label="IV access secured" checked={po.ivAccess} onChange={v=>up({ivAccess:v})} color={C.green}
          detail={po.ivDetails} detailPh="Site & gauge e.g. 18G right AC" onDetail={v=>up({ivDetails:v})}/>
        <CRow label="Pre-medication given" checked={po.premed} onChange={v=>up({premed:v})} color={C.blue}
          detail={po.premedDetails} detailPh="Drug, dose, route, time" onDetail={v=>up({premedDetails:v})}/>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.purple}`}}>
        <SHdr title="ACS NSQIP Surgical Risk" color={C.purple}/>
        <div style={{background:C.purpleDim,border:`1px solid ${C.purple}25`,borderRadius:8,padding:"7px 10px",fontSize:11,color:C.purple,marginBottom:10}}>
          Approximate estimates based on ACS NSQIP methodology. Use riskcalculator.facs.org for the validated calculator.
        </div>
        <Toggle label="Calculate NSQIP risk" checked={po.nsqipDone} onChange={v=>up({nsqipDone:v})} color={C.purple}/>
        {po.nsqipDone&&<div className="fu" style={{marginTop:10}}>
          <G2 mb={8}>
            <Fld label="Functional Status" mb={0}>
              <select value={po.funcStatus} onChange={e=>up({funcStatus:e.target.value})}>
                <option value="independent">Independent</option>
                <option value="partial">Partially Dependent</option>
                <option value="dependent">Totally Dependent</option>
              </select>
            </Fld>
            <Fld label="Sepsis" mb={0}>
              <select value={po.sepsisStatus} onChange={e=>up({sepsisStatus:e.target.value})}>
                <option value="none">None</option>
                <option value="sirs">SIRS</option>
                <option value="sepsis">Sepsis</option>
                <option value="shock">Septic Shock</option>
              </select>
            </Fld>
          </G2>
          <G2 mb={8}>
            <Fld label="Diabetes" mb={0}>
              <select value={po.diabetesType} onChange={e=>up({diabetesType:e.target.value})}>
                <option value="none">None</option>
                <option value="oral">Oral medication</option>
                <option value="insulin">Insulin</option>
              </select>
            </Fld>
            <Fld label="Dyspnoea" mb={0}>
              <select value={po.dyspnoea} onChange={e=>up({dyspnoea:e.target.value})}>
                <option value="none">None</option>
                <option value="exertion">On exertion</option>
                <option value="rest">At rest</option>
              </select>
            </Fld>
          </G2>
          <G2 mb={8}>
            <Fld label="Wound Class" mb={0}>
              <select value={po.woundClass} onChange={e=>up({woundClass:e.target.value})}>
                <option value="clean">Clean</option>
                <option value="clean-cont">Clean/Contaminated</option>
                <option value="contaminated">Contaminated</option>
                <option value="dirty">Dirty/Infected</option>
              </select>
            </Fld>
            <Fld label="Procedure Complexity" mb={0}>
              <select value={po.procComplexity} onChange={e=>up({procComplexity:e.target.value})}>
                <option value="minor">Minor</option>
                <option value="intermediate">Intermediate</option>
                <option value="major">Major</option>
                <option value="complex">Complex/Cardiac</option>
              </select>
            </Fld>
          </G2>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {[
              {k:"emergency",l:"Emergency procedure",c:C.red},
              {k:"htn",l:"Hypertension on meds",c:C.blue},
              {k:"copd",l:"COPD",c:C.amber},
              {k:"smoker",l:"Current smoker",c:C.amber},
              {k:"chf",l:"CHF within 30 days",c:C.red},
              {k:"dialysis",l:"On dialysis",c:C.red},
              {k:"disseminatedCancer",l:"Disseminated cancer",c:C.red},
              {k:"steroidUse",l:"Steroids / immunosuppressants",c:C.orange},
              {k:"ascites",l:"Ascites within 30 days",c:C.orange},
            ].map(i=><Toggle key={i.k} label={i.l} checked={po[i.k]} onChange={v=>up({[i.k]:v})} color={i.c}/>)}
          </div>
          {nsqip&&(
            <div style={{background:nsqip.catColor+"12",border:`2px solid ${nsqip.catColor}35`,borderRadius:12,padding:"14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:800,fontSize:18,color:nsqip.catColor}}>{nsqip.category} Risk</div>
                <div className="mono" style={{fontSize:13,color:C.muted}}>Score {nsqip.score}/30</div>
              </div>
              <div style={{height:5,background:C.dim,borderRadius:4,marginBottom:12,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,(nsqip.score/30)*100)}%`,background:nsqip.catColor,borderRadius:4,transition:"width .4s"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[
                  {l:"30-day Mortality",v:`~${nsqip.mortality}%`,c:nsqip.catColor,bold:true},
                  {l:"Any Serious Complication",v:`~${nsqip.anyComp}%`,c:nsqip.catColor,bold:true},
                  {l:"Cardiac Event",v:`~${nsqip.cardiac}%`,c:C.red},
                  {l:"Pneumonia",v:`~${nsqip.pneumonia}%`,c:C.blue},
                  {l:"SSI",v:`~${nsqip.ssi}%`,c:C.amber},
                  {l:"VTE",v:`~${nsqip.vte}%`,c:C.purple},
                  {l:"Renal Failure",v:`~${nsqip.renal}%`,c:C.orange},
                  {l:"Return to OR",v:`~${nsqip.returnOR}%`,c:C.muted},
                ].map(r=>(
                  <div key={r.l} style={{background:C.bg,borderRadius:8,padding:"7px 10px",border:r.bold?`1px solid ${r.c}25`:"none"}}>
                    <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.6px"}}>{r.l}</div>
                    <div className="mono" style={{fontSize:15,fontWeight:r.bold?800:600,color:r.c,marginTop:2}}>{r.v}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:C.faint,marginTop:8,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                Approximate estimates — for validated predictions use riskcalculator.facs.org
              </div>
            </div>
          )}
        </div>}
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.green}`}}>
        <SHdr title="Consent — Common Side Effects" color={C.green} right={`${cc(commonSE)}/${commonSE.length}`}/>
        <div style={{background:C.greenDim,border:`1px solid ${C.green}25`,borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:10}}>
          Per Royal College of Anaesthetists patient information
        </div>
        {commonSE.map(i=><CRow key={i.k} label={i.l} sub={i.sub} checked={po[i.k]} onChange={v=>up({[i.k]:v})} color={C.green}/>)}
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.amber}`}}>
        <SHdr title="Consent — Rare but Serious Risks" color={C.amber} right={`${cc(seriousRisks)}/${seriousRisks.length}`}/>
        {seriousRisks.map(i=><CRow key={i.k} label={i.l} sub={i.sub} checked={po[i.k]} onChange={v=>up({[i.k]:v})} color={C.amber}/>)}
      </div>

      {isReg&&(
        <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.blue}`}}>
          <SHdr title="Consent — Regional Anaesthesia" color={C.blue} right={`${cc(regionalRisks)}/${regionalRisks.length}`}/>
          <div style={{background:C.blueDim,border:`1px solid ${C.blue}25`,borderRadius:8,padding:"7px 10px",fontSize:11,color:C.blue,marginBottom:10}}>
            Applicable — {patient.technique} planned
          </div>
          {regionalRisks.map(i=><CRow key={i.k} label={i.l} sub={i.sub} checked={po[i.k]} onChange={v=>up({[i.k]:v})} color={C.blue}/>)}
        </div>
      )}

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.purple}`}}>
        <SHdr title="Consent Declaration" color={C.purple}/>
        <Fld label="Additional risks discussed">
          <textarea placeholder="Any specific additional risks relevant to this patient..." value={po.consentExtra} onChange={e=>up({consentExtra:e.target.value})} rows={2} style={{resize:"none"}}/>
        </Fld>
        <G2 mb={10}>
          <CRow label="Patient understands risks" checked={po.patientUnderstands} onChange={v=>up({patientUnderstands:v})} color={C.purple}/>
          <CRow label="Patient agrees to proceed" checked={po.patientAgrees} onChange={v=>up({patientAgrees:v})} color={C.purple}/>
        </G2>
        <G2 mb={0}>
          <Fld label="Anaesthetist" mb={0}><input placeholder="Your name" value={po.anaesSig} onChange={e=>up({anaesSig:e.target.value})}/></Fld>
          <Fld label="Witness" mb={0}><input placeholder="Witness" value={po.witness} onChange={e=>up({witness:e.target.value})}/></Fld>
        </G2>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <SHdr title="Additional Assessment Notes" color={C.muted}/>
        <textarea placeholder="CPET, specialist review, anaesthetic plan, specific concerns..." value={po.preAssessNotes} onChange={e=>up({preAssessNotes:e.target.value})} rows={3} style={{resize:"none"}}/>
      </div>

      <CopyFooter label="Generate & Copy Pre-op Assessment" copied={copied} fallback={fallback}
        setFallback={setFallback} onGenerate={()=>copyText(genPreop(patient,list,po),setCopied,setFallback)}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INTRAOP TAB
// ══════════════════════════════════════════════════════════════════════════════
function IntraopTab({patient,patients,setPatients,list}){
  const io = patient.io || defaultIO();
  const [copied,setCopied] = useState(false);
  const [fallback,setFallback] = useState("");
  const up = patch => setPatients(prev=>prev.map(p=>p.id===patient.id?{...p,io:{...(p.io||defaultIO()),...patch}}:p));
  const airwayTypes=["ETT","LMA","IGEL","SAD","Awake FOI","Face mask","Tracheostomy","Spinal/Epidural only","Other"];
  const tubeTypes=["Cuffed","Uncuffed","Reinforced","Double-lumen","Preformed (RAE)"];
  const ventModes=["Volume Control","Pressure Control","Pressure Support","SIMV","Spontaneous","Not ventilated (SV)"];
  const crystTypes=["Hartmann's","0.9% NaCl","5% Dextrose","Plasmalyte","Other"];

  return (
    <div className="fu" style={{paddingBottom:20}}>
      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.cyan}`}}>
        <SHdr title="Airway" color={C.cyan}/>
        <Fld label="Device"><select value={io.airwayType} onChange={e=>up({airwayType:e.target.value})}>{airwayTypes.map(t=><option key={t}>{t}</option>)}</select></Fld>
        {["ETT","Awake FOI","Tracheostomy","Reinforced","Double-lumen"].includes(io.airwayType)&&(
          <G3 mb={10}>
            <Fld label="Size mm" mb={0}><input type="number" step="0.5" placeholder="7.0" value={io.tubeSize} onChange={e=>up({tubeSize:e.target.value})}/></Fld>
            <Fld label="Type" mb={0}><select value={io.tubeType} onChange={e=>up({tubeType:e.target.value})}>{tubeTypes.map(t=><option key={t}>{t}</option>)}</select></Fld>
            <Fld label="Depth cm" mb={0}><input type="number" step="0.5" placeholder="teeth" value={io.tubeDepth} onChange={e=>up({tubeDepth:e.target.value})}/></Fld>
          </G3>
        )}
        {!["Spinal/Epidural only","Face mask","Other"].includes(io.airwayType)&&(
          <>
            <G2 mb={8}>
              <Fld label="C&L Grade" mb={0}><select value={io.clGrade} onChange={e=>up({clGrade:e.target.value})}>{["1","2a","2b","3","4","Not attempted"].map(g=><option key={g} value={g}>Grade {g}</option>)}</select></Fld>
              <Fld label="Attempts" mb={0}><input type="number" min="1" max="5" placeholder="1" value={io.attempts} onChange={e=>up({attempts:e.target.value})}/></Fld>
            </G2>
            <G2 mb={10}>
              <Toggle label="Bougie used" checked={io.bougie} onChange={v=>up({bougie:v})} color={C.amber}/>
              <Toggle label="Videolaryngoscopy" checked={io.vlary} onChange={v=>up({vlary:v})} color={C.blue}/>
            </G2>
          </>
        )}
        <Fld label="Airway Notes" mb={0}><textarea placeholder="Difficulties, adjuncts, extubation plan..." value={io.airwayNotes} onChange={e=>up({airwayNotes:e.target.value})} rows={2} style={{resize:"none"}}/></Fld>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.blue}`}}>
        <SHdr title="Breathing / Ventilation" color={C.blue}/>
        <Fld label="Mode"><select value={io.ventMode} onChange={e=>up({ventMode:e.target.value})}>{ventModes.map(m=><option key={m}>{m}</option>)}</select></Fld>
        {!["Not ventilated (SV)","Spontaneous"].includes(io.ventMode)&&(
          <G4 mb={10}>
            <Fld label="TV ml" mb={0}><input type="number" placeholder="450" value={io.tv} onChange={e=>up({tv:e.target.value})}/></Fld>
            <Fld label="RR" mb={0}><input type="number" placeholder="12" value={io.rr} onChange={e=>up({rr:e.target.value})}/></Fld>
            <Fld label="PEEP" mb={0}><input type="number" placeholder="5" value={io.peep} onChange={e=>up({peep:e.target.value})}/></Fld>
            <Fld label="FiO₂ %" mb={0}><input type="number" placeholder="40" value={io.fio2} onChange={e=>up({fio2:e.target.value})}/></Fld>
          </G4>
        )}
        <Fld label="Notes" mb={0}><textarea placeholder="Pressures, compliance, events..." value={io.breathNotes} onChange={e=>up({breathNotes:e.target.value})} rows={2} style={{resize:"none"}}/></Fld>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.red}`}}>
        <SHdr title="Circulation" color={C.red}/>
        <G2 mb={10}>
          <Toggle label="Arterial line" checked={io.artLine} onChange={v=>up({artLine:v})} color={C.red}/>
          <Toggle label="Central venous line" checked={io.cvl} onChange={v=>up({cvl:v})} color={C.red}/>
        </G2>
        <Fld label="Lines / Access"><input placeholder="Sites, sizes, difficulties..." value={io.lineNotes} onChange={e=>up({lineNotes:e.target.value})}/></Fld>
        <Toggle label="Inotropes / Vasopressors used" checked={io.inotropes} onChange={v=>up({inotropes:v})} color={C.amber}/>
        {io.inotropes&&<Fld label="Details" mb={0}><input style={{marginTop:8}} placeholder="e.g. Metaraminol 3mg total, Noradrenaline 0.05mcg/kg/min" value={io.inotropeDetails} onChange={e=>up({inotropeDetails:e.target.value})}/></Fld>}
        <Fld label="Haemodynamic Notes" mb={0}><textarea style={{marginTop:8,resize:"none"}} placeholder="Events, arrhythmias, significant BP changes..." value={io.haemoNotes} onChange={e=>up({haemoNotes:e.target.value})} rows={2}/></Fld>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.purple}`}}>
        <SHdr title="Pain Management" color={C.purple}/>
        <Fld label="Intraoperative Analgesics"><textarea placeholder="e.g. Fentanyl 150mcg, Morphine 5mg, Paracetamol 1g IV..." value={io.analgesia} onChange={e=>up({analgesia:e.target.value})} rows={2} style={{resize:"none"}}/></Fld>
        <Fld label="Regional Technique" mb={0}><input placeholder="e.g. Spinal 2.5ml 0.5% hyperbaric bupivacaine + fentanyl 25mcg..." value={io.regional} onChange={e=>up({regional:e.target.value})}/></Fld>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.amber}`}}>
        <SHdr title="Fluids & Blood Products" color={C.amber}/>
        <G2 mb={8}>
          <Fld label="Crystalloid" mb={0}><select value={io.crystType} onChange={e=>up({crystType:e.target.value})}>{crystTypes.map(t=><option key={t}>{t}</option>)}</select></Fld>
          <Fld label="Volume ml" mb={0}><input type="number" placeholder="0" value={io.crystVol} onChange={e=>up({crystVol:e.target.value})}/></Fld>
        </G2>
        <G2 mb={8}>
          <Fld label="Colloid" mb={0}><input placeholder="e.g. Gelofusine" value={io.collType} onChange={e=>up({collType:e.target.value})}/></Fld>
          <Fld label="Volume ml" mb={0}><input type="number" placeholder="0" value={io.collVol} onChange={e=>up({collVol:e.target.value})}/></Fld>
        </G2>
        <G4 mb={10}>
          <Fld label="pRBC" mb={0}><input type="number" placeholder="0" value={io.rbc} onChange={e=>up({rbc:e.target.value})}/></Fld>
          <Fld label="FFP" mb={0}><input type="number" placeholder="0" value={io.ffp} onChange={e=>up({ffp:e.target.value})}/></Fld>
          <Fld label="Platelets" mb={0}><input type="number" placeholder="0" value={io.plt} onChange={e=>up({plt:e.target.value})}/></Fld>
          <Fld label="Cryo" mb={0}><input type="number" placeholder="0" value={io.cryo} onChange={e=>up({cryo:e.target.value})}/></Fld>
        </G4>
        <G3 mb={0}>
          <Fld label="Cell salvage ml" mb={0}><input type="number" placeholder="0" value={io.cell} onChange={e=>up({cell:e.target.value})}/></Fld>
          <Fld label="EBL ml" mb={0}><input type="number" placeholder="~200" value={io.ebl} onChange={e=>up({ebl:e.target.value})}/></Fld>
          <Fld label="Urine ml" mb={0}><input type="number" placeholder="0" value={io.urine} onChange={e=>up({urine:e.target.value})}/></Fld>
        </G3>
        <div style={{height:1,background:C.border,margin:"10px 0"}}/>
        <G2 mb={0}>
          <Fld label="Hb end of case g/dL" mb={0}><input type="number" step="0.1" placeholder="9.8" value={io.hbEnd} onChange={e=>up({hbEnd:e.target.value})}/></Fld>
          <Fld label="Lactate mmol/L" mb={0}><input type="number" step="0.1" placeholder="1.2" value={io.lactate} onChange={e=>up({lactate:e.target.value})}/></Fld>
        </G2>
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.green}`}}>
        <SHdr title="Post-operative Targets" color={C.green}/>
        <G2 mb={10}>
          <Toggle label="SpO₂ > 94%" checked={io.tSpo2} onChange={v=>up({tSpo2:v})}/>
          <Toggle label="MAP > 65 mmHg" checked={io.tMap} onChange={v=>up({tMap:v})}/>
          <Toggle label="UOP > 0.5 ml/kg/hr" checked={io.tUop} onChange={v=>up({tUop:v})}/>
          <Toggle label="Temp ≥ 36°C" checked={io.tTemp} onChange={v=>up({tTemp:v})}/>
          <Toggle label="Hb target" checked={io.tHb} onChange={v=>up({tHb:v})} color={C.amber}/>
          <Toggle label="Glucose target" checked={io.tGluc} onChange={v=>up({tGluc:v})} color={C.amber}/>
        </G2>
        {io.tHb&&<Fld label="Hb target g/dL"><input type="number" step="0.5" placeholder="> 8" value={io.tHbVal} onChange={e=>up({tHbVal:e.target.value})}/></Fld>}
        {io.tGluc&&<Fld label="Glucose range mmol/L"><input placeholder="4 - 10" value={io.tGlucVal} onChange={e=>up({tGlucVal:e.target.value})}/></Fld>}
      </div>

      <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.orange}`}}>
        <SHdr title="Post-operative Analgesia Plan" color={C.orange}/>
        <Fld label="Regular Analgesia (prescribed)"><textarea placeholder="e.g. Paracetamol 1g QDS, Ibuprofen 400mg TDS, Tramadol 50mg QDS..." value={io.regAnalgesia} onChange={e=>up({regAnalgesia:e.target.value})} rows={2} style={{resize:"none"}}/></Fld>
        <Fld label="Rescue Analgesia (as prescribed)" mb={10}><textarea placeholder="e.g. Oramorph 10mg PO PRN 4-hourly, Morphine 2.5mg IV PRN..." value={io.rescAnalgesia} onChange={e=>up({rescAnalgesia:e.target.value})} rows={2} style={{resize:"none"}}/></Fld>
        <G2>
          <Toggle label="Antibiotics — as per surgical team" checked={io.abx} onChange={v=>up({abx:v})} color={C.cyan}/>
          <Toggle label="VTE prophylaxis — as per surgical team" checked={io.vte} onChange={v=>up({vte:v})} color={C.cyan}/>
        </G2>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <SHdr title="Additional Notes" color={C.muted}/>
        <textarea placeholder="Any other information for the receiving team, escalation plan..." value={io.extra} onChange={e=>up({extra:e.target.value})} rows={3} style={{resize:"none"}}/>
      </div>

      <CopyFooter label="Generate & Copy Handover Note" copied={copied} fallback={fallback}
        setFallback={setFallback} onGenerate={()=>copyText(genHandover(patient,list,io),setCopied,setFallback)}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PATIENT DETAIL — 5 TABS
// ══════════════════════════════════════════════════════════════════════════════
function PatientDetail({patient,patients,setPatients,lists,onBack}){
  const [pTab,setPTab] = useState("info");
  const list = lists.find(l=>l.id===patient.listId);
  const up = patch => setPatients(prev=>prev.map(p=>p.id===patient.id?{...p,...patch}:p));
  const bmi=calcBMI(patient.weight,patient.height);
  const ibw=patient.weight&&patient.height?calcIBW(patient.height,patient.sex):null;
  const lbw=patient.weight&&patient.height?calcLBW(patient.weight,patient.height,patient.sex):null;
  const obese=bmi>=30;
  const drugs=buildDrugs(patient);

  const TABS = [
    {id:"info",  emoji:"ℹ️", label:"Info"},
    {id:"preop", emoji:"✅", label:"Pre-op"},
    {id:"intraop",emoji:"📋",label:"Intraop"},
    {id:"drugs", emoji:"💊", label:"Drugs"},
    {id:"timing",emoji:"⏱", label:"Timing"},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{position:"sticky",top:0,background:C.bg,zIndex:5,padding:"10px 16px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <button className="btn bgh bsm" onClick={onBack}><Ic n="back" s={15}/>Back</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{patient.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{patient.surgery||"No procedure"}{list?` · ${list.theatre}`:""}</div>
          </div>
          <span className="chip cr" style={{fontSize:11,flexShrink:0}}>ASA {patient.asa}</span>
        </div>
        <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:10,scrollbarWidth:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setPTab(t.id)} style={{
              flexShrink:0,minWidth:60,padding:"7px 6px",border:"none",borderRadius:9,cursor:"pointer",
              background:pTab===t.id?C.cyan:C.dim,color:pTab===t.id?"#060d1a":C.muted,
              fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .15s"
            }}>
              <span style={{fontSize:15,lineHeight:1}}>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 16px 80px"}}>
        {pTab==="info"&&(
          <div className="fu">
            {patient.allergies&&(
              <div style={{background:C.redDim,border:`1px solid ${C.red}35`,borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:8}}>
                <Ic n="warn" s={16} c={C.red}/><div><div style={{fontSize:11,fontWeight:700,color:C.red,letterSpacing:"0.8px"}}>ALLERGIES</div><div style={{fontSize:13,marginTop:2}}>{patient.allergies}</div></div>
              </div>
            )}
            <div className="card" style={{marginBottom:10}}>
              <SHdr title="Demographics & Weights"/>
              <G3 mb={10}>{[{l:"Age",v:patient.age?`${patient.age}y`:"—"},{l:"Sex",v:patient.sex==="M"?"Male":"Female"},{l:"ASA",v:`ASA ${patient.asa||"—"}`}].map(i=>(
                <div key={i.l} style={{background:C.bg,borderRadius:9,padding:"8px 10px"}}><div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.8px"}}>{i.l}</div><div style={{fontSize:14,fontWeight:700,marginTop:2}}>{i.v}</div></div>
              ))}</G3>
              {patient.weight&&patient.height&&<G2 mb={0}>{[{l:"TBW",v:`${patient.weight}kg`,c:C.cyan},{l:"IBW (Devine)",v:ibw?`${ibw}kg`:"—",c:C.blue},{l:"LBW (Al-Sallami)",v:lbw?`${lbw}kg`:"—",c:C.purple},{l:`BMI${obese?" ⚠️":""}`,v:bmi?String(bmi):"—",c:obese?C.amber:C.text}].map(i=>(
                <div key={i.l} style={{background:C.bg,borderRadius:9,padding:"8px 10px",border:obese&&i.l.includes("BMI")?`1px solid ${C.amber}35`:"none"}}><div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.8px"}}>{i.l}</div><div className="mono" style={{fontSize:16,fontWeight:700,color:i.c,marginTop:2}}>{i.v}</div></div>
              ))}</G2>}
            </div>
            <div className="card" style={{marginBottom:10}}>
              <SHdr title="Procedure & Technique"/>
              <Fld label="Surgery"><input value={patient.surgery||""} onChange={e=>up({surgery:e.target.value})} placeholder="Procedure name"/></Fld>
              <G2><Fld label="Surgeon" mb={0}><input value={patient.surgeon||""} onChange={e=>up({surgeon:e.target.value})}/></Fld>
              <Fld label="Technique" mb={0}><select value={patient.technique||"GA"} onChange={e=>up({technique:e.target.value})}>{["GA","TIVA","Spinal","Epidural","GA+Regional","GA+Spinal","MAC/Sedation","Regional","Other"].map(t=><option key={t}>{t}</option>)}</select></Fld></G2>
            </div>
            <div className="card" style={{marginBottom:10}}>
              <SHdr title="Clinical History"/>
              <Fld label="Allergies"><input value={patient.allergies||""} onChange={e=>up({allergies:e.target.value})} placeholder="Drug / latex / contrast..." style={{borderColor:patient.allergies?C.red+"50":C.border}}/></Fld>
              <Fld label="Past Medical History"><textarea value={patient.medHistory||""} onChange={e=>up({medHistory:e.target.value})} rows={3} style={{resize:"none"}} placeholder="PMH, comorbidities, previous anaesthetics..."/></Fld>
              <Fld label="Current Medications"><textarea value={patient.medications||""} onChange={e=>up({medications:e.target.value})} rows={2} style={{resize:"none"}} placeholder="Regular medications..."/></Fld>
              <Fld label="Airway Assessment" mb={0}><input value={patient.airway||""} onChange={e=>up({airway:e.target.value})} placeholder="Mallampati, mouth opening, TMD, neck mobility..."/></Fld>
            </div>
          </div>
        )}

        {pTab==="preop"&&<PreopTab patient={patient} patients={patients} setPatients={setPatients} list={list}/>}
        {pTab==="intraop"&&<IntraopTab patient={patient} patients={patients} setPatients={setPatients} list={list}/>}

        {pTab==="drugs"&&(
          <div className="fu">
            {!drugs?(
              <div className="card" style={{textAlign:"center",padding:32,color:C.muted}}><Ic n="drug" s={28} c={C.faint}/><div style={{marginTop:10,fontWeight:600}}>Enter weight & height in Info tab</div></div>
            ):(
              <>
                <div style={{background:`linear-gradient(135deg,${C.cyan}12,${C.blue}0a)`,border:`1px solid ${C.cyan}25`,borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",color:C.cyan,marginBottom:8}}>DOSING WEIGHTS — {patient.name}{patient.age?`, ${patient.age}y`:""}</div>
                  <G2 mb={6}>{[{l:"TBW",v:`${drugs.meta.tbw}kg`,c:C.cyan},{l:"IBW (Devine)",v:`${drugs.meta.ibw}kg`,c:C.blue},{l:"LBW (Al-Sallami)",v:`${drugs.meta.lbw}kg`,c:C.purple},{l:"BMI",v:`${drugs.meta.bmi}${drugs.meta.obese?" ⚠":""}`,c:drugs.meta.obese?C.amber:C.text}].map(w=>(
                    <div key={w.l} style={{background:C.bg+"90",borderRadius:8,padding:"6px 10px"}}><div style={{fontSize:10,color:C.muted,fontWeight:700}}>{w.l}</div><div className="mono" style={{fontSize:14,fontWeight:700,color:w.c}}>{w.v}</div></div>
                  ))}</G2>
                  {drugs.meta.obese&&<div style={{fontSize:11,color:C.amber,background:C.amberDim,borderRadius:8,padding:"6px 10px",marginTop:4}}>⚠ Obese — LBW for propofol/opioids · IBW for NDMRs · TBW for sux/sugammadex</div>}
                  {drugs.meta.elderly&&<div style={{fontSize:11,color:C.blue,background:C.blueDim,borderRadius:8,padding:"6px 10px",marginTop:4}}>ℹ Elderly ≥70 — reduced induction doses</div>}
                  <div style={{fontSize:10,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:6}}>⚕ Reference only — verify all doses, check contraindications, use clinical judgement</div>
                </div>
                {drugs.sections.map(sec=>(
                  <div key={sec.title} className="card" style={{marginBottom:10,borderLeft:`3px solid ${sec.color}`}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.2px",color:sec.color,marginBottom:10}}>{sec.title}</div>
                    {sec.drugs.map((drug,i)=>(
                      <div key={drug.name} style={{padding:"8px 0",borderBottom:i<sec.drugs.length-1?`1px solid ${C.dim}`:"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{drug.name}</div><div style={{fontSize:10,color:C.muted,marginTop:1}}>{drug.dw}</div></div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div className="mono" style={{fontSize:15,fontWeight:700,color:sec.color}}>
                              {drug.min!=null&&drug.max!=null?`${drug.min}–${drug.max} ${drug.unit}`:drug.min!=null?`${drug.min} ${drug.unit}`:drug.max!=null?`max ${drug.max} ${drug.unit}`:drug.unit}
                            </div>
                            {(drug.vMin||drug.vMax)&&<div className="mono" style={{fontSize:11,color:C.muted,marginTop:1}}>{drug.vMin&&drug.vMax?`${drug.vMin}–${drug.vMax}ml`:drug.vMin?`${drug.vMin}ml`:drug.vMax?`max ${drug.vMax}ml`:""}{drug.conc?` (${drug.conc})`:""}</div>}
                            {!drug.vMin&&!drug.vMax&&drug.conc&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{drug.conc}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {pTab==="timing"&&(
          <div className="fu">
            <div className="card" style={{marginBottom:12}}>
              <SHdr title={`Timing — ${patient.name}`}/>
              <TimeStamp label="In Room / Anaesthetic Room" value={patient.inRoomTime} onStart={()=>up({inRoomTime:nowISO()})} onClear={()=>up({inRoomTime:null})}/>
              <TimeStamp label="Induction Start" value={patient.inductionTime} onStart={()=>up({inductionTime:nowISO()})} onClear={()=>up({inductionTime:null})} color={C.blue}/>
              <TimeStamp label="Knife to Skin" value={patient.knifeTime} onStart={()=>up({knifeTime:nowISO()})} onClear={()=>up({knifeTime:null})} color={C.amber}/>
              <TimeStamp label="Dressing / Closure" value={patient.closureTime} onStart={()=>up({closureTime:nowISO()})} onClear={()=>up({closureTime:null})} color={C.orange}/>
              <TimeStamp label="Out of Theatre" value={patient.outTime} onStart={()=>up({outTime:nowISO()})} onClear={()=>up({outTime:null})} color={C.green}/>
            </div>
            {(patient.inRoomTime||patient.inductionTime)&&(
              <div className="card">
                <SHdr title="Interval Summary" color={C.muted}/>
                {[
                  {l:"Anaes room → Induction",a:patient.inRoomTime,b:patient.inductionTime,c:C.blue},
                  {l:"Induction → Knife",a:patient.inductionTime,b:patient.knifeTime,c:C.amber},
                  {l:"Knife → Closure",a:patient.knifeTime,b:patient.closureTime,c:C.orange},
                  {l:"Closure → Out",a:patient.closureTime,b:patient.outTime,c:C.purple},
                  {l:"Total (In → Out)",a:patient.inRoomTime,b:patient.outTime,c:C.cyan,bold:true},
                ].filter(r=>r.a&&r.b).map(r=>(
                  <div key={r.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.dim}`}}>
                    <div style={{fontSize:12,color:C.muted,fontWeight:r.bold?700:400}}>{r.l}</div>
                    <div className="mono" style={{fontSize:14,fontWeight:700,color:r.c}}>{fmtMins(minsBetween(r.a,r.b))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════════════════════════
function HomeScreen({lists,patients,onOpenList}){
  const today=todayISO();
  const todayLists=lists.filter(l=>l.date===today);
  const upcoming=lists.filter(l=>l.date>today).slice(0,3);
  const thisWeek=lists.filter(l=>Math.abs(new Date(l.date+"T12:00:00")-new Date())<7*864e5);
  const hrs=thisWeek.reduce((a,l)=>a+(minsBetween(l.listStart,l.listEnd)||0)/60,0);
  return(
    <div className="fu" style={{padding:"0 16px 16px"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>
        <h1 style={{fontSize:26,fontWeight:800}}>{new Date().getHours()<12?"Good morning":"Good afternoon"} ☕</h1>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[{l:"Today's Lists",v:todayLists.length,c:C.cyan},{l:"This Week",v:thisWeek.length,c:C.blue},{l:"Total Patients",v:patients.length,c:C.purple},{l:"Hrs this week",v:hrs.toFixed(1),c:C.amber}].map(s=>(
          <div key={s.l} className="card" style={{borderColor:s.c+"25",background:s.c+"0d"}}>
            <div className="mono" style={{fontSize:28,fontWeight:700,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2,fontWeight:600}}>{s.l}</div>
          </div>
        ))}
      </div>
      {todayLists.length>0&&<>
        <div className="shdr">Today</div>
        {todayLists.map(l=>{const pts=patients.filter(p=>p.listId===l.id);const done=pts.filter(p=>p.outTime).length;return(
          <div key={l.id} className="card fu" style={{marginBottom:10,cursor:"pointer",borderLeft:`3px solid ${C.cyan}`}} onClick={()=>onOpenList(l.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:700,fontSize:16}}>{l.theatre}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{l.type} · {pts.length} patients{l.consultant?` · ${l.consultant}`:""}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:11,color:C.muted}}>{done}/{pts.length} done</div>{l.listStart&&<div className="mono" style={{fontSize:12,color:C.cyan,marginTop:3}}>{fmtTime(l.listStart)}</div>}</div>
            </div>
          </div>
        );})}
      </>}
      {upcoming.length>0&&<>
        <div className="shdr">Upcoming</div>
        {upcoming.map(l=><div key={l.id} className="card fu" style={{marginBottom:8,cursor:"pointer",opacity:.8}} onClick={()=>onOpenList(l.id)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:700,fontSize:14}}>{l.theatre} <span style={{color:C.muted,fontWeight:400,fontSize:12}}>— {fmtDate(l.date)}</span></div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{l.type}</div></div>
            <Ic n="chev" s={16} c={C.muted}/>
          </div>
        </div>)}
      </>}
      {lists.length===0&&<div className="card" style={{textAlign:"center",padding:32,color:C.muted,marginTop:20}}><Ic n="cal" s={32} c={C.faint}/><div style={{marginTop:10,fontWeight:600}}>No lists yet</div><div style={{fontSize:12,marginTop:4}}>Go to Lists tab to create your first theatre list</div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LISTS SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function ListsScreen({lists,setLists,patients,onOpenList}){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({date:todayISO(),theatre:"",type:"Elective",consultant:"",notes:""});
  const types=["Elective","Emergency","Day Case","Trauma","Obstetric","Paediatric","Cardiothoracic","Neuro","Other"];
  const add=()=>{if(!form.theatre)return;setLists(prev=>[{...form,id:uid(),listStart:null,listEnd:null},...prev].sort((a,b)=>b.date.localeCompare(a.date)));setForm({date:todayISO(),theatre:"",type:"Elective",consultant:"",notes:""});setShowForm(false);};
  const grouped=lists.reduce((acc,l)=>{const w=weekOf(l.date);if(!acc[w])acc[w]=[];acc[w].push(l);return acc;},{});
  return(
    <div className="fu" style={{padding:"0 16px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><h2 style={{fontSize:20,fontWeight:800}}>Theatre Lists</h2><div style={{fontSize:12,color:C.muted}}>{lists.length} total</div></div>
        <button className="btn bc bsm" onClick={()=>setShowForm(!showForm)}><Ic n="plus" s={14}/>New List</button>
      </div>
      {showForm&&(
        <div className="card fu" style={{marginBottom:14,borderColor:C.cyan+"40"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.cyan,marginBottom:12}}>New Theatre List</div>
          <G2><Fld label="Date" mb={0}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Fld><Fld label="Theatre" mb={0}><input placeholder="e.g. Theatre 4" value={form.theatre} onChange={e=>setForm({...form,theatre:e.target.value})}/></Fld></G2>
          <G2><Fld label="Type" mb={0}><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></Fld><Fld label="Consultant" mb={0}><input placeholder="Supervisor" value={form.consultant} onChange={e=>setForm({...form,consultant:e.target.value})}/></Fld></G2>
          <Fld label="Notes"><textarea value={form.notes} rows={2} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:"none"}}/></Fld>
          <div style={{display:"flex",gap:8}}><button className="btn bc bsm" onClick={add}>Create</button><button className="btn bgh bsm" onClick={()=>setShowForm(false)}>Cancel</button></div>
        </div>
      )}
      {Object.keys(grouped).length===0&&<div className="card" style={{textAlign:"center",padding:32,color:C.muted}}><Ic n="cal" s={28} c={C.faint}/><div style={{marginTop:8,fontWeight:600}}>No lists yet</div></div>}
      {Object.entries(grouped).map(([week,wl])=>(
        <div key={week}><div className="shdr">{week}</div>
        {wl.map(l=>{const pts=patients.filter(p=>p.listId===l.id);const dur=minsBetween(l.listStart,l.listEnd);return(
          <div key={l.id} className="card fu" style={{marginBottom:10,cursor:"pointer"}} onClick={()=>onOpenList(l.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{l.theatre}</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>{fmtDate(l.date)} · {l.type}</div>{l.consultant&&<div style={{fontSize:11,color:C.faint,marginTop:2}}>{l.consultant}</div>}
                <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                  <span className="chip cb">{pts.length} patients</span>
                  {pts.filter(p=>p.outTime).length>0&&<span className="chip cg">{pts.filter(p=>p.outTime).length} done</span>}
                  {dur&&<span className="chip ca">{fmtMins(dur)}</span>}
                  {l.listStart&&!l.listEnd&&<span className="chip cc"><span className="live">●</span> Active</span>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <button className="btn bred bxs" onClick={e=>{e.stopPropagation();setLists(prev=>prev.filter(x=>x.id!==l.id));}}><Ic n="trash" s={12}/></button>
                <Ic n="chev" s={16} c={C.muted}/>
              </div>
            </div>
          </div>
        );})}
        </div>
      ))}
    </div>
  );
}

// ─── LIST EXPORT BAR ──────────────────────────────────────────────────────────
function ListExportBar({list, patients}) {
  const [copied, setCopied] = useState(false);
  const pts = patients.filter(p => p.listId === list.id);
  if (pts.length === 0) return null;

  const safeTheatre = (list.theatre || "list").replace(/[^a-z0-9]/gi, "_").slice(0,30);
  const safeDate = list.date || "date";
  const filename = `AnaesApp_${safeTheatre}_${safeDate}.txt`;

  const handleCopy = async () => {
    const text = genListSummary(list, patients);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      downloadText(text, filename);
    }
  };

  const handleDownload = () => downloadText(genListSummary(list, patients), filename);

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:C.muted,marginBottom:8}}>List Handover Export</div>
      <div style={{display:"flex",gap:8}}>
        <button
          className="btn bc bsm"
          style={{flex:1,justifyContent:"center",padding:"11px 8px",fontSize:13}}
          onClick={handleCopy}
        >
          <Ic n="clip" s={14}/>
          {copied ? "✓ Copied!" : "Copy Full List"}
        </button>
        <button
          className="btn bgh bsm"
          style={{justifyContent:"center",padding:"11px 14px",fontSize:13}}
          onClick={handleDownload}
          title="Download as .txt file"
        >
          ↓ .txt
        </button>
      </div>
      {copied && (
        <div style={{marginTop:8,background:C.greenDim,border:`1px solid ${C.green}35`,borderRadius:10,padding:"8px 12px",textAlign:"center",color:C.green,fontWeight:700,fontSize:12}}>
          ✓ Paste into EPR / email to handover team
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function ListDetail({list,patients,setLists,setPatients,onBack,onOpenPatient}){
  const [showAdd,setShowAdd]=useState(false);
  const [pf,setPf]=useState({name:"",age:"",sex:"M",weight:"",height:"",asa:"2",surgery:"",surgeon:"",technique:"GA",allergies:"",medHistory:"",medications:"",airway:"",notes:""});
  const pts=patients.filter(p=>p.listId===list.id).sort((a,b)=>a.order-b.order);
  const upList=patch=>setLists(prev=>prev.map(l=>l.id===list.id?{...l,...patch}:l));
  const dur=minsBetween(list.listStart,list.listEnd);
  const techs=["GA","TIVA","Spinal","Epidural","GA+Regional","GA+Spinal","MAC/Sedation","Regional","Other"];
  const tCol={GA:C.cyan,TIVA:C.cyan,Spinal:C.blue,Epidural:C.purple,"GA+Regional":C.orange,"GA+Spinal":C.orange,"MAC/Sedation":C.green,Regional:C.blue};

  const addPt=()=>{
    if(!pf.name)return;
    setPatients(prev=>[...prev,{...pf,id:uid(),listId:list.id,order:pts.length+1,
      weight:pf.weight?parseFloat(pf.weight):null,height:pf.height?parseFloat(pf.height):null,
      age:pf.age?parseInt(pf.age):null,
      inRoomTime:null,inductionTime:null,knifeTime:null,closureTime:null,outTime:null,
      io:defaultIO(),preop:defaultPreop()
    }]);
    setPf({name:"",age:"",sex:"M",weight:"",height:"",asa:"2",surgery:"",surgeon:"",technique:"GA",allergies:"",medHistory:"",medications:"",airway:"",notes:""});
    setShowAdd(false);
  };

  return(
    <div className="fu" style={{padding:"0 16px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button className="btn bgh bsm" onClick={onBack}><Ic n="back" s={15}/>Back</button>
        <div style={{flex:1}}><div style={{fontWeight:800,fontSize:17}}>{list.theatre}</div><div style={{fontSize:12,color:C.muted}}>{fmtDate(list.date)} · {list.type}</div></div>
      </div>

      <div className="card" style={{marginBottom:14,borderColor:C.cyan+"30"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.cyan,marginBottom:10}}>List Timing</div>
        <G2 mb={8}>
          <TimeStamp label="List Start" value={list.listStart} onStart={()=>upList({listStart:nowISO()})} onClear={()=>upList({listStart:null})}/>
          <TimeStamp label="List End" value={list.listEnd} onStart={()=>upList({listEnd:nowISO()})} onClear={()=>upList({listEnd:null})} color={C.green}/>
        </G2>
        {dur!==null&&<div style={{display:"flex",gap:10}}>
          <div style={{background:C.cyanDim,border:`1px solid ${C.cyan}25`,borderRadius:10,padding:"6px 12px"}}><div style={{fontSize:10,color:C.muted,fontWeight:700}}>DURATION</div><div className="mono" style={{fontSize:18,fontWeight:700,color:C.cyan}}>{fmtMins(dur)}</div></div>
          <div style={{background:C.amberDim,border:`1px solid ${C.amber}25`,borderRadius:10,padding:"6px 12px"}}><div style={{fontSize:10,color:C.muted,fontWeight:700}}>PAs (4h)</div><div className="mono" style={{fontSize:18,fontWeight:700,color:C.amber}}>{(dur/240).toFixed(2)}</div></div>
        </div>}
      </div>

      <ListExportBar list={list} patients={patients}/>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:15}}>{pts.length} Patients</div>
        <button className="btn bc bsm" onClick={()=>setShowAdd(!showAdd)}><Ic n="plus" s={14}/>Add Patient</button>
      </div>

      {showAdd&&(
        <div className="card fu" style={{marginBottom:14,borderColor:C.cyan+"40"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.cyan,marginBottom:12}}>New Patient</div>
          <Fld label="Full Name *"><input placeholder="Patient name" value={pf.name} onChange={e=>setPf({...pf,name:e.target.value})}/></Fld>
          <G3><Fld label="Age" mb={0}><input type="number" placeholder="yrs" value={pf.age} onChange={e=>setPf({...pf,age:e.target.value})}/></Fld><Fld label="Sex" mb={0}><select value={pf.sex} onChange={e=>setPf({...pf,sex:e.target.value})}><option value="M">Male</option><option value="F">Female</option></select></Fld><Fld label="ASA" mb={0}><select value={pf.asa} onChange={e=>setPf({...pf,asa:e.target.value})}>{["1","2","3","4","5"].map(a=><option key={a} value={a}>ASA {a}</option>)}</select></Fld></G3>
          <G2><Fld label="Weight kg" mb={0}><input type="number" placeholder="kg" value={pf.weight} onChange={e=>setPf({...pf,weight:e.target.value})}/></Fld><Fld label="Height cm" mb={0}><input type="number" placeholder="cm" value={pf.height} onChange={e=>setPf({...pf,height:e.target.value})}/></Fld></G2>
          <Fld label="Procedure"><input placeholder="e.g. Laparoscopic cholecystectomy" value={pf.surgery} onChange={e=>setPf({...pf,surgery:e.target.value})}/></Fld>
          <G2><Fld label="Surgeon" mb={0}><input placeholder="Surgeon" value={pf.surgeon} onChange={e=>setPf({...pf,surgeon:e.target.value})}/></Fld><Fld label="Technique" mb={0}><select value={pf.technique} onChange={e=>setPf({...pf,technique:e.target.value})}>{techs.map(t=><option key={t}>{t}</option>)}</select></Fld></G2>
          <Fld label="Allergies"><input placeholder="Drug / latex / other" value={pf.allergies} onChange={e=>setPf({...pf,allergies:e.target.value})} style={{borderColor:pf.allergies?C.red+"60":C.border}}/></Fld>
          <Fld label="PMH"><textarea value={pf.medHistory} rows={2} onChange={e=>setPf({...pf,medHistory:e.target.value})} style={{resize:"none"}} placeholder="Comorbidities..."/></Fld>
          <Fld label="Medications"><textarea value={pf.medications} rows={2} onChange={e=>setPf({...pf,medications:e.target.value})} style={{resize:"none"}} placeholder="Regular medications..."/></Fld>
          <Fld label="Airway"><input placeholder="Mallampati, mouth opening, TMD..." value={pf.airway} onChange={e=>setPf({...pf,airway:e.target.value})}/></Fld>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="btn bc bsm" onClick={addPt}>Add Patient</button><button className="btn bgh bsm" onClick={()=>setShowAdd(false)}>Cancel</button></div>
        </div>
      )}

      {pts.length===0&&!showAdd&&<div className="card" style={{textAlign:"center",padding:24,color:C.muted}}><div style={{fontWeight:600}}>No patients yet</div></div>}
      {pts.map((pt,i)=>{
        const bmi=calcBMI(pt.weight,pt.height),obese=bmi>=30,dur=minsBetween(pt.inRoomTime,pt.outTime);
        const hasPreop=pt.preop&&(pt.preop.consentSigned||pt.preop.hb||pt.preop.nsqipDone);
        const hasHandover=pt.io&&(pt.io.analgesia||pt.io.hbEnd||pt.io.regAnalgesia);
        return(
          <div key={pt.id} className="card fu" style={{marginBottom:10,cursor:"pointer",borderLeft:`3px solid ${pt.outTime?C.green:pt.inRoomTime?C.cyan:C.border}`}} onClick={()=>onOpenPatient(pt.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><div className="mono" style={{fontSize:12,color:C.muted,minWidth:20}}>{i+1}.</div><div style={{fontWeight:700,fontSize:15}}>{pt.name}</div></div>
                <div style={{marginLeft:28}}>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>{pt.surgery||"No procedure"}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                    <span className="chip cb" style={{fontSize:10}}>ASA {pt.asa}</span>
                    <span className="chip" style={{fontSize:10,background:(tCol[pt.technique]||C.cyan)+"18",color:tCol[pt.technique]||C.cyan,border:`1px solid ${(tCol[pt.technique]||C.cyan)}25`}}>{pt.technique}</span>
                    {pt.weight&&<span className="chip cc" style={{fontSize:10}}>{pt.weight}kg</span>}
                    {obese&&<span className="chip ca" style={{fontSize:10}}>BMI {bmi}</span>}
                    {pt.allergies&&<span className="chip cr" style={{fontSize:10}}>⚠ Allergy</span>}
                    {hasPreop&&<span className="chip cg" style={{fontSize:10}}>✅ Pre-op</span>}
                    {hasHandover&&<span className="chip cp" style={{fontSize:10}}>📋 HO</span>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <button className="btn bred bxs" onClick={e=>{e.stopPropagation();setPatients(prev=>prev.filter(p=>p.id!==pt.id));}}><Ic n="trash" s={11}/></button>
                {dur!==null&&<div className="mono" style={{fontSize:11,color:C.green}}>{fmtMins(dur)}</div>}
                {pt.inRoomTime&&!pt.outTime&&<div style={{fontSize:10,color:C.cyan,fontWeight:700}}><span className="live">●</span></div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const SPECIALTIES=["Colorectal","Upper GI","Hepatobiliary","Vascular","Urology","Gynaecology","Obstetrics","Orthopaedics","Spinal","Neurosurgery","Cardiothoracic","ENT","Maxillofacial","Plastics","Ophthalmology","Paediatrics","Emergency","Endoscopy","Radiology","Other"];
const TECHNIQUES=["GA","TIVA","Spinal","Epidural","GA+Regional","GA+Spinal","MAC/Sedation","Regional","Awake FOI","Other"];
const SUPERVISION=["Independent","Supervised (ST)","Supervised (Consultant)","Teaching/Supervised trainee","Observed"];
const COMPLEXITY=["Minor","Intermediate","Major","Complex/Cardiac"];
const CPD_TYPES=["Course","Conference","Teaching delivered","Audit/QIP","Simulation","Journal club","E-learning","Presentation","Publication","Other"];
const INCIDENT_TYPES=["Difficult airway","Failed intubation/CICO","Anaphylaxis","LAST","Awareness","Severe PONV","Significant hypotension","Block failure","Nerve injury","Wrong drug/dose","Cardiac arrest","Other complication"];

function PortfolioScreen({lists,patients,cases,setCases,cpd,setCpd,incidents,setIncidents}){
  const [pTab,setPTab]=useState("pa");
  const TABS=[{id:"pa",emoji:"📊",label:"PAs"},{id:"cases",emoji:"📚",label:"Cases"},{id:"cpd",emoji:"🎓",label:"CPD"},{id:"incidents",emoji:"⚠️",label:"Incidents"}];

  const PAsTab=()=>{
    const [filter,setFilter]=useState("month");
    const now=new Date();
    const fl=lists.filter(l=>{
      const d=new Date(l.date+"T12:00:00");
      if(filter==="week") return Math.abs(d-now)<7*864e5;
      if(filter==="month") return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
      if(filter==="year") return d.getFullYear()===now.getFullYear();
      return true;
    });
    const totalMins=fl.reduce((a,l)=>a+(minsBetween(l.listStart,l.listEnd)||0),0);
    const totalPAs=totalMins/240;
    const monthly=lists.reduce((acc,l)=>{
      if(!l.listStart||!l.listEnd) return acc;
      const key=l.date.slice(0,7);
      if(!acc[key])acc[key]={month:key,mins:0,lists:0,pts:0};
      acc[key].mins+=minsBetween(l.listStart,l.listEnd)||0;
      acc[key].lists+=1;
      acc[key].pts+=patients.filter(p=>p.listId===l.id).length;
      return acc;
    },{});
    const monthRows=Object.values(monthly).sort((a,b)=>b.month.localeCompare(a.month));
    const copyPA=async()=>{
      const lines=[SEP,"PA SUMMARY — ANAESTHESIA",SEP,
        `Generated: ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}`,
        `Period: ${filter==="week"?"This week":filter==="month"?"This month":filter==="year"?"This year":"All time"}`,
        `Total PAs: ${totalPAs.toFixed(2)}  |  Total hours: ${(totalMins/60).toFixed(1)}  |  Lists: ${fl.length}`,
        "",SEP,"MONTHLY BREAKDOWN",SEP,
        "Month         Lists   Patients   Hours    PAs",
        ...monthRows.map(r=>`${r.month}      ${String(r.lists).padEnd(8)}${String(r.pts).padEnd(11)}${(r.mins/60).toFixed(1).padEnd(9)}${(r.mins/240).toFixed(2)}`),
        "",SEP,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
      ];
      try{await navigator.clipboard.writeText(lines.join("\n"));}catch{}
    };
    return(
      <div className="fu" style={{paddingBottom:20}}>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["week","Week"],["month","Month"],["year","Year"],["all","All"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{flex:1,padding:"8px 4px",border:`1px solid ${filter===k?C.cyan:C.border}`,borderRadius:9,cursor:"pointer",background:filter===k?C.cyanMid:C.dim,color:filter===k?C.cyan:C.muted,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,transition:"all .15s"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {[{l:"Total PAs",v:totalPAs.toFixed(2),c:C.cyan},{l:"Hours",v:(totalMins/60).toFixed(1),c:C.blue},{l:"Lists",v:fl.length,c:C.purple},{l:"Patients",v:fl.reduce((a,l)=>a+patients.filter(p=>p.listId===l.id).length,0),c:C.green}].map(s=>(
            <div key={s.l} className="card" style={{borderColor:s.c+"25"}}>
              <div className="mono" style={{fontSize:26,fontWeight:700,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
        <button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginBottom:14}} onClick={copyPA}>
          <Ic n="clip" s={14}/>Copy PA Summary for Appraisal
        </button>
        {monthRows.length>0&&(
          <div className="card">
            <SHdr title="Monthly Breakdown" color={C.muted}/>
            {monthRows.map(r=>(
              <div key={r.month} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.dim}`}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{new Date(r.month+"-15").toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</div>
                  <div style={{fontSize:11,color:C.muted}}>{r.lists} lists · {r.pts} patients</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div className="mono" style={{fontSize:16,fontWeight:700,color:C.cyan}}>{(r.mins/240).toFixed(2)}</div>
                  <div style={{fontSize:10,color:C.muted}}>PAs · {(r.mins/60).toFixed(1)}h</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {monthRows.length===0&&<div className="card" style={{textAlign:"center",padding:24,color:C.muted}}>No timed lists yet. Add start/end times to your lists to track PAs.</div>}
        <div style={{marginTop:12,padding:"10px 14px",background:C.cyanDim,border:`1px solid ${C.cyan}25`,borderRadius:12,fontSize:11,color:C.muted}}>
          <strong style={{color:C.cyan}}>PA Reference</strong> — 1 PA = 4 hours. Standard 9–5 day = 2.5 PAs. Full-time consultant = 10 PAs/week.
        </div>
      </div>
    );
  };

  const CasesTab=()=>{
    const [showForm,setShowForm]=useState(false);
    const [showImport,setShowImport]=useState(false);
    const [filterSpec,setFilterSpec]=useState("All");
    const [form,setForm]=useState({date:todayISO(),procedure:"",specialty:"Colorectal",technique:"GA",asa:"2",complexity:"Intermediate",supervision:"Independent",regional:"",notes:"",complication:false,complicationDetail:""});
    const addCase=()=>{
      if(!form.procedure)return;
      setCases(prev=>[{...form,id:uid()},...prev].sort((a,b)=>b.date.localeCompare(a.date)));
      setForm({date:todayISO(),procedure:"",specialty:"Colorectal",technique:"GA",asa:"2",complexity:"Intermediate",supervision:"Independent",regional:"",notes:"",complication:false,complicationDetail:""});
      setShowForm(false);
    };
    const importCases=()=>{
      const existing=new Set(cases.map(c=>c.sourceId).filter(Boolean));
      const newCases=patients.filter(p=>p.surgery&&!existing.has(p.id)).map(p=>{
        const list=lists.find(l=>l.id===p.listId);
        return{id:uid(),sourceId:p.id,date:list?.date||todayISO(),procedure:p.surgery||"",specialty:"Other",technique:p.technique||"GA",asa:p.asa||"2",complexity:"Intermediate",supervision:"Independent",regional:"",notes:"",complication:false,complicationDetail:""};
      });
      if(newCases.length>0) setCases(prev=>[...newCases,...prev].sort((a,b)=>b.date.localeCompare(a.date)));
      setShowImport(false);
    };
    const filtered=cases.filter(c=>(filterSpec==="All"||c.specialty===filterSpec));
    const byTech=TECHNIQUES.reduce((a,t)=>({...a,[t]:cases.filter(c=>c.technique===t).length}),{});
    const copyLog=async()=>{
      const bySpec=SPECIALTIES.reduce((a,s)=>({...a,[s]:cases.filter(c=>c.specialty===s).length}),{});
      const lines=[SEP,"ANAESTHETIC CASE LOG",SEP,
        `Generated: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`,
        `Total cases: ${cases.length}`,
        "",SEP,"TECHNIQUE BREAKDOWN",SEP,
        ...TECHNIQUES.filter(t=>byTech[t]>0).map(t=>`${t.padEnd(20)} ${byTech[t]}`),
        "",SEP,"SPECIALTY BREAKDOWN",SEP,
        ...SPECIALTIES.filter(s=>bySpec[s]>0).map(s=>`${s.padEnd(20)} ${bySpec[s]}`),
        "",SEP,"CASE LOG",SEP,
        ...cases.map((c,i)=>`${i+1}. ${fmtDate(c.date)} | ${c.procedure} | ${c.specialty} | ${c.technique} | ASA ${c.asa} | ${c.supervision}${c.complication?` | ⚠ ${c.complicationDetail||"Complication"}`:""}`),
        "",SEP,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
      ];
      try{await navigator.clipboard.writeText(lines.join("\n"));}catch{}
    };
    return(
      <div className="fu" style={{paddingBottom:20}}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button className="btn bc bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>setShowForm(!showForm)}><Ic n="plus" s={14}/>Add Case</button>
          <button className="btn bgh bsm" style={{flex:1,justifyContent:"center"}} onClick={()=>setShowImport(true)}><Ic n="list" s={14}/>Import from Lists</button>
        </div>
        {showImport&&(
          <div className="card fu" style={{marginBottom:12,borderColor:C.cyan+"40"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.cyan,marginBottom:8}}>Import from Theatre Lists</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Imports all patients with procedures from your lists that haven't been imported yet ({patients.filter(p=>p.surgery&&!cases.find(c=>c.sourceId===p.id)).length} new cases found).</div>
            <div style={{display:"flex",gap:8}}><button className="btn bc bsm" onClick={importCases}>Import</button><button className="btn bgh bsm" onClick={()=>setShowImport(false)}>Cancel</button></div>
          </div>
        )}
        {showForm&&(
          <div className="card fu" style={{marginBottom:12,borderColor:C.cyan+"40"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.cyan,marginBottom:12}}>New Case Entry</div>
            <G2><Fld label="Date" mb={0}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Fld>
            <Fld label="ASA" mb={0}><select value={form.asa} onChange={e=>setForm({...form,asa:e.target.value})}>{["1","2","3","4","5"].map(a=><option key={a} value={a}>ASA {a}</option>)}</select></Fld></G2>
            <Fld label="Procedure *"><input placeholder="e.g. Laparoscopic right hemicolectomy" value={form.procedure} onChange={e=>setForm({...form,procedure:e.target.value})}/></Fld>
            <G2><Fld label="Specialty" mb={0}><select value={form.specialty} onChange={e=>setForm({...form,specialty:e.target.value})}>{SPECIALTIES.map(s=><option key={s}>{s}</option>)}</select></Fld>
            <Fld label="Technique" mb={0}><select value={form.technique} onChange={e=>setForm({...form,technique:e.target.value})}>{TECHNIQUES.map(t=><option key={t}>{t}</option>)}</select></Fld></G2>
            <G2><Fld label="Complexity" mb={0}><select value={form.complexity} onChange={e=>setForm({...form,complexity:e.target.value})}>{COMPLEXITY.map(c=><option key={c}>{c}</option>)}</select></Fld>
            <Fld label="Supervision" mb={0}><select value={form.supervision} onChange={e=>setForm({...form,supervision:e.target.value})}>{SUPERVISION.map(s=><option key={s}>{s}</option>)}</select></Fld></G2>
            <Fld label="Regional technique (if any)"><input placeholder="e.g. Rectus sheath block, TAP block" value={form.regional} onChange={e=>setForm({...form,regional:e.target.value})}/></Fld>
            <Fld label="Notes / Reflections"><textarea placeholder="Interesting points, learning, things to remember..." value={form.notes} rows={2} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:"none"}}/></Fld>
            <Toggle label="Complication / incident occurred" checked={form.complication} onChange={v=>setForm({...form,complication:v})} color={C.red}/>
            {form.complication&&<Fld label="Brief details" mb={8}><input style={{marginTop:6}} placeholder="Type and management..." value={form.complicationDetail} onChange={e=>setForm({...form,complicationDetail:e.target.value})}/></Fld>}
            <div style={{display:"flex",gap:8,marginTop:8}}><button className="btn bc bsm" onClick={addCase}>Save</button><button className="btn bgh bsm" onClick={()=>setShowForm(false)}>Cancel</button></div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[{l:"Total Cases",v:cases.length,c:C.cyan},{l:"Independent",v:cases.filter(c=>c.supervision==="Independent").length,c:C.green},{l:"With Regional",v:cases.filter(c=>c.regional).length,c:C.purple}].map(s=>(
            <div key={s.l} className="card" style={{borderColor:s.c+"25",padding:"10px 12px"}}>
              <div className="mono" style={{fontSize:22,fontWeight:700,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
        {cases.length>0&&(
          <div className="card" style={{marginBottom:12}}>
            <SHdr title="By Technique" color={C.muted}/>
            {TECHNIQUES.filter(t=>byTech[t]>0).map(t=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <div style={{fontSize:12,color:C.text,minWidth:110}}>{t}</div>
                <div style={{flex:1,height:6,background:C.dim,borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(byTech[t]/cases.length)*100}%`,background:C.cyan,borderRadius:4}}/>
                </div>
                <div className="mono" style={{fontSize:12,color:C.cyan,minWidth:24,textAlign:"right"}}>{byTech[t]}</div>
              </div>
            ))}
          </div>
        )}
        {cases.length>0&&(
          <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
            {["All",...new Set(cases.map(c=>c.specialty))].map(s=>(
              <button key={s} onClick={()=>setFilterSpec(s)} style={{flexShrink:0,padding:"5px 10px",border:`1px solid ${filterSpec===s?C.cyan:C.border}`,borderRadius:8,cursor:"pointer",background:filterSpec===s?C.cyanMid:C.dim,color:filterSpec===s?C.cyan:C.muted,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{s}</button>
            ))}
          </div>
        )}
        {filtered.map(c=>(
          <div key={c.id} className="card fu" style={{marginBottom:8,borderLeft:`3px solid ${c.complication?C.red:C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{c.procedure}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(c.date)} · {c.specialty}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                  <span className="chip cc" style={{fontSize:10}}>{c.technique}</span>
                  <span className="chip cb" style={{fontSize:10}}>ASA {c.asa}</span>
                  <span className="chip" style={{fontSize:10,background:C.green+"18",color:C.green,border:`1px solid ${C.green}25`}}>{c.complexity}</span>
                  {c.regional&&<span className="chip cp" style={{fontSize:10}}>Regional</span>}
                  {c.complication&&<span className="chip cr" style={{fontSize:10}}>⚠ Complication</span>}
                </div>
                {c.notes&&<div style={{fontSize:11,color:C.muted,marginTop:5,fontStyle:"italic"}}>{c.notes.slice(0,80)}{c.notes.length>80?"…":""}</div>}
              </div>
              <button className="btn bred bxs" onClick={()=>setCases(prev=>prev.filter(x=>x.id!==c.id))}><Ic n="trash" s={11}/></button>
            </div>
          </div>
        ))}
        {cases.length>0&&<button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={copyLog}><Ic n="clip" s={14}/>Copy Case Log for Revalidation</button>}
        {cases.length===0&&<div className="card" style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>📚</div><div style={{fontWeight:600}}>No cases yet</div><div style={{fontSize:12,marginTop:4}}>Add cases manually or import from your theatre lists</div></div>}
      </div>
    );
  };

  const CPDTab=()=>{
    const [showForm,setShowForm]=useState(false);
    const [form,setForm]=useState({date:todayISO(),type:"Course",title:"",provider:"",hours:"",notes:""});
    const add=()=>{
      if(!form.title)return;
      setCpd(prev=>[{...form,id:uid(),hours:parseFloat(form.hours)||0},...prev].sort((a,b)=>b.date.localeCompare(a.date)));
      setForm({date:todayISO(),type:"Course",title:"",provider:"",hours:"",notes:""});
      setShowForm(false);
    };
    const totalHrs=cpd.reduce((a,c)=>a+(c.hours||0),0);
    const byType=CPD_TYPES.reduce((a,t)=>({...a,[t]:cpd.filter(c=>c.type===t).reduce((s,c)=>s+(c.hours||0),0)}),{});
    const copyCPD=async()=>{
      const lines=[SEP,"CPD RECORD",SEP,
        `Generated: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`,
        `Total CPD hours: ${totalHrs.toFixed(1)}  |  Total entries: ${cpd.length}`,
        "",SEP,"BY TYPE",SEP,
        ...CPD_TYPES.filter(t=>byType[t]>0).map(t=>`${t.padEnd(25)} ${byType[t].toFixed(1)}h`),
        "",SEP,"FULL LOG",SEP,
        ...cpd.map((c,i)=>`${i+1}. ${fmtDate(c.date)} | ${c.type} | ${c.title}${c.provider?` (${c.provider})`:""}${c.hours?` | ${c.hours}h`:""}`),
        "",SEP,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
      ];
      try{await navigator.clipboard.writeText(lines.join("\n"));}catch{}
    };
    return(
      <div className="fu" style={{paddingBottom:20}}>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div className="card" style={{flex:1,padding:"12px 14px",borderColor:C.cyan+"30"}}>
            <div className="mono" style={{fontSize:28,fontWeight:700,color:C.cyan}}>{totalHrs.toFixed(1)}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Total CPD Hours</div>
          </div>
          <div className="card" style={{flex:1,padding:"12px 14px",borderColor:C.blue+"30"}}>
            <div className="mono" style={{fontSize:28,fontWeight:700,color:C.blue}}>{cpd.length}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Total Entries</div>
          </div>
        </div>
        <button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginBottom:12}} onClick={()=>setShowForm(!showForm)}><Ic n="plus" s={14}/>Add CPD Entry</button>
        {showForm&&(
          <div className="card fu" style={{marginBottom:12,borderColor:C.cyan+"40"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.cyan,marginBottom:12}}>New CPD Entry</div>
            <G2><Fld label="Date" mb={0}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Fld>
            <Fld label="Hours" mb={0}><input type="number" step="0.5" placeholder="e.g. 7" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/></Fld></G2>
            <Fld label="Type"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{CPD_TYPES.map(t=><option key={t}>{t}</option>)}</select></Fld>
            <Fld label="Title / Name *"><input placeholder="e.g. Regional Anaesthesia Masterclass" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Fld>
            <Fld label="Provider / Organiser"><input placeholder="e.g. AAGBI, local trust" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})}/></Fld>
            <Fld label="Notes / Reflection" mb={8}><textarea placeholder="Key learning points..." value={form.notes} rows={2} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:"none"}}/></Fld>
            <div style={{display:"flex",gap:8}}><button className="btn bc bsm" onClick={add}>Save</button><button className="btn bgh bsm" onClick={()=>setShowForm(false)}>Cancel</button></div>
          </div>
        )}
        {cpd.length>0&&(
          <div className="card" style={{marginBottom:12}}>
            <SHdr title="By Type" color={C.muted}/>
            {CPD_TYPES.filter(t=>byType[t]>0).map(t=>(
              <div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.dim}`}}>
                <div style={{fontSize:12,color:C.text}}>{t}</div>
                <div className="mono" style={{fontSize:12,color:C.cyan}}>{byType[t].toFixed(1)}h</div>
              </div>
            ))}
          </div>
        )}
        {cpd.map(c=>(
          <div key={c.id} className="card fu" style={{marginBottom:8,borderLeft:`3px solid ${C.blue}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{c.title}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(c.date)} · {c.type}{c.provider?` · ${c.provider}`:""}</div>
                {c.hours>0&&<span className="chip cc" style={{fontSize:10,marginTop:5}}>{c.hours}h</span>}
                {c.notes&&<div style={{fontSize:11,color:C.muted,marginTop:5,fontStyle:"italic"}}>{c.notes.slice(0,80)}{c.notes.length>80?"…":""}</div>}
              </div>
              <button className="btn bred bxs" onClick={()=>setCpd(prev=>prev.filter(x=>x.id!==c.id))}><Ic n="trash" s={11}/></button>
            </div>
          </div>
        ))}
        {cpd.length>0&&<button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={copyCPD}><Ic n="clip" s={14}/>Copy CPD Log</button>}
        {cpd.length===0&&<div className="card" style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>🎓</div><div style={{fontWeight:600}}>No CPD entries yet</div></div>}
      </div>
    );
  };

  const IncidentsTab=()=>{
    const [showForm,setShowForm]=useState(false);
    const [selected,setSelected]=useState(null);
    const [form,setForm]=useState({date:todayISO(),type:"Difficult airway",asa:"2",context:"",description:"",management:"",outcome:"",learning:"",reported:false});
    const add=()=>{
      if(!form.description)return;
      setIncidents(prev=>[{...form,id:uid()},...prev].sort((a,b)=>b.date.localeCompare(a.date)));
      setForm({date:todayISO(),type:"Difficult airway",asa:"2",context:"",description:"",management:"",outcome:"",learning:"",reported:false});
      setShowForm(false);
    };
    const copyIncidents=async()=>{
      const lines=[SEP,"CRITICAL INCIDENTS & COMPLICATIONS LOG",SEP,
        `Generated: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`,
        `Total entries: ${incidents.length}`,
        "",
        ...incidents.map((inc,i)=>[
          `${SEP}`,`ENTRY ${i+1} — ${fmtDate(inc.date)} | ${inc.type} | ASA ${inc.asa}`,SEP,
          `Context    : ${or(inc.context)}`,
          `Description: ${or(inc.description)}`,
          `Management : ${or(inc.management)}`,
          `Outcome    : ${or(inc.outcome)}`,
          `Learning   : ${or(inc.learning)}`,
          `Reported   : ${inc.reported?"Yes":"No"}`,
          ""
        ]).flat(),
        SEP,`AnaesApp — ${new Date().toLocaleString("en-GB")}`,SEP
      ];
      try{await navigator.clipboard.writeText(lines.join("\n"));}catch{}
    };
    if(selected){
      const inc=incidents.find(i=>i.id===selected);
      if(!inc){setSelected(null);return null;}
      return(
        <div className="fu" style={{paddingBottom:20}}>
          <button className="btn bgh bsm" style={{marginBottom:12}} onClick={()=>setSelected(null)}><Ic n="back" s={14}/>Back</button>
          <div className="card" style={{marginBottom:10,borderLeft:`3px solid ${C.red}`}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>{inc.type}</div>
            <div style={{fontSize:12,color:C.muted}}>{fmtDate(inc.date)} · ASA {inc.asa}</div>
            {inc.reported&&<span className="chip cr" style={{fontSize:10,marginTop:6,display:"inline-flex"}}>Reported</span>}
          </div>
          {[{l:"Clinical Context",v:inc.context},{l:"Description",v:inc.description},{l:"Management",v:inc.management},{l:"Outcome",v:inc.outcome},{l:"Learning Points",v:inc.learning}].filter(s=>s.v).map(s=>(
            <div key={s.l} className="card" style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>{s.l}</div>
              <div style={{fontSize:13,lineHeight:1.5}}>{s.v}</div>
            </div>
          ))}
          <button className="btn bred bsm" style={{marginTop:4}} onClick={()=>{setIncidents(prev=>prev.filter(i=>i.id!==selected));setSelected(null);}}><Ic n="trash" s={14}/>Delete Entry</button>
        </div>
      );
    }
    return(
      <div className="fu" style={{paddingBottom:20}}>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div className="card" style={{flex:1,padding:"12px 14px",borderColor:C.red+"30"}}>
            <div className="mono" style={{fontSize:28,fontWeight:700,color:C.red}}>{incidents.length}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Total Entries</div>
          </div>
          <div className="card" style={{flex:1,padding:"12px 14px",borderColor:C.amber+"30"}}>
            <div className="mono" style={{fontSize:28,fontWeight:700,color:C.amber}}>{incidents.filter(i=>i.reported).length}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Reported</div>
          </div>
        </div>
        <button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginBottom:12}} onClick={()=>setShowForm(!showForm)}><Ic n="plus" s={14}/>Log Incident / Complication</button>
        {showForm&&(
          <div className="card fu" style={{marginBottom:12,borderColor:C.red+"40"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:12}}>New Incident / Complication</div>
            <G2><Fld label="Date" mb={0}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Fld>
            <Fld label="ASA of patient" mb={0}><select value={form.asa} onChange={e=>setForm({...form,asa:e.target.value})}>{["1","2","3","4","5"].map(a=><option key={a} value={a}>ASA {a}</option>)}</select></Fld></G2>
            <Fld label="Type *"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{INCIDENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></Fld>
            <Fld label="Clinical Context"><input placeholder="Procedure, patient factors, setting..." value={form.context} onChange={e=>setForm({...form,context:e.target.value})}/></Fld>
            <Fld label="Description *"><textarea placeholder="What happened..." value={form.description} rows={3} onChange={e=>setForm({...form,description:e.target.value})} style={{resize:"none"}}/></Fld>
            <Fld label="Management"><textarea placeholder="What was done..." value={form.management} rows={2} onChange={e=>setForm({...form,management:e.target.value})} style={{resize:"none"}}/></Fld>
            <Fld label="Outcome"><input placeholder="Immediate and subsequent outcome..." value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}/></Fld>
            <Fld label="Learning Points"><textarea placeholder="What would you do differently, what did you learn..." value={form.learning} rows={2} onChange={e=>setForm({...form,learning:e.target.value})} style={{resize:"none"}}/></Fld>
            <Toggle label="Formally reported (Datix / IR1)" checked={form.reported} onChange={v=>setForm({...form,reported:v})} color={C.amber}/>
            <div style={{display:"flex",gap:8,marginTop:8}}><button className="btn bc bsm" onClick={add}>Save</button><button className="btn bgh bsm" onClick={()=>setShowForm(false)}>Cancel</button></div>
          </div>
        )}
        {incidents.map(inc=>(
          <div key={inc.id} className="card fu" style={{marginBottom:8,cursor:"pointer",borderLeft:`3px solid ${C.red}`}} onClick={()=>setSelected(inc.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{inc.type}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(inc.date)} · ASA {inc.asa}</div>
                {inc.description&&<div style={{fontSize:11,color:C.muted,marginTop:5}}>{inc.description.slice(0,80)}{inc.description.length>80?"…":""}</div>}
                <div style={{display:"flex",gap:5,marginTop:5}}>
                  {inc.reported&&<span className="chip ca" style={{fontSize:10}}>Reported</span>}
                  {inc.learning&&<span className="chip cg" style={{fontSize:10}}>✓ Reflection</span>}
                </div>
              </div>
              <Ic n="chev" s={16} c={C.muted}/>
            </div>
          </div>
        ))}
        {incidents.length>0&&<button className="btn bc bsm" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={copyIncidents}><Ic n="clip" s={14}/>Copy Incident Log</button>}
        {incidents.length===0&&<div className="card" style={{textAlign:"center",padding:32,color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>⚠️</div><div style={{fontWeight:600}}>No incidents logged</div><div style={{fontSize:12,marginTop:4}}>Log difficult cases and complications for your portfolio</div></div>}
      </div>
    );
  };

  return(
    <div className="fu" style={{padding:"0 16px 0"}}>
      <div style={{position:"sticky",top:0,background:C.bg,zIndex:5,padding:"0 0 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{padding:"12px 0 0"}}>
          <h2 style={{fontSize:20,fontWeight:800,marginBottom:2}}>Portfolio</h2>
          <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Cases · CPD · Incidents · PAs</div>
        </div>
        <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:10,scrollbarWidth:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setPTab(t.id)} style={{
              flexShrink:0,minWidth:72,padding:"8px 8px",border:"none",borderRadius:10,cursor:"pointer",
              background:pTab===t.id?C.cyan:C.dim,color:pTab===t.id?"#060d1a":C.muted,
              fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .15s"
            }}>
              <span style={{fontSize:16,lineHeight:1}}>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{overflowY:"auto",paddingTop:14,paddingBottom:80}}>
        {pTab==="pa"&&<PAsTab/>}
        {pTab==="cases"&&<CasesTab/>}
        {pTab==="cpd"&&<CPDTab/>}
        {pTab==="incidents"&&<IncidentsTab/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AI ASSISTANT SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const AI_MODES = [
  { id:"chat",    label:"Ask anything",     desc:"Clinical questions, guidelines, drug info",  color:"cyan"   },
  { id:"drug_advice", label:"Drug advice",  desc:"Doses, interactions, pharmacology",          color:"purple" },
  { id:"preop_summary", label:"Pre-op review", desc:"AI analysis of a patient's pre-op data", color:"blue"   },
  { id:"handover_review", label:"Handover check", desc:"Review a handover note for gaps",      color:"green"  },
];

const QUICK_PROMPTS = {
  chat: [
    "RSI sequence for a trauma patient with suspected full stomach",
    "Management of intraoperative bronchospasm",
    "TIVA target concentrations for propofol",
    "Sugammadex dosing for deep block reversal",
  ],
  drug_advice: [
    "Propofol induction dose by weight",
    "Rocuronium intubating dose and RSI dose",
    "Ondansetron PONV prophylaxis dose",
    "Metaraminol bolus and infusion doses",
  ],
  preop_summary: [
    "Summarise this patient's key anaesthetic concerns",
    "What are the main risks for this patient?",
    "Is this patient optimised for their procedure?",
  ],
  handover_review: [
    "What critical information is missing from this handover?",
    "Any concerns about this patient's post-op plan?",
  ],
};

function AiScreen({ patients, lists }) {
  const [mode, setMode] = useState("chat");
  const [input, setInput] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useState(null);
  const inputRef = useState(null);
  const modeInfo = AI_MODES.find(m => m.id === mode);
  const modeColor = C[modeInfo?.color || "cyan"];

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const streamAI = async (prompt) => {
    if (!prompt.trim() || streaming) return;
    const userMsg = { role:"user", content: prompt, id: uid() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    try {
      const body = {
        mode,
        prompt,
        ...(selectedPatient ? { patientContext: JSON.stringify(selectedPatient) } : {}),
      };
      const res = await fetch("/api/anaes-ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const obj = JSON.parse(part.slice(6));
            if (obj.content) { full += obj.content; setStreamText(full); }
            if (obj.done) break;
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role:"assistant", content: full, id: uid() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role:"assistant", content: "⚠️ Connection error — make sure the app is deployed or running with the API server.", id: uid() }]);
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  };

  const clearChat = () => { setMessages([]); setStreamText(""); };

  return (
    <div className="fu" style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 16px"}}>
      <div style={{paddingTop:4,paddingBottom:12}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:800,fontFamily:"'Syne',sans-serif",color:modeColor}}>AI Assistant</h2>
            <div style={{fontSize:12,color:C.muted}}>Powered by Claude · UK anaesthesia context</div>
          </div>
          {messages.length>0&&<button className="btn bgh bxs" onClick={clearChat}>Clear</button>}
        </div>

        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none",marginBottom:10}}>
          {AI_MODES.map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)} style={{
              flexShrink:0,padding:"7px 12px",border:`1px solid ${mode===m.id?C[m.color]:C.border}`,
              borderRadius:20,cursor:"pointer",background:mode===m.id?C[m.color]+"18":C.surface,
              color:mode===m.id?C[m.color]:C.muted,fontFamily:"'Inter',system-ui,sans-serif",
              fontWeight:600,fontSize:12,transition:"all .15s",whiteSpace:"nowrap"
            }}>{m.label}</button>
          ))}
        </div>

        {(mode==="preop_summary"||mode==="handover_review")&&(
          <div style={{marginBottom:10}}>
            <span className="lbl">Patient context (optional)</span>
            <select value={selectedPatientId} onChange={e=>setSelectedPatientId(e.target.value)} style={{fontSize:13}}>
              <option value="">— No patient selected —</option>
              {patients.map(p=>{
                const list=lists.find(l=>l.id===p.listId);
                return <option key={p.id} value={p.id}>{p.name}{list?` · ${list.theatre}`:""}</option>;
              })}
            </select>
          </div>
        )}
      </div>

      <div style={{flex:1,overflowY:"auto",paddingBottom:16}}>
        {messages.length===0&&!streaming&&(
          <div>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.muted,marginBottom:8}}>Quick prompts</div>
            {(QUICK_PROMPTS[mode]||[]).map((q,i)=>(
              <button key={i} onClick={()=>streamAI(q)} style={{
                display:"block",width:"100%",textAlign:"left",padding:"10px 14px",marginBottom:6,
                border:`1px solid ${C.border}`,borderRadius:10,background:C.surface,
                color:C.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:13,cursor:"pointer",
                transition:"border-color .15s",lineHeight:1.4
              }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=modeColor}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
              >{q}</button>
            ))}
          </div>
        )}

        {messages.map(msg=>(
          <div key={msg.id} style={{marginBottom:12}}>
            {msg.role==="user"?(
              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <div style={{maxWidth:"82%",background:modeColor+"20",border:`1px solid ${modeColor}30`,borderRadius:"14px 14px 4px 14px",padding:"10px 14px",fontSize:14,color:C.text,lineHeight:1.5}}>
                  {msg.content}
                </div>
              </div>
            ):(
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:modeColor+"25",border:`1px solid ${modeColor}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                  <Ic n="spark" s={13} c={modeColor}/>
                </div>
                <div style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:"4px 14px 14px 14px",padding:"10px 14px",fontSize:14,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}

        {streaming&&(
          <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:12}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:modeColor+"25",border:`1px solid ${modeColor}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
              <Ic n="spark" s={13} c={modeColor}/>
            </div>
            <div style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:"4px 14px 14px 14px",padding:"10px 14px",fontSize:14,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>
              {streamText||<span style={{color:C.muted}}><span className="live">●</span> Thinking...</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{position:"sticky",bottom:0,background:C.bg,paddingBottom:"env(safe-area-inset-bottom,8px)",paddingTop:8,borderTop:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea
            placeholder={modeInfo?.desc||"Ask a clinical question..."}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();streamAI(input);}}}
            rows={2}
            disabled={streaming}
            style={{flex:1,resize:"none",borderRadius:12,fontSize:14,lineHeight:1.5,padding:"10px 13px",minHeight:52,borderColor:input?modeColor+"60":C.border}}
          />
          <button
            className="btn"
            onClick={()=>streamAI(input)}
            disabled={!input.trim()||streaming}
            style={{background:input.trim()&&!streaming?modeColor:C.dim,color:input.trim()&&!streaming?C.bg:C.muted,padding:"14px 16px",borderRadius:12,flexShrink:0,border:"none",transition:"all .15s"}}
          >
            {streaming
              ? <div style={{width:16,height:16,border:`2px solid ${C.muted}`,borderTopColor:"transparent",borderRadius:"50%",animation:"sp .7s linear infinite"}}/>
              : <Ic n="send" s={16}/>
            }
          </button>
        </div>
        <div style={{fontSize:10,color:C.faint,marginTop:5,textAlign:"center"}}>Claude · For clinical support only · Always apply your own judgement</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
export default function AnaesApp(){
  const [isDark,setIsDark]=useState(()=>STORE.get("anaes-theme")!==false);
  const [tab,setTab]=useState("home");
  const [view,setView]=useState("main");
  const [lists,setLists]=useState(null);
  const [patients,setPatients]=useState(null);
  const [cases,setCases]=useState(null);
  const [cpd,setCpd]=useState(null);
  const [incidents,setIncidents]=useState(null);
  const [currentListId,setCurrentListId]=useState(null);
  const [currentPatientId,setCurrentPatientId]=useState(null);
  const [loaded,setLoaded]=useState(false);

  // Mutate global C so all child components pick up the right theme on each render
  Object.assign(C, isDark ? DARK : LIGHT);

  const toggleTheme = () => {
    const next = !isDark;
    STORE.set("anaes-theme", next);
    setIsDark(next);
  };

  useEffect(()=>{
    setLists(STORE.get("av4_lists")||[]);
    setPatients(STORE.get("av4_patients")||[]);
    setCases(STORE.get("av4_cases")||[]);
    setCpd(STORE.get("av4_cpd")||[]);
    setIncidents(STORE.get("av4_incidents")||[]);
    setLoaded(true);
  },[]);

  useEffect(()=>{if(lists)STORE.set("av4_lists",lists);},[lists]);
  useEffect(()=>{if(patients)STORE.set("av4_patients",patients);},[patients]);
  useEffect(()=>{if(cases)STORE.set("av4_cases",cases);},[cases]);
  useEffect(()=>{if(cpd)STORE.set("av4_cpd",cpd);},[cpd]);
  useEffect(()=>{if(incidents)STORE.set("av4_incidents",incidents);},[incidents]);

  if(!loaded) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:28,height:28,border:`3px solid ${C.border}`,borderTopColor:C.cyan,borderRadius:"50%",animation:"sp .8s linear infinite",margin:"0 auto 12px"}}/>
        <div style={{color:C.muted,fontSize:13,fontFamily:"'Inter',system-ui,sans-serif"}}>Loading AnaesApp...</div>
      </div>
    </div>
  );

  const currentList=lists.find(l=>l.id===currentListId);
  const currentPatient=patients.find(p=>p.id===currentPatientId);

  return(
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",display:"flex",flexDirection:"column",background:C.bg}}>
      <style>{makeCSS(C)}</style>

      <div style={{padding:"10px 16px 9px",background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:20,boxShadow:`0 1px 8px rgba(0,0,0,${isDark?".35":".07"})`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {view!=="main"&&<button className="btn bgh bsm" style={{marginRight:4,padding:"7px 10px"}} onClick={()=>view==="patient"?setView("list"):setView("main")}><Ic n="back" s={15}/></button>}
          <div style={{width:7,height:7,borderRadius:"50%",background:C.cyan,flexShrink:0}} className="live"/>
          <span style={{fontSize:15,fontWeight:800,letterSpacing:"2px",textTransform:"uppercase",color:C.cyan,fontFamily:"'Syne',sans-serif"}}>AnaesApp</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:500}}>{new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"})}</div>
          <button onClick={toggleTheme} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:C.muted,display:"flex",alignItems:"center",borderRadius:8,transition:"color .15s"}} title={isDark?"Switch to light mode":"Switch to dark mode"}>
            <Ic n={isDark?"sun":"moon"} s={17} c={C.muted}/>
          </button>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",paddingTop:14}}>
        {view==="main"&&tab==="home"&&<HomeScreen lists={lists} patients={patients} onOpenList={id=>{setCurrentListId(id);setView("list");}}/>}
        {view==="main"&&tab==="lists"&&<ListsScreen lists={lists} setLists={setLists} patients={patients} onOpenList={id=>{setCurrentListId(id);setView("list");}}/>}
        {view==="main"&&tab==="portfolio"&&<PortfolioScreen lists={lists} patients={patients} cases={cases} setCases={setCases} cpd={cpd} setCpd={setCpd} incidents={incidents} setIncidents={setIncidents}/>}
        {view==="main"&&tab==="ai"&&<AiScreen patients={patients} lists={lists}/>}
        {view==="list"&&currentList&&<ListDetail list={currentList} patients={patients} setLists={setLists} setPatients={setPatients} onBack={()=>setView("main")} onOpenPatient={id=>{setCurrentPatientId(id);setView("patient");}}/>}
        {view==="patient"&&currentPatient&&<PatientDetail patient={currentPatient} patients={patients} setPatients={setPatients} lists={lists} onBack={()=>setView("list")}/>}
      </div>

      {view==="main"&&(
        <div style={{display:"flex",background:C.surface,borderTop:`1px solid ${C.border}`,padding:"4px 0 env(safe-area-inset-bottom,4px)",position:"sticky",bottom:0,zIndex:20}}>
          {[{id:"home",icon:"home",label:"Home"},{id:"lists",icon:"list",label:"Lists"},{id:"ai",icon:"spark",label:"AI"},{id:"portfolio",icon:"audit",label:"Portfolio"}].map(n=>(
            <button key={n.id} className={`nb${tab===n.id?" on":""}`} onClick={()=>setTab(n.id)}><Ic n={n.icon} s={20}/>{n.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
