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
    this.pitch = 0;
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

    // Look — mouse drag right = positive lookDX = turn right = yaw decreases
    this.yaw   -= input.lookDX * 0.004;
    this.pitch -= input.lookDY * 0.004;
    this.pitch  = Math.max(-1.3, Math.min(1.3, this.pitch));
    if(input.left)  this.yaw += TURN;
    if(input.right) this.yaw -= TURN;

    // Ground check
    const terrainH = fbmTerrain(this.body.position.x, this.body.position.z, 0);
    const footY    = this.body.position.y - CAP_H - CAP_R;
    const pen      = terrainH - footY;
    this.inWater   = this.body.position.y < SEA + 0.3 && terrainH < SEA;
    this.onGround  = pen > -0.15 && !this.inWater;

    if(pen > 0){
      this.body.position.y += pen;
      if(this.body.linearVelocity.y < 0) this.body.linearVelocity.y = 0;
      this.onGround = true;
    }

    // Movement — use the same forward/right we compute for the view matrix
    const fwd   = this._getForward();
    const right = this._getRight();
    const sp    = SPEED * (input.sprint ? 2.5 : 1);
    let mx = 0, mz = 0;
    if(input.fwd)    { mx += fwd.x*sp;   mz += fwd.z*sp;   }
    if(input.back)   { mx -= fwd.x*sp;   mz -= fwd.z*sp;   }
    if(input.strafeL){ mx -= right.x*sp; mz -= right.z*sp; }
    if(input.strafeR){ mx += right.x*sp; mz += right.z*sp; }

    if(this.onGround || this.inWater){
      this.body.linearVelocity.x = mx;
      this.body.linearVelocity.z = mz;
    } else {
      this.body.linearVelocity.x += mx * dt * 3;
      this.body.linearVelocity.z += mz * dt * 3;
    }

    if(input.jump && this.onGround && !this.inWater){
      this.body.linearVelocity.y = JUMP / Math.sqrt(Math.max(0.1, W_GRAVITY));
      this.onGround = false;
    }

    if(this.inWater){
      const sub = (SEA + 0.2) - this.body.position.y;
      this.body.linearVelocity.y += sub * 3 * dt;
      this.body.linearVelocity.scaleSelf(Math.pow(0.82, dt * 60));
      if(input.jump) this.body.linearVelocity.y += 4 * dt;
    }

    if(!this.onGround && !this.inWater)
      this.body.linearVelocity.y -= grav * dt;

    this.body.position.addSelf(this.body.linearVelocity.scale(dt));
    this.body.orientation = Quat.identity();
  }

  // Forward direction projected onto XZ plane (for movement)
  _getForward(){
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // At yaw=0: lookAt target is (0,0,-1) from eye → forward is -Z → fx=0,fz=-1
    return new Vec3(-sy, 0, -cy);
  }

  _getRight(){
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return new Vec3(cy, 0, -sy);
  }

  getCameraPosition(){
    return new Vec3(
      this.body.position.x,
      this.body.position.y + EYE,
      this.body.position.z
    );
  }

  // Use Mat4.lookAt — the engine already has this and it's correct
  getViewMatrix(){
    const eye = this.getCameraPosition();
    const sy   = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp   = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    // Target = eye + forward direction
    // forward at yaw=0,pitch=0: (0,0,-1)
    const tx = eye.x + (-sy * cp);
    const ty = eye.y + sp;
    const tz = eye.z + (-cy * cp);
    return Mat4.lookAt(eye, new Vec3(tx, ty, tz), new Vec3(0,1,0));
  }

  getCameraOrientation(){ return Quat.identity(); }

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
