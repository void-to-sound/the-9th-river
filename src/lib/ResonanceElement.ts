import type p5 from "p5";
import { flowVector } from "./flow";
import { FLOW_SCALE, FLOW_STRENGTH } from "@/sketches/001-piano-dots/config";

export interface ParticleOptions {
  x: number;
  y: number;
  hue: number;
  saturation: number;
  lightness: number;
  size: number;
  lifespan: number; // frames
}

export class ResonanceElement {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifespan: number;
  size: number;
  hue: number;
  saturation: number;
  lightness: number;

  constructor(opts: ParticleOptions) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.lifespan = opts.lifespan;
    this.size = opts.size;
    this.hue = opts.hue;
    this.saturation = opts.saturation;
    this.lightness = opts.lightness;
  }

  get alive(): boolean {
    return this.age < this.lifespan;
  }

  update(p: p5, t: number): void {
    const { vx, vy } = flowVector(p, this.x, this.y, t, FLOW_SCALE, FLOW_STRENGTH);
    this.vx = vx;
    this.vy = vy;
    this.x += this.vx;
    this.y += this.vy;
    this.age++;
  }

  draw(p: p5): void {
    const alpha = 1 - this.age / this.lifespan;
    p.noStroke();
    p.fill(this.hue, this.saturation, this.lightness, alpha * 255);
    p.circle(this.x, this.y, this.size * alpha);
  }
}
