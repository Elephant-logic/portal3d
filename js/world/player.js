import { Vec3 }           from '../math/vec3.js';
import { Quat }           from '../math/quat.js';
import { RigidBody }      from '../physics/rigidbody.js';
import { CapsuleShape }   from '../physics/shapes.js';
import { fbmTerrain, getSeaLevel, W_GRAVITY } from './vars.js';

const CAPSULE_RADIUS      = 0.4;
const CAPSULE_HALF_HEIGHT = 0.7;
const EYE_HEIGHT          = 1.5;
const MOVE_SPEED          = 6.0;
const TURN_SPEED          = 0.04;
const JUMP_FORCE          = 7.0;
const GROUND_THRESHOLD    = 0.15;

export class PlayerController {
  constructor(physicsWorld){
    this.physics  = physicsWorld;
    this.yaw      = 0;
    this.pitch    = 0;
    this.onGround = false;
    this.inWater  = false;

    // Real rigid body with capsule shape
    this.body = new RigidBody();
    this.body.setShape(new CapsuleShape(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT));
    this.body.setMass(70);
    this.body.restitution = 0.0;
    this.body.friction    = 0.8;
    this.body.linearDamp  = 0.0;
    this.body.angularDamp = 1.0;
    // Lock rotation — player never tumbles
    this.body._localInvInertia = new Vec3(0,0,0);

    physicsWorld.bodies.push(this.body);
  }

  get position(){ return this.body.position; }

  update(input, dt){
    const SEA  = getSeaLevel();
    const grav = W_GRAVITY * 9.81;

    // Look
    this.yaw   += input.lookDX * 0.003;
    this.pitch -= input.lookDY * 0.003;
    this.pitch  = Math.max(-1.2, Math.min(1.2, this.pitch));

    // Terrain height at player position
    const terrainH    = fbmTerrain(this.body.position.x, this.body.position.z, 0);
    const footY       = this.body.position.y - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS;
    const penetration = terrainH - footY;

    this.inWater  = terrainH < SEA;
    this.onGround = penetration > -GROUND_THRESHOLD;

    // Resolve terrain collision
    if(penetration > 0){
      this.body.position.y += penetration;
      if(this.body.linearVelocity.y < 0) this.body.linearVelocity.y = 0;
      this.onGround = true;
      this.body.wake();
    }

    // Turn
    if(input.left)  this.yaw -= TURN_SPEED;
    if(input.right) this.yaw += TURN_SPEED;

    // Horizontal movement
    const fwdX =  Math.sin(this.yaw), fwdZ =  Math.cos(this.yaw);
    const rgtX =  Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    const sp   = MOVE_SPEED * (input.sprint ? 2.5 : 1.0);

    let mx = 0, mz = 0;
    if(input.fwd)    { mx += fwdX*sp; mz += fwdZ*sp; }
    if(input.back)   { mx -= fwdX*sp; mz -= fwdZ*sp; }
    if(input.strafeL){ mx -= rgtX*sp; mz -= rgtZ*sp; }
    if(input.strafeR){ mx += rgtX*sp; mz += rgtZ*sp; }

    if(this.onGround || this.inWater){
      this.body.linearVelocity.x = mx;
      this.body.linearVelocity.z = mz;
    } else {
      this.body.linearVelocity.x += mx * dt * 3;
      this.body.linearVelocity.z += mz * dt * 3;
    }

    // Jump
    if(input.jump && this.onGround && !this.inWater){
      this.body.linearVelocity.y = JUMP_FORCE / Math.sqrt(Math.max(0.1, W_GRAVITY));
      this.onGround = false;
      this.body.wake();
    }

    // Water buoyancy + drag
    if(this.inWater){
      const surfaceY = SEA + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
      const submerge = surfaceY - this.body.position.y;
      if(submerge > 0) this.body.linearVelocity.y += submerge * 8 * dt;
      this.body.linearVelocity.scaleSelf(Math.pow(0.85, dt*60));
    }

    // Gravity
    if(!this.onGround && !this.inWater){
      this.body.linearVelocity.y -= grav * dt;
    }

    // Integrate
    this.body.position.addSelf(this.body.linearVelocity.scale(dt));
    this.body.orientation = Quat.identity();
  }

  getCameraPosition(){
    return new Vec3(
      this.body.position.x,
      this.body.position.y + EYE_HEIGHT,
      this.body.position.z
    );
  }

  getCameraOrientation(){
    const qYaw   = Quat.fromAxisAngle(new Vec3(0,1,0), -this.yaw);
    const qPitch = Quat.fromAxisAngle(new Vec3(1,0,0),  this.pitch);
    return qYaw.mul(qPitch).normalise();
  }

  spawnOnTerrain(){
    const SEA = getSeaLevel();
    for(let r=0; r<300; r+=8){
      for(let a=0; a<Math.PI*2; a+=0.7){
        const tx = r===0 ? 0 : Math.cos(a)*r;
        const tz = r===0 ? 0 : Math.sin(a)*r;
        const h  = fbmTerrain(tx, tz, 0);
        if(h > SEA && h < SEA+4){
          this.body.position.setSelf(tx, h+CAPSULE_HALF_HEIGHT+CAPSULE_RADIUS+1, tz);
          this.body.linearVelocity.setSelf(0,0,0);
          return;
        }
      }
    }
    const h = fbmTerrain(0,0,0);
    this.body.position.setSelf(0, h+CAPSULE_HALF_HEIGHT+CAPSULE_RADIUS+1, 0);
  }
}
