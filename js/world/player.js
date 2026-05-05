import { Vec3 }  from '../math/vec3.js';
import { Quat }  from '../math/quat.js';
import { Mat4 }  from '../math/mat4.js';
import { RigidBody }    from '../physics/rigidbody.js';
import { CapsuleShape } from '../physics/shapes.js';
import { fbmTerrain, W_GRAVITY } from './vars.js';

const SEA   = 2.2;
const EYE   = 1.7;
const SPEED = 7.0;
const TURN  = 0.04;
const JUMP  = 6.0;
const CAP_R = 0.3;
const CAP_H = 0.6;

export class PlayerController {
  constructor(physicsWorld){
    this.yaw   = 0;
    this.pitch = 0.0;
    this.onGround = false;
    this.inWater  = false;
    this.body = new RigidBody();
    this.body.setShape(new CapsuleShape(CAP_R, CAP_H));
    this.body.setMass(70);
    this.body.restitution = 0;
    this.body.friction    = 0.8;
    this.body.linearDamp  = 0;
    this.body.angularDamp = 1;
    this.body._localInvInertia = new Vec3(0,0,0);
    physicsWorld.bodies.push(this.body);
  }

  get position(){ return this.body.position; }

  update(input, dt){
    const grav = W_GRAVITY * 9.81;

    // --- LOOK (mouse/touch drag) ---
    // yaw: rotate around Y. We use the convention that positive yaw = turn right.
    this.yaw   += input.lookDX * 0.004;
    this.pitch -= input.lookDY * 0.004;
    this.pitch  = Math.max(-1.3, Math.min(1.3, this.pitch));

    // Turn buttons
    if(input.left)  this.yaw -= TURN;
    if(input.right) this.yaw += TURN;

    // --- GROUND CHECK ---
    const terrainH = fbmTerrain(this.body.position.x, this.body.position.z, 0);
    const footY    = this.body.position.y - CAP_H - CAP_R;
    const pen      = terrainH - footY;
    // In water if player body is below sea surface
    this.inWater   = this.body.position.y < SEA + 0.3;
    this.onGround  = pen > -0.15 && !this.inWater;

    if(pen > 0){
      this.body.position.y += pen;
      if(this.body.linearVelocity.y < 0) this.body.linearVelocity.y = 0;
      this.onGround = true;
    }

    // --- MOVEMENT ---
    // sin/cos of yaw gives XZ forward direction.
    // yaw=0 → forward along +Z, yaw=PI/2 → forward along +X
    // yaw=0 -> forward +Z, yaw=PI/2 -> forward +X
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx =  sy, fz =  cy;   // forward vector in XZ
    const rx =  cy, rz = -sy;   // right vector in XZ

    const sp = SPEED * (input.sprint ? 2.5 : 1);
    let mx = 0, mz = 0;
    if(input.fwd)    { mx += fx*sp; mz += fz*sp; }
    if(input.back)   { mx -= fx*sp; mz -= fz*sp; }
    if(input.strafeL){ mx -= rx*sp; mz -= rz*sp; }
    if(input.strafeR){ mx += rx*sp; mz += rz*sp; }

    if(this.onGround || this.inWater){
      this.body.linearVelocity.x = mx;
      this.body.linearVelocity.z = mz;
    } else {
      this.body.linearVelocity.x += mx * dt * 3;
      this.body.linearVelocity.z += mz * dt * 3;
    }

    // Jump
    if(input.jump && this.onGround && !this.inWater){
      this.body.linearVelocity.y = JUMP / Math.sqrt(Math.max(0.1, W_GRAVITY));
      this.onGround = false;
    }

    // Water — buoyancy + drag, can jump/swim upward
    if(this.inWater){
      const surfY = SEA + 0.2; // float near surface
      const sub   = surfY - this.body.position.y;
      // Buoyancy pushes up gently
      this.body.linearVelocity.y += sub * 3 * dt;
      // Strong drag so water feels thick
      this.body.linearVelocity.scaleSelf(Math.pow(0.82, dt*60));
      // Allow jump to swim upward
      if(input.jump) this.body.linearVelocity.y += 4 * dt;
    }

    // Gravity
    if(!this.onGround && !this.inWater)
      this.body.linearVelocity.y -= grav * dt;

    this.body.position.addSelf(this.body.linearVelocity.scale(dt));
    this.body.orientation = Quat.identity();
  }

