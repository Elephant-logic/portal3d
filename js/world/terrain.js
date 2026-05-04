import { Vec3 }          from '../math/vec3.js';
import { fbmTerrain, fbmBiomeRGB, worldHueBase, getSeaLevel } from './vars.js';

/**
 * TerrainChunk — a LOD ring of terrain quads around the player
 *
 * Generates a dynamic vertex-coloured mesh by sampling fbmTerrain.
 * Rebuilt when player moves significantly.
 * Uses the same LOD ring sizes as the working 2D portal.
 *
 * Vertex layout: [x,y,z, nx,ny,nz, r,g,b,a]  — 10 floats per vertex
 */

export const TERRAIN_STRIDE = 10; // floats per vertex

// LOD rings — exactly matching working portal
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

  // Build or rebuild if player moved more than threshold
  update(playerX, playerY, t){
    const threshold = 2;
    if(this._lastX !== null &&
       Math.abs(playerX-this._lastX)<threshold &&
       Math.abs(playerY-this._lastY)<threshold) return;

    this._lastX = playerX;
    this._lastY = playerY;
    this._build(playerX, playerY, t);
  }

  _build(px, py, t){
    const gl  = this.gl.gl;
    const hb  = worldHueBase();
    const SEA = getSeaLevel();

    const verts  = [];
    const inds   = [];
    let   vi     = 0;

    for(const {step:st, r0, r1} of RINGS){
      const ox = Math.floor(px/st)*st;
      const oy = Math.floor(py/st)*st;

      for(let i=-r1; i<r1; i+=st)
      for(let j=-r1; j<r1; j+=st){
        const d = Math.sqrt(i*i+j*j);
        if(d<r0 || d>=r1) continue;

        const wx = ox+i, wy = oy+j;

        // Sample 4 corners
        const z1 = fbmTerrain(wx,      wy,      t);
        const z2 = fbmTerrain(wx+st,   wy,      t);
        const z3 = fbmTerrain(wx+st,   wy+st,   t);
        const z4 = fbmTerrain(wx,      wy+st,   t);

        // Average height for colour
        const avg  = (z1+z2+z3+z4)*0.25;
        const slope= (Math.abs(z1-z3)+Math.abs(z2-z4)) / (st*2);

        // Biome colour
        const [cr,cg,cb] = fbmBiomeRGB(avg, slope, hb);

        // Face normal from diagonal cross product
        const dx  = wx+st - wx;   // step
        const e1x = dx,  e1y = 0,  e1z = z2-z1;
        const e2x = 0,   e2y = dx, e2z = z4-z1;
        const nx  = e1y*e2z - e1z*e2y;
        const ny  = e1z*e2x - e1x*e2z;
        const nz  = e1x*e2y - e1y*e2x;
        const nl  = Math.sqrt(nx*nx+ny*ny+nz*nz)||1;

        // Push 4 vertices — note: terrain XY → world XZ, terrain Z → world Y
        // Our engine uses Y-up. Portal uses Z-up.
        // Map: world.x=wx, world.y=terrain_z, world.z=wy
        function pushVert(wx_, wz_, h_){
          verts.push(
            wx_, h_, wz_,          // position  (x=east, y=up, z=south)
            nx/nl, nz/nl, ny/nl,   // normal    (rotated to match)
            cr, cg, cb, 1.0        // colour
          );
        }
        pushVert(wx,    wy,    z1);
        pushVert(wx+st, wy,    z2);
        pushVert(wx+st, wy+st, z3);
        pushVert(wx,    wy+st, z4);

        // Two triangles
        inds.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);
        vi += 4;
      }
    }

    // ── WATER SURFACE ──────────────────────────────────────────────────────
    // Add flat water quads at sea level for cells below sea
    // Same rings but only for underwater cells
    for(const {step:st, r0, r1} of RINGS){
      const ox=Math.floor(px/st)*st, oy=Math.floor(py/st)*st;
      for(let i=-r1;i<r1;i+=st)
      for(let j=-r1;j<r1;j+=st){
        const d=Math.sqrt(i*i+j*j);
        if(d<r0||d>=r1) continue;
        const wx=ox+i, wy=oy+j;
        const z1=fbmTerrain(wx,wy,t), z2=fbmTerrain(wx+st,wy,t);
        const z3=fbmTerrain(wx+st,wy+st,t), z4=fbmTerrain(wx,wy+st,t);
        // Only draw water if at least one corner is below sea level
        if(z1>=SEA&&z2>=SEA&&z3>=SEA&&z4>=SEA) continue;

        // Water colour — translucent blue
        const depth = Math.max(0, SEA-(z1+z2+z3+z4)*0.25);
        const alpha = Math.min(0.92, 0.4+depth*0.12);
        const isChaosWorld = this._isChaos;
        const wr=isChaosWorld?0.9:0.05, wg=isChaosWorld?0.2:0.35, wb=isChaosWorld?0.0:0.75;

        function pushWater(wx_, wz_){
          verts.push(wx_, SEA, wz_,  0,1,0,  wr,wg,wb,alpha);
        }
        pushWater(wx,    wy);
        pushWater(wx+st, wy);
        pushWater(wx+st, wy+st);
        pushWater(wx,    wy+st);
        inds.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
        vi+=4;
      }
    }

    // Upload to GPU
    this._upload(new Float32Array(verts), new Uint32Array(inds));
    this.count = inds.length;
  }

  _upload(verts, inds){
    const gl = this.gl.gl;

    // Delete old buffers
    if(this.vao) gl.deleteVertexArray(this.vao);
    if(this.vbo) gl.deleteBuffer(this.vbo);
    if(this.ibo) gl.deleteBuffer(this.ibo);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // VBO
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

    const stride = TERRAIN_STRIDE * 4;
    // position — loc 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    // normal — loc 1
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    // colour — loc 2 (using UV slot)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);

    // IBO — use 32-bit indices for large meshes
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, inds, gl.DYNAMIC_DRAW);

    gl.bindVertexArray(null);
    this._built = true;
  }

  draw(){
    if(!this._built || !this.count) return;
    const gl = this.gl.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  get _isChaos(){ return TURB > 0.5; }

  dispose(){
    const gl=this.gl.gl;
    if(this.vao) gl.deleteVertexArray(this.vao);
    if(this.vbo) gl.deleteBuffer(this.vbo);
    if(this.ibo) gl.deleteBuffer(this.ibo);
  }
}

