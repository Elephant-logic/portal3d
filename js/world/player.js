import { Vec3 }  from '../math/vec3.js';
import { Quat }  from '../math/quat.js';
import { RigidBody }    from '../physics/rigidbody.js';
import { CapsuleShape } from '../physics/shapes.js';
import { fbmTerrain, W_GRAVITY } from './vars.js';

const SEA   = 2.2;
const EYE   = 1.7;   // eye above body centre
const SPEED = 4.0;
const TURN  = 0.04;
const JUMP  = 6.0;
const CAP_R = 0.3;
const CAP_H = 0.6;

export class PlayerController {
  constructor(physicsWorld){
    this.yaw=0; this.pitch=0.25;
    this.onGround=false; this.inWater=false;
    this.body=new RigidBody();
    this.body.setShape(new CapsuleShape(CAP_R,CAP_H));
    this.body.setMass(70);
    this.body.restitution=0; this.body.friction=0.8;
    this.body.linearDamp=0; this.body.angularDamp=1;
    this.body._localInvInertia=new Vec3(0,0,0);
    physicsWorld.bodies.push(this.body);
  }

  get position(){ return this.body.position; }

  update(input,dt){
    const grav=W_GRAVITY*9.81;

    // Look — yaw increase = turn LEFT with fromAxisAngle(Y, yaw) convention
    // So drag right (positive lookDX) = turn right = yaw decrease
    this.yaw  -= input.lookDX*0.003;
    this.pitch -= input.lookDY*0.003;
    this.pitch = Math.max(-1.3,Math.min(1.3,this.pitch));

    // Ground check
    const h=fbmTerrain(this.body.position.x, this.body.position.z, 0);
    const footY=this.body.position.y-CAP_H-CAP_R;
    const pen=h-footY;
    this.inWater =h<SEA;
    this.onGround=pen>-0.15;

    if(pen>0){
      this.body.position.y+=pen;
      if(this.body.linearVelocity.y<0) this.body.linearVelocity.y=0;
      this.onGround=true;
    }

    // Turn — left key = turn left = yaw increase, right = yaw decrease
    if(input.left)  this.yaw+=TURN;
    if(input.right) this.yaw-=TURN;

    // Move — camera looks down -Z in WebGL, so forward = (-sin(yaw), 0, -cos(yaw))
    // Strafe right = cross(forward, up) = (cos(yaw), 0, -sin(yaw))
    const fx=-Math.sin(this.yaw), fz=-Math.cos(this.yaw);
    const rx= Math.cos(this.yaw), rz=-Math.sin(this.yaw);
    const sp=SPEED*(input.sprint?2.5:1);
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

    if(input.jump&&this.onGround&&!this.inWater){
      this.body.linearVelocity.y=JUMP/Math.sqrt(Math.max(0.1,W_GRAVITY));
      this.onGround=false;
    }

    if(this.inWater){
      const surfY=SEA+CAP_H+CAP_R;
      const sub=surfY-this.body.position.y;
      if(sub>0) this.body.linearVelocity.y+=sub*6*dt;
      this.body.linearVelocity.scaleSelf(Math.pow(0.88,dt*60));
    }

    if(!this.onGround&&!this.inWater) this.body.linearVelocity.y-=grav*dt;

    this.body.position.addSelf(this.body.linearVelocity.scale(dt));
    this.body.orientation=Quat.identity();
  }

  getCameraPosition(){
    return new Vec3(
      this.body.position.x,
      this.body.position.y+EYE,
      this.body.position.z
    );
  }

  getCameraOrientation(){
    const qY=Quat.fromAxisAngle(new Vec3(0,1,0), this.yaw);
    const qX=Quat.fromAxisAngle(new Vec3(1,0,0), this.pitch);
    return qY.mul(qX).normalise();
  }

  spawnOnTerrain(){
    // Search outward for low land just above sea
    for(let r=0;r<500;r+=3){
      for(let a=0;a<Math.PI*2;a+=0.4){
        const tx=r===0?0:Math.cos(a)*r;
        const tz=r===0?0:Math.sin(a)*r;
        const h=fbmTerrain(tx,tz,0);
        if(h>=SEA+0.05 && h<SEA+1.5){
          this.body.position.setSelf(tx, h+CAP_H+CAP_R+0.2, tz);
          this.body.linearVelocity.setSelf(0,0,0);
          return;
        }
      }
    }
    const h=fbmTerrain(0,0,0);
    this.body.position.setSelf(0, h+CAP_H+CAP_R+0.2, 0);
    this.body.linearVelocity.setSelf(0,0,0);
  }
}
