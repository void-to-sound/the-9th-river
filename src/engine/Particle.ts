import { Vec2 } from './Vec2';

export class Particle {
  position: Vec2;
  velocity: Vec2;
  acceleration: Vec2;
  private readonly origin: Vec2;

  constructor(x: number, y: number) {
    this.origin = new Vec2(x, y);
    this.position = new Vec2(x, y);
    this.velocity = new Vec2(0, 0);
    this.acceleration = new Vec2(0, 0);
  }

  applyForce(force: Vec2): void {
    this.acceleration.addSelf(force);
  }

  update(): void {
    this.velocity.addSelf(this.acceleration); // v += a
    this.velocity.scaleSelf(0.98);            // damping
    this.position.addSelf(this.velocity);     // p += v
    this.acceleration.zero();                 // reset for next frame
  }

  resetToOrigin(): void {
    this.position.x = this.origin.x;
    this.position.y = this.origin.y;
    this.velocity.zero();
    this.acceleration.zero();
  }
}