// ── HEIGHTFIELD COLLISION SHAPE ──────────────────────────────────────────
// Queries fbmTerrain directly — no mesh needed for collision
import { Shape, ShapeType } from '../physics/shapes.js';
import { AABB }             from '../math/primitives.js';

export class HeightfieldShape extends Shape {
  constructor(){
    super('heightfield');
    this.type = 'heightfield';
  }

  // Get terrain height at world XZ position
  heightAt(x, z, t=0){
    return fbmTerrain(x, z, t);
  }

  // Normal at a point (finite difference)
  normalAt(x, z, eps=0.5, t=0){
    const h  = this.heightAt(x,   z,   t);
    const hx = this.heightAt(x+eps, z, t);
    const hz = this.heightAt(x, z+eps, t);
    const n  = new Vec3(-(hx-h)/eps, 1, -(hz-h)/eps);
    return n.normalise();
  }

  getAABB(){
    const INF=1e6;
    return new AABB(new Vec3(-INF,-INF,-INF), new Vec3(INF,INF,INF));
  }
  getInertiaTensor(){ return new Vec3(Infinity,Infinity,Infinity); }
}

// ── HEIGHTFIELD COLLISION RESPONSE ───────────────────────────────────────
// Call this in the physics step to resolve bodies against terrain
export function resolveTerrainCollision(bodies, terrainT=0){
  const SEA = getSeaLevel();
  for(const body of bodies){
    if(body.isStatic || !body.shape) continue;

    const px = body.position.x;
    const pz = body.position.z; // in engine coords, z = portal y
    const h  = fbmTerrain(px, pz, terrainT); // terrain height in portal space
    // Engine Y-up: terrain surface is at world.y = h

    const shape = body.shape;
    let footY;
    if(shape.type === 'capsule'){
      footY = body.position.y - shape.halfHeight - shape.radius;
    } else if(shape.type === 'sphere'){
      footY = body.position.y - shape.radius;
    } else if(shape.type === 'box'){
      footY = body.position.y - shape.halfExtents.y;
    } else {
      footY = body.position.y - 0.5;
    }

    const penetration = h - footY;
    if(penetration <= 0) continue;

    // Push up out of terrain
    body.position.y += penetration;

    // Kill downward velocity, apply friction
    if(body.linearVelocity.y < 0){
      body.linearVelocity.y *= -body.restitution;
    }
    // Friction on horizontal velocity
    const frictionFactor = Math.pow(1 - body.friction * 0.8, 1);
    body.linearVelocity.x *= frictionFactor;
    body.linearVelocity.z *= frictionFactor;

    body.wake();

    // Buoyancy for water
    if(h < SEA){
      const submergeDepth = Math.min(1, (SEA - body.position.y + 1.0));
      if(submergeDepth > 0){
        const buoyForce = new Vec3(0, submergeDepth * body.mass * 12, 0);
        body.addForce(buoyForce);
        // Water drag
        body.linearVelocity.scaleSelf(0.92);
        body.angularVelocity.scaleSelf(0.92);
      }
    }
  }
}
