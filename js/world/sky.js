import { Vec3 }   from '../math/vec3.js';
import { Mesh }   from '../renderer/mesh.js';
import { SKY_VERT, SKY_FRAG } from './shaders.js';
import { worldHueBase, TURB, SPIN_AMT, PULL, LOCK_DEPTH } from './vars.js';

export class SkyRenderer {
  constructor(glWrapper){
    this.gl      = glWrapper;
    this._prog   = glWrapper.createProgram(SKY_VERT, SKY_FRAG);
    this._mesh   = Mesh.box(new Vec3(1,1,1)).upload(glWrapper);
    this.time    = Math.PI * 0.3; // start midday
    this.daySpeed= 0.018;         // radians/sec — full day ~6 min
  }

  update(dt){
    this.time += dt * this.daySpeed;
  }

  // Sun travels in a tilted circle: rises in +X, peaks at +Y, sets at -X
  getSunDir(){
    const t = this.time;
    // Clean arc — sun Y = sin(t), XZ = cos(t) axis
    const sx = Math.cos(t);
    const sy = Math.sin(t);
    const sz = 0.25; // slight tilt so sun doesn't go straight overhead
    const l  = Math.sqrt(sx*sx+sy*sy+sz*sz);
    return new Vec3(sx/l, sy/l, sz/l);
  }

  // Moon is opposite the sun
  getMoonDir(){
    const s = this.getSunDir();
    return new Vec3(-s.x, -s.y, -s.z);
  }

  // daylight tracks actual sun elevation — ZERO when sun is below horizon
  get daylight(){
    return Math.max(0, this.getSunDir().y);
  }

  // Smooth 0→1 as sun rises, 1 when up, 0→0 as sets
  get daylightSmooth(){
    const d = this.getSunDir().y;
    return Math.max(0, Math.min(1, d * 4 + 0.05)); // quick rise/set
  }

  getSkyColours(){
    const hb = worldHueBase();
    const d  = this.daylightSmooth;
    const isVolcanic = TURB > 0.5;
    const isCrystal  = LOCK_DEPTH > 0.5;
    const isVortex   = PULL > 0.5;
    const isPulse    = SPIN_AMT > 0.5;

    let top, horizon;
    if(isVolcanic){
      top     = hslToRgb(15,  0.4,  0.05*d+0.02);
      horizon = hslToRgb(20,  0.6,  0.12*d+0.03);
    } else if(isCrystal){
      top     = hslToRgb(200, 0.6,  0.12*d+0.01);
      horizon = hslToRgb(185, 0.5,  0.22*d+0.04);
    } else if(isVortex){
      top     = hslToRgb(270, 0.5,  0.08*d+0.02);
      horizon = hslToRgb(280, 0.4,  0.18*d+0.04);
    } else if(isPulse){
      top     = hslToRgb(hb,  0.6,  0.10*d+0.02);
      horizon = hslToRgb(hb,  0.5,  0.20*d+0.04);
    } else {
      const baseH = 210 + (hb-110)*0.3;
      // Sunrise/sunset orange tint at low sun
      const sunY = this.getSunDir().y;
      const sunriseT = Math.max(0, 1 - Math.abs(sunY) * 8); // orange when near horizon
      top     = hslToRgb(baseH+10,    0.6,  0.12*d+0.01);
      horizon = blendColour(
        hslToRgb(baseH-10, 0.5, 0.45*d+0.04),
        hslToRgb(25, 0.9, 0.35*d+0.04),
        sunriseT * (sunY > -0.05 ? 1 : 0) // only tint when sun is near/above horizon
      );
    }
    return { top, horizon };
  }

  getFogColour(){
    const { horizon } = this.getSkyColours();
    return new Vec3(...horizon);
  }

  // Returns sun intensity — 0 at night, smooth ramp at dawn/dusk
  getSunIntensity(){
    return this.daylightSmooth * 1.4;
  }

  // Returns ambient — dim blue at night, warm at day
  getAmbient(){
    const d = this.daylightSmooth;
    const night = new Vec3(0.02, 0.03, 0.08); // moonlit night
    const day   = new Vec3(0.10, 0.11, 0.14);
    return new Vec3(
      night.x + (day.x-night.x)*d,
      night.y + (day.y-night.y)*d,
      night.z + (day.z-night.z)*d
    );
  }

  drawDirect(viewMat, projMat){
    const gl = this.gl.gl;
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);

    this._prog.use();
    this._prog.setMat4('uView',      viewMat);
    this._prog.setMat4('uProj',      projMat);
    const { top, horizon } = this.getSkyColours();
    this._prog.setVec3 ('uSkyTop',     new Vec3(...top));
    this._prog.setVec3 ('uSkyHorizon', new Vec3(...horizon));
    this._prog.setFloat('uDaylight',   this.daylightSmooth);
    this._prog.setVec3 ('uSunDir',     this.getSunDir());
    this._prog.setVec3 ('uMoonDir',    this.getMoonDir());
    this._prog.setFloat('uHueShift',   worldHueBase());

    this._mesh.draw(this.gl);

    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  }
}

function hslToRgb(h, s, l){
  h=((h%360)+360)%360;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
  else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return [r+m,g+m,b+m];
}

function blendColour(a, b, t){
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
