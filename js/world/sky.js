import { Vec3 }  from '../math/vec3.js';
import { SKY_VERT, SKY_FRAG } from './shaders.js';
import { worldHueBase, TURB, SPIN_AMT, PULL, LOCK_DEPTH } from './vars.js';

// Sky box — positions only, no normals/UVs
// This avoids any attribute layout conflict with the terrain shader
const SKY_POSITIONS = new Float32Array([
  // +Z face
  -1,-1, 1,  1,-1, 1,  1, 1, 1,  -1, 1, 1,
  // -Z face
   1,-1,-1, -1,-1,-1, -1, 1,-1,   1, 1,-1,
  // +Y face
  -1, 1,-1,  1, 1,-1,  1, 1, 1,  -1, 1, 1,
  // -Y face
  -1,-1, 1,  1,-1, 1,  1,-1,-1,  -1,-1,-1,
  // +X face
   1,-1,-1,  1,-1, 1,  1, 1, 1,   1, 1,-1,
  // -X face
  -1,-1, 1, -1,-1,-1, -1, 1,-1,  -1, 1, 1,
]);
const SKY_INDICES = new Uint16Array([
  0,1,2, 0,2,3,  4,5,6, 4,6,7,  8,9,10,8,10,11,
  12,13,14,12,14,15,  16,17,18,16,18,19,  20,21,22,20,22,23
]);

export class SkyRenderer {
  constructor(glWrapper){
    this.gl = glWrapper;
    this._prog = glWrapper.createProgram(SKY_VERT, SKY_FRAG);
    this._buildMesh(glWrapper);
    this.time     = Math.PI * 0.3; // start midday
    this.daySpeed = 0.018;
  }

  _buildMesh(glWrapper){
    const gl = glWrapper.gl;
    this._vao = gl.createVertexArray();
    gl.bindVertexArray(this._vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, SKY_POSITIONS, gl.STATIC_DRAW);
    // Only position at location 0 — 3 floats, stride 12
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, SKY_INDICES, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    this._indexCount = SKY_INDICES.length;
  }

  update(dt){ this.time += dt * this.daySpeed; }

  getSunDir(){
    const t = this.time;
    const sx = Math.cos(t), sy = Math.sin(t), sz = 0.25;
    const l  = Math.sqrt(sx*sx+sy*sy+sz*sz);
    return new Vec3(sx/l, sy/l, sz/l);
  }

  getMoonDir(){
    const s = this.getSunDir();
    return new Vec3(-s.x, -s.y, -s.z);
  }

  get daylight(){ return Math.max(0, this.getSunDir().y); }

  get daylightSmooth(){
    return Math.max(0, Math.min(1, this.getSunDir().y * 5 + 0.08));
  }

  getSunIntensity(){ return this.daylightSmooth * 1.4; }

  getAmbient(){
    const d = this.daylightSmooth;
    return new Vec3(
      0.02 + 0.10*d,
      0.03 + 0.10*d,
      0.08 + 0.08*d
    );
  }

  getSkyColours(){
    const d  = this.daylightSmooth;
    const sunY = this.getSunDir().y;
    // Sunrise/sunset orange tint
    const riseT = Math.max(0, 1 - Math.abs(sunY) * 6) * (sunY > -0.05 ? 1 : 0);
    const hb = worldHueBase();
    const top     = hslToRgb(210 + (hb-110)*0.3 + 10, 0.6, 0.12*d + 0.01);
    const horizDay = hslToRgb(210 + (hb-110)*0.3 - 10, 0.5, 0.40*d + 0.04);
    const horizRise= hslToRgb(25, 0.9, 0.30*d + 0.04);
    const horizon  = blend3(horizDay, horizRise, riseT);
    return { top, horizon };
  }

  getFogColour(){
    const { horizon } = this.getSkyColours();
    return new Vec3(...horizon);
  }

  drawDirect(viewMat, projMat){
    const gl = this.gl.gl;
    // Save state
    gl.depthMask(false);
    const depthTestOn = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

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

    gl.bindVertexArray(this._vao);
    gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    // Restore state
    gl.depthMask(true);
    if(depthTestOn) gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
}

function hslToRgb(h, s, l){
  h = ((h%360)+360)%360;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
  else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return [r+m, g+m, b+m];
}

function blend3(a, b, t){
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
