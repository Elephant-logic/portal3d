import { fbmTerrain, fbmBiomeRGB, worldHueBase, TURB } from './vars.js';

export const RINGS = [
  { step:1,  r0:0,  r1:14  },
  { step:2,  r0:13, r1:32  },
  { step:4,  r0:30, r1:75  },
  { step:8,  r0:72, r1:160 },
];

const STRIDE = 10;
const SEA    = 2.2;

export class TerrainChunk {
  constructor(glWrapper){
    this.gl=glWrapper; this.vao=null; this.vbo=null; this.ibo=null;
    this.count=0; this._built=false; this._lastX=null; this._lastZ=null;
  }

  update(px,pz,t){
    if(this._lastX!==null&&Math.abs(px-this._lastX)<2&&Math.abs(pz-this._lastZ)<2) return;
    this._lastX=px; this._lastZ=pz;
    this._build(px,pz,t);
  }

  _build(px,pz,t){
    const hb=worldHueBase(), isChaos=TURB>0.5;
    const verts=[], inds=[];
    let vi=0;

    for(const{step:st,r0,r1} of RINGS){
      const ox=Math.floor(px/st)*st;
      const oz=Math.floor(pz/st)*st;
      for(let i=-r1;i<r1;i+=st)
      for(let j=-r1;j<r1;j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wz=oz+j;

        const h00=fbmTerrain(wx,      wz,      t);  // top-left
        const h10=fbmTerrain(wx+st,   wz,      t);  // top-right
        const h01=fbmTerrain(wx,      wz+st,   t);  // bottom-left
        const h11=fbmTerrain(wx+st,   wz+st,   t);  // bottom-right

        const avg  =(h00+h10+h01+h11)*0.25;
        const slope=(Math.abs(h00-h11)+Math.abs(h10-h01))/(st*2);
        const [cr,cg,cb]=fbmBiomeRGB(avg,slope,hb);

        // Normal: edge along +X = (st, h10-h00, 0)
        //         edge along +Z = (0,  h01-h00, st)
        // cross(edgeX, edgeZ) for CCW winding viewed from above = upward normal
        const e1x=st,  e1y=h10-h00, e1z=0;
        const e2x=0,   e2y=h01-h00, e2z=st;
        const nx=e1y*e2z - e1z*e2y;
        const ny=e1z*e2x - e1x*e2z;
        const nz=e1x*e2y - e1y*e2x;
        const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;

        // CCW winding viewed from above (y+): 00, 10, 11, 01
        verts.push(wx,    h00, wz,    nx/nl,ny/nl,nz/nl, cr,cg,cb,1);  // 0
        verts.push(wx+st, h10, wz,    nx/nl,ny/nl,nz/nl, cr,cg,cb,1);  // 1
        verts.push(wx+st, h11, wz+st, nx/nl,ny/nl,nz/nl, cr,cg,cb,1);  // 2
        verts.push(wx,    h01, wz+st, nx/nl,ny/nl,nz/nl, cr,cg,cb,1);  // 3

        // CCW triangles: 0,1,2 and 0,2,3
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    // Water quads — flat at SEA level, only where all corners are below sea
    for(const{step:st,r0,r1} of RINGS){
      const ox=Math.floor(px/st)*st, oz=Math.floor(pz/st)*st;
      for(let i=-r1;i<r1;i+=st)
      for(let j=-r1;j<r1;j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wz=oz+j;
        const margin=0.4;
        if(fbmTerrain(wx,      wz,      t)>=SEA-margin) continue;
        if(fbmTerrain(wx+st,   wz,      t)>=SEA-margin) continue;
        if(fbmTerrain(wx+st,   wz+st,   t)>=SEA-margin) continue;
        if(fbmTerrain(wx,      wz+st,   t)>=SEA-margin) continue;
        const tz=fbmTerrain(wx,wz,t);
        const depth=Math.min(1,(SEA-tz)/5);
        const alpha=Math.min(0.75,0.3+depth*0.5);
        const wr=isChaos?0.85:0.05, wg=isChaos?0.15:0.3, wb=isChaos?0.0:0.72;
        // CCW from above: 00,10,11,01
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
    if(this.vao) gl.deleteVertexArray(this.vao);
    if(this.vbo) gl.deleteBuffer(this.vbo);
    if(this.ibo) gl.deleteBuffer(this.ibo);
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
    // Uint32Array indices → UNSIGNED_INT
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_INT,0);
    gl.bindVertexArray(null);
  }
}
