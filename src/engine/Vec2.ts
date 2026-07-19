export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  // Mutating — used in hot physics loop to avoid allocations
  addSelf(v: Vec2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  scaleSelf(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  zero(): this {
    this.x = 0;
    this.y = 0;
    return this;
  }

  // Non-mutating — used when computing derived values
  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  normalize(): Vec2 {
    const len = Math.sqrt(this.x * this.x + this.y * this.y);
    if (len === 0) return new Vec2(0, 0);
    return new Vec2(this.x / len, this.y / len);
  }

  distanceTo(v: Vec2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
