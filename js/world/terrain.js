import { fbmTerrain, fbmBiomeRGB, worldHueBase, getSeaLevel, TURB } from './vars.js';

export const TERRAIN_STRIDE = 10;

export const RINGS = [
  { step:1,  r0:0,  r1:14  },
  { step:2,  r0:13, r1:32  },
  { step:4,  r0:30, r1:75  },
  { step:8,  r0:72, r1:160 },
];

export class TerrainChunk {
  constructor(glWrapper){
    this.gl     = glWrapper;
    this.vao    = null;
    this.vbo    = null;
    this.ibo    = null;
    this.count  = 0;
    this._built = false;
    this._lastX = null;
    this._lastY = null;
  }

  update(playerX, playerY, t){
    if(this._lastX !== null &&
       Math.abs(playerX-this._lastX) < 2 &&
       Math.abs(playerY-this._lastY) < 2) return;
    this._lastX = playerX;
    this._lastY = playerY;
    this._build(playerX, playerY, t);
  }

  _build(px, py, t){
    const hb  = worldHueBase();
    const SEA = getSeaLevel();
    const isChaos = TURB > 0.5;
    const verts = [];
    const inds  = [];
    let   vi    = 0;

    for(const {step:st, r0, r1} of RINGS){
      const ox = Math.floor(px/st)*st;
      const oy = Math.floor(py/st)*st;
      for(let i=-r1; i<r1; i+=st)
      for(let j=-r1; j<r1; j+=st){
        const d = Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;

        const wx=ox+i, wy=oy+j;
        const z1=fbmTerrain(wx,    wy,    t);
        const z2=fbmTerrain(wx+st, wy,    t);
        const z3=fbmTerrain(wx+st, wy+st, t);
        const z4=fbmTerrain(wx,    wy+st, t);
        const avg   = (z1+z2+z3+z4)*0.25;
        const slope = (Math.abs(z1-z3)+Math.abs(z2-z4))/(st*2);
        const [cr,cg,cb] = fbmBiomeRGB(avg, slope, hb);

        // Face normal
        const e1z=z2-z1, e2z=z4-z1;
        const nx=-e1z, ny=st, nz=-e2z;
        const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;

        const push=(wx_,wz_,h_)=>{
          verts.push(wx_,h_,wz_, nx/nl,ny/nl,nz/nl, cr,cg,cb,1.0);
        };
        push(wx,    wy,    z1);
        push(wx+st, wy,    z2);
        push(wx+st, wy+st, z3);
        push(wx,    wy+st, z4);
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    // Water quads at sea level
    for(const {step:st, r0, r1} of RINGS){
      const ox=Math.floor(px/st)*st, oy=Math.floor(py/st)*st;
      for(let i=-r1;i<r1;i+=st)
      for(let j=-r1;j<r1;j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wy=oy+j;
        const z1=fbmTerrain(wx,wy,t),     z2=fbmTerrain(wx+st,wy,t);
        const z3=fbmTerrain(wx+st,wy+st,t),z4=fbmTerrain(wx,wy+st,t);
        if(z1>=SEA&&z2>=SEA&&z3>=SEA&&z4>=SEA) continue;
        const depth=Math.max(0,SEA-(z1+z2+z3+z4)*0.25);
        const alpha=Math.min(0.92,0.4+depth*0.12);
        const wr=isChaos?0.9:0.05, wg=isChaos?0.2:0.35, wb=isChaos?0.0:0.75;
        const pw=(wx_,wz_)=>verts.push(wx_,SEA,wz_, 0,1,0, wr,wg,wb,alpha);
        pw(wx,    wy); pw(wx+st,wy); pw(wx+st,wy+st); pw(wx,wy+st);
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    this._upload(new Float32Array(verts), new Uint16Array(inds));
    this.count = inds.length;
  }

  _upload(verts, inds){
    const gl=this.gl.gl;
    if(this.vao) gl.deleteVertexArray(this.vao);
    if(this.vbo) gl.deleteBuffer(this.vbo);
    if(this.ibo) gl.deleteBuffer(this.ibo);

    this.vao=gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.vbo=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);

    const stride=TERRAIN_STRIDE*4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2,4,gl.FLOAT,false,stride,24);

    this.ibo=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,inds,gl.DYNAMIC_DRAW);

    gl.bindVertexArray(null);
    this._built=true;
  }

  draw(){
    if(!this._built||!this.count) return;
    const gl=this.gl.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  dispose(){
    const gl=this.gl.gl;
    if(this.vao) gl.deleteVertexArray(this.vao);
    if(this.vbo) gl.deleteBuffer(this.vbo);
    if(this.ibo) gl.deleteBuffer(this.ibo);
  }
}
