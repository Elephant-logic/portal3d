/**
 * world/vars.js — Portal world state and terrain math
 *
 * fbmTerrain is the EXACT working function from portal_vr_2026-04-27.
 * SEA LEVEL IS ALWAYS 2.2. Do not change this.
 *
 * All slider variables are global so terrain.js, sky.js, etc can read them
 * exactly as the original does.
 */

// ── PORTAL SLIDER VARIABLES ───────────────────────────────────────────────
export let FLOW      = 0.03;
export let SPIN_AMT  = 0.05;
export let DIFF      = 0.12;
export let PULL      = 0.0;
export let LOCK_DEPTH= 0.0;
export let TURB      = 0.0;
export let W_HSCALE  = 1.0;
export let W_ANIM    = 0.0;   // 0 = frozen terrain (best for physics)
export let W_GRAVITY = 1.0;
export let W_LIQUID  = 1.0;
export let W_GHUE    = 110;
export let worldDaylight = 1.0;

// Setters so other modules can change sliders
export function setSliders(s){
  if(s.FLOW      !== undefined) FLOW       = s.FLOW;
  if(s.SPIN_AMT  !== undefined) SPIN_AMT   = s.SPIN_AMT;
  if(s.DIFF      !== undefined) DIFF       = s.DIFF;
  if(s.PULL      !== undefined) PULL       = s.PULL;
  if(s.LOCK_DEPTH!== undefined) LOCK_DEPTH = s.LOCK_DEPTH;
  if(s.TURB      !== undefined) TURB       = s.TURB;
  if(s.W_HSCALE  !== undefined) W_HSCALE   = s.W_HSCALE;
  if(s.W_ANIM    !== undefined) W_ANIM     = s.W_ANIM;
  if(s.W_GRAVITY !== undefined) W_GRAVITY  = s.W_GRAVITY;
  if(s.W_LIQUID  !== undefined) W_LIQUID   = s.W_LIQUID;
  if(s.W_GHUE    !== undefined) W_GHUE     = s.W_GHUE;
}

// ── WORLD PRESETS ─────────────────────────────────────────────────────────
export const PRESETS = {
  TERRAN:   { FLOW:0.03, TURB:0,    PULL:0,    SPIN_AMT:0.05, LOCK_DEPTH:0,    DIFF:0.12, W_HSCALE:1.0 },
  VOLCANIC: { FLOW:0.0,  TURB:0.7,  PULL:0,    SPIN_AMT:0.1,  LOCK_DEPTH:0,    DIFF:0.1,  W_HSCALE:1.5 },
  CRYSTAL:  { FLOW:0.0,  TURB:0,    PULL:0,    SPIN_AMT:0.1,  LOCK_DEPTH:0.7,  DIFF:0.1,  W_HSCALE:1.2 },
  DESERT:   { FLOW:-0.1, TURB:0.1,  PULL:0,    SPIN_AMT:0.05, LOCK_DEPTH:0,    DIFF:0.08, W_HSCALE:0.8 },
  OCEAN:    { FLOW:0.15, TURB:0,    PULL:0,    SPIN_AMT:0.05, LOCK_DEPTH:0,    DIFF:0.15, W_HSCALE:1.0 },
  ARCTIC:   { FLOW:0.0,  TURB:0,    PULL:0,    SPIN_AMT:0.05, LOCK_DEPTH:0.4,  DIFF:0.1,  W_HSCALE:0.9 },
  VORTEX:   { FLOW:0.0,  TURB:0.2,  PULL:0.6,  SPIN_AMT:0.1,  LOCK_DEPTH:0,    DIFF:0.2,  W_HSCALE:1.3 },
  PULSE:    { FLOW:0.0,  TURB:0.1,  PULL:0,    SPIN_AMT:0.7,  LOCK_DEPTH:0,    DIFF:0.15, W_HSCALE:1.1 },
};

// ── SEA LEVEL — INVARIANT ─────────────────────────────────────────────────
// ALWAYS 2.2. Everything depends on this. Never change it.
export function getSeaLevel(){ return 2.2; }

// ── TERRAIN — exact from portal_vr_2026-04-27 ─────────────────────────────
export function fbmTerrain(x, y, t){
  const at = t * W_ANIM;
  const hs = W_HSCALE;
  let h = 0;
  const stab = Math.max(0, 1 - (TURB + Math.min(PULL,1)*0.5 + SPIN_AMT*0.3));
  if(stab > 0){
    h += stab*(
      Math.sin(x*0.04)*Math.cos(y*0.037)*4
     +Math.sin(x*0.031+y*0.028)*3
     +Math.cos(x*0.045-y*0.039)*2.5
     +(Math.sin(x*0.12+y*0.11+at*0.06)+Math.cos(x*0.13-y*0.14))*0.5
    );
  }
  if(TURB > 0.05){
    h += TURB*(
      Math.abs(Math.sin(x*0.2+y*0.15+at*0.8))*3
     +Math.abs(Math.cos(x*0.3-y*0.25+at*0.6))*2
     +Math.sin(x*0.08)*Math.cos(y*0.09)*2
    );
  }
  if(SPIN_AMT > 0.02){
    h += SPIN_AMT*4*(Math.abs(Math.sin(x*0.5)*0.8)+Math.abs(Math.sin(y*0.5)*0.8));
  }
  if(LOCK_DEPTH > 0.1){
    const raw = Math.sin(x*0.06)*Math.cos(y*0.055)*4 + Math.sin((x+y)*0.04)*2;
    h += LOCK_DEPTH * Math.round(raw*1.5)/1.5;
  }
  if(PULL > 0.05){
    const r = Math.sqrt(x*x+y*y)*0.04;
    const a = Math.atan2(y,x)+r*3+at*0.2;
    h += PULL*(Math.sin(a*4)*2.5/(r*0.5+1)+Math.cos(r*5)*1.2);
  }
  return h*hs + 2.2;
}

