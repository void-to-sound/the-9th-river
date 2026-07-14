import { Vec2 } from './Vec2';

export class Particle {
  position: Vec2;
  velocity: Vec2;
  acceleration: Vec2;

  constructor(x: number, y: number) {
    this.position = new Vec2(x, y);
    this.velocity = new Vec2(0, 0);
    this.acceleration = new Vec2(0, 0);
  }

  applyForce(force: Vec2): void {
    this.acceleration.addSelf(force);
  }

  // Called once per frame after all forces have been applied
  update(): void {
    this.velocity.addSelf(this.acceleration); // v += a
    this.position.addSelf(this.velocity);     // p += v
    this.acceleration.zero();                 // reset for next frame
  }
}
