import { Particle } from './Particle';
import { Field } from './Field';

export class Engine {
  readonly particles: Particle[];
  private fields: Field[] = [];

  constructor(particles: Particle[]) {
    this.particles = particles;
  }

  addField(field: Field): void {
    this.fields.push(field);
  }

  update(dt: number, width: number, height: number): void {
    // 1. Advance all fields, remove expired ones
    for (const field of this.fields) field.update(dt);
    this.fields = this.fields.filter((f) => f.isAlive());

    // 2. Physics step per particle
    for (const particle of this.particles) {
      for (const field of this.fields) {
        particle.applyForce(field.forceOn(particle.position));
      }
      particle.update();

      // 3. Out of bounds → snap back to origin (with margin so particle travels a bit further before reset)
      const margin = 30;
      const { x, y } = particle.position;
      if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
        particle.resetToOrigin();
      }
    }
  }
}