// ── BIOME COLOUR — exact from portal_vr_2026-04-27 ────────────────────────
// Returns [r, g, b] in 0..1 range (converted from HSL)
export function fbmBiomeRGB(avg, slope, hb){
  const isChaos  = TURB>0.5 && PULL<0.3;
  const isPulse  = SPIN_AMT>0.5 && TURB<0.3;
  const isCryst  = LOCK_DEPTH>0.5;
  const isVortex = PULL>0.5;
  const d = Math.max(0.05, worldDaylight);
  let hue, sat, bri;

  if(isPulse){
    if(slope>0.12){ hue=hb; sat=90; bri=(30+slope*80)*Math.max(0.3,d); }
    else           { hue=hb; sat=40; bri=8*Math.max(0.15,d); }
  } else if(isChaos){
    if(avg<2.2){
      const glowAmt=slope*3+Math.max(0,0.5-(2.2-avg)*0.3);
      hue=Math.max(0,15-glowAmt*10); sat=95;
      bri=Math.max(5,10+glowAmt*50);
    }
    else if(avg<4){ hue=20; sat=70; bri=(18+(avg-2.2)*6)*Math.max(0.3,d); }
    else           { hue=30; sat=30; bri=(25+(avg-2.2)*4)*d; }
  } else if(isCryst){
    const ch=Math.abs(avg-2.2);
    hue=(hb+ch*20)%360; sat=55+ch*10; bri=(22+ch*8)*d;
  } else if(isVortex){
    hue=(hb+avg*15)%360; sat=65+slope*15; bri=(14+Math.abs(avg-2.2)*6)*d;
  } else {
    const h=avg-2.2;
    if(h<-3)       { hue=220; sat=70; bri=14*d; if(slope>0.08){hue=200;sat=60;bri=(22+slope*30)*d;} }
    else if(h<-0.8){ hue=205; sat=60; bri=(20+slope*25)*d; }
    else if(h<0)   { hue=50;  sat=45; bri=32*d; }
    else if(h<1.5) { hue=112; sat=52; bri=(26+h*3)*d; }
    else if(h<3)   { hue=90;  sat=40; bri=30*d; }
    else if(h<5)   { hue=36;  sat=35; bri=33*d; }
    else           { hue=0;   sat=4;  bri=72*d; }
  }
  bri = Math.max(3, Math.min(85, bri-slope*4));
  sat = Math.max(0, Math.min(100, sat));
  return hslToRgb(hue, sat/100, bri/100);
}

export function worldHueBase(){
  if(W_GHUE !== 110) return W_GHUE;
  if(LOCK_DEPTH>0.4) return 185;
  if(TURB>0.5)       return 10;
  if(PULL>0.5)       return 270;
  if(SPIN_AMT>0.4)   return 195;
  if(DIFF>0.3)       return 200;
  return 110;
}

// HSL → RGB (0..1 each)
function hslToRgb(h, s, l){
  h = ((h%360)+360)%360;
  const c = (1-Math.abs(2*l-1))*s;
  const x = c*(1-Math.abs((h/60)%2-1));
  const m = l-c/2;
  let r=0,g=0,b=0;
  if(h<60)      {r=c;g=x;b=0;}
  else if(h<120){r=x;g=c;b=0;}
  else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;}
  else if(h<300){r=x;g=0;b=c;}
  else          {r=c;g=0;b=x;}
  return [r+m, g+m, b+m];
}

// ── WORLD NAME ────────────────────────────────────────────────────────────
export function worldName(){
  let terrain = 'TERRAN';
  if(TURB>0.7)        terrain='IGNEOUS';
  else if(TURB>0.4)   terrain='VOLCANIC';
  else if(PULL>0.7)   terrain='SPIRAL';
  else if(PULL>0.4)   terrain='VORTEX';
  else if(LOCK_DEPTH>0.6) terrain='GLACIAL';
  else if(LOCK_DEPTH>0.3) terrain='CRYSTAL';
  else if(SPIN_AMT>0.6)   terrain='GRID';
  else if(SPIN_AMT>0.3)   terrain='PULSE';
  else if(DIFF>0.3)   terrain='NEBULAR';
  else if(FLOW<-0.05) terrain='ARID';
  else if(FLOW>0.05)  terrain='OCEANIC';
  const seed=Math.abs(
    Math.round(FLOW*100)*7 + Math.round(TURB*100)*13 +
    Math.round(PULL*100)*17+ Math.round(SPIN_AMT*100)*11+
    Math.round(LOCK_DEPTH*100)*19+Math.round(DIFF*100)*23
  );
  const L=['A','B','C','D','E','G','H','I','J','K','L','M','N','O','P','R','S','T'];
  return `${terrain} — ${L[seed%L.length]}${L[Math.floor(seed/L.length)%L.length]}${(seed%89)+1}`;
}
