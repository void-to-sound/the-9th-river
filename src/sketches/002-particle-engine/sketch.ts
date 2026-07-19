import type p5 from 'p5';
import { Engine } from '@/engine/Engine';
import { Particle } from '@/engine/Particle';
import { RadialField } from '@/engine/Field';
import { Vec2 } from '@/engine/Vec2';

const PARTICLE_COUNT = 150;
const FIELD_RADIUS   = 180;
const FIELD_STRENGTH = 0.35;  // pixels/frame² at center
const FIELD_LIFETIME = 0.85;  // seconds

export function createEngineSketch() {
  return (p: p5) => {
    let engine: Engine;

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);

      const particles = Array.from({ length: PARTICLE_COUNT }, () =>
        new Particle(p.random(p.width), p.random(p.height))
      );
      engine = new Engine(particles);
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    // Event → Field: mouse click creates a RadialField at the click point
    p.mousePressed = () => {
      engine.addField(
        new RadialField(
          new Vec2(p.mouseX, p.mouseY),
          FIELD_RADIUS,
          FIELD_STRENGTH,
          FIELD_LIFETIME,
        )
      );
    };

    p.draw = () => {
      p.background(0);

      const dt = p.deltaTime / 1000;
      engine.update(dt, p.width, p.height);

      p.noStroke();
      p.fill(255);
      for (const particle of engine.particles) {
        p.circle(particle.position.x, particle.position.y, 4);
      }
    };
  };
}
