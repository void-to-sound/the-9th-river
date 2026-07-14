import { Vec2 } from './Vec2';

export interface Field {
  isAlive(): boolean;
  update(dt: number): void;        // dt in seconds
  forceOn(position: Vec2): Vec2;   // returns force vector for a particle at position
}

export class RadialField implements Field {
  private age: number = 0;

  constructor(
    readonly center: Vec2,
    readonly radius: number,
    readonly strength: number,
    readonly lifetime: number, // seconds
  ) {}

  isAlive(): boolean {
    return this.age < this.lifetime;
  }

  update(dt: number): void {
    this.age += dt;
  }

  forceOn(position: Vec2): Vec2 {
    const dist = position.distanceTo(this.center);

    // Outside radius or at exact center → no force
    if (dist >= this.radius || dist === 0) return new Vec2(0, 0);

    // Linear falloff: strongest at center, zero at radius edge
    const magnitude = this.strength * (1 - dist / this.radius);

    // Direction: radially outward from center
    const dir = new Vec2(
      position.x - this.center.x,
      position.y - this.center.y,
    ).normalize();

    return dir.scale(magnitude);
  }
}