  getCameraPosition(){
    return new Vec3(
      this.body.position.x,
      this.body.position.y + EYE,
      this.body.position.z
    );
  }

  // Build the view matrix directly from yaw + pitch — NO quaternion involved.
  // This matches the old portal's project() logic exactly.
  // yaw=0 faces +Z, yaw=PI/2 faces +X.
  // The view matrix transforms world coords into camera space:
  //   camera right  = (cos(yaw),  0,       -sin(yaw))
  //   camera up     = (sin(yaw)*sin(pitch), cos(pitch), cos(yaw)*sin(pitch))  [simplified]
  //   camera fwd    = (sin(yaw)*cos(pitch), -sin(pitch), cos(yaw)*cos(pitch))
  // View = transpose(R) * T(-eye)
  getViewMatrix(){
    const eye = this.getCameraPosition();
    // yaw=0 -> looking down +Z axis, yaw=PI/2 -> looking down +X axis
    const sy = Math.sin(this.yaw),   cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);

    // Camera basis in world space (camera looks in +fwd direction):
    // fwd   = ( sy*cp, -sp,  cy*cp )   yaw=0,p=0 -> (0,0,1) +Z
    // right = ( cy,     0,  -sy    )   yaw=0,p=0 -> (1,0,0) +X
    // up    = ( sy*sp,  cp,  cy*sp )   yaw=0,p=0 -> (0,1,0) +Y
    const fwdX = sy*cp, fwdY = -sp,  fwdZ = cy*cp;
    const rigX = cy,    rigY =  0,   rigZ = -sy;
    const upX  = sy*sp, upY  =  cp,  upZ  = cy*sp;

    // View matrix = rows are [right, up, -fwd], translation = -dot(basis, eye)
    // Column-major layout
    const m = Mat4.identity();
    const e = m.e;
    e[ 0]=rigX; e[ 4]=rigY; e[ 8]=rigZ; e[12]=-(rigX*eye.x + rigY*eye.y + rigZ*eye.z);
    e[ 1]=upX;  e[ 5]=upY;  e[ 9]=upZ;  e[13]=-(upX *eye.x + upY *eye.y + upZ *eye.z);
    e[ 2]=-fwdX;e[ 6]=-fwdY;e[10]=-fwdZ;e[14]= (fwdX*eye.x + fwdY*eye.y + fwdZ*eye.z);
    e[ 3]=0;    e[ 7]=0;    e[11]=0;    e[15]=1;
    return m;
  }

  // Still needed by camera.setOrientation path — not used anymore
  getCameraOrientation(){
    return Quat.identity();
  }

  spawnOnTerrain(){
    for(let r=0; r<500; r+=3){
      for(let a=0; a<Math.PI*2; a+=0.4){
        const tx = r===0 ? 0 : Math.cos(a)*r;
        const tz = r===0 ? 0 : Math.sin(a)*r;
        const h  = fbmTerrain(tx, tz, 0);
        if(h >= SEA+0.05 && h < SEA+1.5){
          this.body.position.setSelf(tx, h+CAP_H+CAP_R+0.2, tz);
          this.body.linearVelocity.setSelf(0,0,0);
          return;
        }
      }
    }
    const h = fbmTerrain(0,0,0);
    this.body.position.setSelf(0, h+CAP_H+CAP_R+0.2, 0);
    this.body.linearVelocity.setSelf(0,0,0);
  }
}
