import { Vec3 }         from '../math/vec3.js';
import { Quat }         from '../math/quat.js';
import { RigidBody }    from '../physics/rigidbody.js';
import { CapsuleShape } from '../physics/shapes.js';
import { fbmTerrain, W_GRAVITY } from './vars.js';

const SEA             = 2.2;
const CAPSULE_RADIUS  = 0.3;
const CAPSULE_HALF    = 0.6;
const EYE_HEIGHT      = 1.6;  // eye above body centre
const MOVE_SPEED      = 4.0;
const TURN_SPEED      = 0.04;
const JUMP_FORCE      = 6.0;

export class PlayerController {
  constructor(physicsWorld){
    this.yaw=0; this.pitch=0.2;
    this.onGround=false; this.inWater=false;

    this.body=new RigidBody();
    this.body.setShape(new CapsuleShape(CAPSULE_RADIUS,CAPSULE_HALF));
    this.body.setMass(70);
    this.body.restitution=0; this.body.friction=0.8;
    this.body.linearDamp=0; this.body.angularDamp=1;
    this.body._localInvInertia=new Vec3(0,0,0);
    physicsWorld.bodies.push(this.body);
  }

  get position(){ return this.body.position; }

  update(input, dt){
    const grav=W_GRAVITY*9.81;

    // Look
    this.yaw  +=input.lookDX*0.003;
    this.pitch-=input.lookDY*0.003;
    this.pitch =Math.max(-1.3,Math.min(1.3,this.pitch));

    // Terrain at player feet — portal coords: x=world.x, y=world.z
    const rawH=fbmTerrain(this.body.position.x, this.body.position.z, 0);
    const footY=this.body.position.y-CAPSULE_HALF-CAPSULE_RADIUS;
    const pen=rawH-footY;

    this.inWater =rawH<SEA;
    this.onGround=pen>-0.15;

    // Push up out of terrain
    if(pen>0){
      this.body.position.y+=pen;
      if(this.body.linearVelocity.y<0) this.body.linearVelocity.y=0;
      this.onGround=true;
      this.body.wake();
    }

    // Turn
    if(input.left)  this.yaw-=TURN_SPEED;
    if(input.right) this.yaw+=TURN_SPEED;

    // Move
    const fx=Math.sin(this.yaw), fz=Math.cos(this.yaw);
    const rx=Math.cos(this.yaw), rz=-Math.sin(this.yaw);
    const sp=MOVE_SPEED*(input.sprint?2.5:1);
    let mx=0,mz=0;
    if(input.fwd)    {mx+=fx*sp;mz+=fz*sp;}
    if(input.back)   {mx-=fx*sp;mz-=fz*sp;}
    if(input.strafeL){mx-=rx*sp;mz-=rz*sp;}
    if(input.strafeR){mx+=rx*sp;mz+=rz*sp;}

    if(this.onGround||this.inWater){
      this.body.linearVelocity.x=mx;
      this.body.linearVelocity.z=mz;
    } else {
      this.body.linearVelocity.x+=mx*dt*3;
      this.body.linearVelocity.z+=mz*dt*3;
    }

    // Jump
    if(input.jump&&this.onGround&&!this.inWater){
      this.body.linearVelocity.y=JUMP_FORCE/Math.sqrt(Math.max(0.1,W_GRAVITY));
      this.onGround=false; this.body.wake();
    }

    // Water buoyancy
    if(this.inWater){
      const surfY=SEA+CAPSULE_HALF+CAPSULE_RADIUS;
      const sub=surfY-this.body.position.y;
      if(sub>0) this.body.linearVelocity.y+=sub*6*dt;
      this.body.linearVelocity.scaleSelf(Math.pow(0.88,dt*60));
    }

    // Gravity
    if(!this.onGround&&!this.inWater) this.body.linearVelocity.y-=grav*dt;

    // Integrate position
    this.body.position.addSelf(this.body.linearVelocity.scale(dt));
    this.body.orientation=Quat.identity();
  }

  getCameraPosition(){
    return new Vec3(
      this.body.position.x,
      this.body.position.y+EYE_HEIGHT,
      this.body.position.z
    );
  }

  getCameraOrientation(){
    const qY=Quat.fromAxisAngle(new Vec3(0,1,0),-this.yaw);
    const qX=Quat.fromAxisAngle(new Vec3(1,0,0), this.pitch);
    return qY.mul(qX).normalise();
  }

  spawnOnTerrain(){
    // Find low land near sea level so player starts on ground not mountain
    for(let r=0;r<400;r+=4){
      for(let a=0;a<Math.PI*2;a+=0.5){
        const tx=r===0?0:Math.cos(a)*r;
        const tz=r===0?0:Math.sin(a)*r;
        const h=fbmTerrain(tx,tz,0);
        if(h>=SEA+0.1 && h<SEA+2){
          this.body.position.setSelf(tx, h+CAPSULE_HALF+CAPSULE_RADIUS+0.5, tz);
          this.body.linearVelocity.setSelf(0,0,0);
          return;
        }
      }
    }
    // Fallback
    const h=fbmTerrain(0,0,0);
    this.body.position.setSelf(0, Math.max(h,SEA)+CAPSULE_HALF+CAPSULE_RADIUS+0.5, 0);
  }
}
