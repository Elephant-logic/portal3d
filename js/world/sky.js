import { Vec3 }   from '../math/vec3.js';
import { Mesh }   from '../renderer/mesh.js';
import { SKY_VERT, SKY_FRAG } from './shaders.js';
import { worldHueBase, TURB, SPIN_AMT, PULL, LOCK_DEPTH } from './vars.js';

/**
 * SkyRenderer — draws the sky gradient + sun + stars
 * Works with the portal world's day/night cycle
 */
export class SkyRenderer {
  constructor(glWrapper){
    this.gl      = glWrapper;
    this._prog   = glWrapper.createProgram(SKY_VERT, SKY_FRAG);
    this._mesh   = Mesh.box(new Vec3(1,1,1)).upload(glWrapper);
    this.daylight= 1.0;
    this.time    = 0; // accumulated time for day cycle
    this.daySpeed= 0.02; // radians per second
  }

  update(dt){
    this.time += dt * this.daySpeed;
    // Day/night cycle — sun elevation
    this.daylight = Math.max(0, Math.sin(this.time)*0.7+0.3);
  }

  getSunDir(){
    const t = this.time;
    return new Vec3(Math.cos(t)*0.5, Math.sin(t), Math.cos(t*0.7)*0.3).normalise();
  }

  getSkyColours(){
    const hb = worldHueBase();
    const d  = this.daylight;

    // Day sky colours driven by hueBase just like portal biome
    const isVolcanic = TURB > 0.5;
    const isCrystal  = LOCK_DEPTH > 0.5;
    const isVortex   = PULL > 0.5;
    const isPulse    = SPIN_AMT > 0.5;

    let top, horizon;
    if(isVolcanic){
      top     = hslToRgb(15,  0.4,  0.05*d+0.05);
      horizon = hslToRgb(20,  0.6,  0.12*d+0.04);
    } else if(isCrystal){
      top     = hslToRgb(200, 0.6,  0.12*d+0.02);
      horizon = hslToRgb(185, 0.5,  0.22*d+0.05);
    } else if(isVortex){
      top     = hslToRgb(270, 0.5,  0.08*d+0.03);
      horizon = hslToRgb(280, 0.4,  0.18*d+0.05);
    } else if(isPulse){
      top     = hslToRgb(hb,  0.6,  0.10*d+0.03);
      horizon = hslToRgb(hb,  0.5,  0.20*d+0.05);
    } else {
      // Normal terran sky — blue/purple with hue shift
      const baseH = 210 + (hb-110)*0.3;
      top     = hslToRgb(baseH+10, 0.6,  0.12*d+0.02);
      horizon = hslToRgb(baseH-10, 0.5,  0.45*d+0.05);
    }
    return { top, horizon };
  }

  getFogColour(){
    const { horizon } = this.getSkyColours();
    // Fog matches horizon colour
    return new Vec3(...horizon);
  }

  getFogDensity(){
    return 0.00008; // subtle fog at distance
  }

  draw(camera){
    const gl = this.gl.gl;
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    this._prog.use();
    this._prog.setMat4('uView', camera.viewMatrix);
    this._prog.setMat4('uProj', camera.projMatrix);

    const { top, horizon } = this.getSkyColours();
    this._prog.setVec3('uSkyTop',     new Vec3(...top));
    this._prog.setVec3('uSkyHorizon', new Vec3(...horizon));
    this._prog.setFloat('uDaylight',  this.daylight);
    this._prog.setVec3('uSunDir',     this.getSunDir());
    this._prog.setFloat('uHueShift',  worldHueBase());

    this._mesh.draw(this.gl);

    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
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
