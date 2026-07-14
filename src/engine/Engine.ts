import { Particle } from './Particle';
import { Field } from './Field';

export class Engine {
  readonly particles: Particle[];
  private fields: Field[] = [];

  constructor(particles: Particle[]) {
    this.particles = particles;
  }

  // Any event type (mouse, MIDI, JSON, mic) calls this to inject a field
  addField(field: Field): void {
    this.fields.push(field);
  }

  update(dt: number): void {
    // 1. Advance all fields, remove expired ones
    for (const field of this.fields) field.update(dt);
    this.fields = this.fields.filter((f) => f.isAlive());

    // 2. Physics step per particle
    for (const particle of this.particles) {
      // Sum forces from every active field
      for (const field of this.fields) {
        particle.applyForce(field.forceOn(particle.position));
      }
      // acceleration → velocity → position → reset acceleration
      particle.update();
    }
  }
}
