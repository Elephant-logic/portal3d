import { fbmTerrain, fbmBiomeRGB, worldHueBase, TURB } from './vars.js';

// Ring LOD — r0/r1 are min/max distance from player in world units
// IMPORTANT: innermost r0 must be > near-plane distance to avoid clip artifacts
export const RINGS = [
  { step:1,  r0:2,   r1:14  },
  { step:2,  r0:13,  r1:32  },
  { step:4,  r0:30,  r1:75  },
  { step:8,  r0:72,  r1:160 },
];

const STRIDE = 10; // pos(3) + normal(3) + colour(4)
const SEA    = 2.2;

export class TerrainChunk {
  constructor(glWrapper){
    this.gl=glWrapper; this.vao=null; this.vbo=null; this.ibo=null;
    this.count=0; this._built=false; this._lastX=null; this._lastZ=null;
  }

  update(px,pz,t){
    // Rebuild only when player moves more than 1 unit
    if(this._lastX!==null && Math.abs(px-this._lastX)<1 && Math.abs(pz-this._lastZ)<1) return;
    this._lastX=px; this._lastZ=pz;
    this._build(px,pz,t);
  }

  _build(px,pz,t){
    const hb=worldHueBase();
    const isChaos=TURB>0.5;
    const verts=[], inds=[];
    let vi=0;

    // ── LAND ──────────────────────────────────────────────────────────────────
    for(const {step:st,r0,r1} of RINGS){
      const ox=Math.round(px/st)*st;
      const oz=Math.round(pz/st)*st;
      for(let i=-r1; i<r1; i+=st)
      for(let j=-r1; j<r1; j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wz=oz+j;

        const h00=fbmTerrain(wx,    wz,    t);
        const h10=fbmTerrain(wx+st, wz,    t);
        const h01=fbmTerrain(wx,    wz+st, t);
        const h11=fbmTerrain(wx+st, wz+st, t);

        const avg  =(h00+h10+h01+h11)*0.25;
        const slope=(Math.abs(h00-h11)+Math.abs(h10-h01))/(st*2);
        const [cr,cg,cb]=fbmBiomeRGB(avg,slope,hb);

        // Normal via cross product (edge along +X, edge along +Z)
        const e1x=st, e1y=h10-h00, e1z=0;
        const e2x=0,  e2y=h01-h00, e2z=st;
        let nx=e1y*e2z-e1z*e2y;
        let ny=e1z*e2x-e1x*e2z;
        let nz=e1x*e2y-e1y*e2x;
        const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
        nx/=nl; ny/=nl; nz/=nl;
        // Ensure normal points upward
        if(ny<0){nx=-nx;ny=-ny;nz=-nz;}

        // CCW winding from above: 00,10,11,01
        verts.push(wx,    h00, wz,    nx,ny,nz, cr,cg,cb,1);
        verts.push(wx+st, h10, wz,    nx,ny,nz, cr,cg,cb,1);
        verts.push(wx+st, h11, wz+st, nx,ny,nz, cr,cg,cb,1);
        verts.push(wx,    h01, wz+st, nx,ny,nz, cr,cg,cb,1);
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    // ── WATER (drawn after land so alpha blending works) ───────────────────
    for(const {step:st,r0,r1} of RINGS){
      const ox=Math.round(px/st)*st, oz=Math.round(pz/st)*st;
      for(let i=-r1; i<r1; i+=st)
      for(let j=-r1; j<r1; j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wz=oz+j;
        // Draw water where average height is below sea level
        const wh00=fbmTerrain(wx,    wz,    t);
        const wh10=fbmTerrain(wx+st, wz,    t);
        const wh01=fbmTerrain(wx,    wz+st, t);
        const wh11=fbmTerrain(wx+st, wz+st, t);
        if((wh00+wh10+wh01+wh11)*0.25 >= SEA) continue;
        const depth=Math.min(1,(SEA-wh00)/5);
        const alpha=Math.min(0.75,0.3+depth*0.5);
        const wr=isChaos?0.85:0.05, wg=isChaos?0.15:0.3, wb=isChaos?0.0:0.72;
        verts.push(wx,    SEA, wz,    0,1,0, wr,wg,wb,alpha);
        verts.push(wx+st, SEA, wz,    0,1,0, wr,wg,wb,alpha);
        verts.push(wx+st, SEA, wz+st, 0,1,0, wr,wg,wb,alpha);
        verts.push(wx,    SEA, wz+st, 0,1,0, wr,wg,wb,alpha);
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    this._upload(new Float32Array(verts), new Uint32Array(inds));
    this.count=inds.length;
  }

  _upload(verts,inds){
    const gl=this.gl.gl;
    if(this.vao){gl.deleteVertexArray(this.vao);}
    if(this.vbo){gl.deleteBuffer(this.vbo);}
    if(this.ibo){gl.deleteBuffer(this.ibo);}
    this.vao=gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);
    const s=STRIDE*4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,s,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,s,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,s,24);
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
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_INT,0);
    gl.bindVertexArray(null);
  }
}
