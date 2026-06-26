import type p5 from "p5";
import type { NoteEvent } from "@/lib/noteEvents";
import { ResonanceElement } from "@/lib/ResonanceElement";
import { noteToHue, velocityToLightness } from "@/lib/palette";
import {
  PARTICLES_PER_NOTE,
  PARTICLE_LIFESPAN,
  PARTICLE_SIZE,
  BACKGROUND_COLOR,
  BG_ALPHA,
  PIXELS_PER_SECOND,
} from "./config";

export function createSketch(noteEvents: NoteEvent[]) {
  return (p: p5) => {
    let particles: ResonanceElement[] = [];
    let t = 0; // noise time offset

    // Pre-schedule spawn times in frames (assuming 60fps)
    const scheduled = noteEvents.map((ev) => ({
      frame: Math.round(ev.time * 60),
      event: ev,
    }));
    let scheduleIndex = 0;

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.colorMode(p.HSB, 360, 100, 100, 255);
      p.background(BACKGROUND_COLOR[0], BACKGROUND_COLOR[1], BACKGROUND_COLOR[2]);
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    p.draw = () => {
      // Soft trail fade
      p.noStroke();
      p.fill(220, 20, 8, BG_ALPHA);
      p.rect(0, 0, p.width, p.height);

      // Spawn particles for due note events
      const frame = p.frameCount;
      while (scheduleIndex < scheduled.length && scheduled[scheduleIndex].frame <= frame) {
        spawnParticles(p, scheduled[scheduleIndex].event, particles);
        scheduleIndex++;
      }

      // Update and draw
      for (const particle of particles) {
        particle.update(p, t);
        particle.draw(p);
      }

      // Cull dead particles
      particles = particles.filter((pt) => pt.alive);

      t += 0.005;
    };
  };
}

function spawnParticles(p: p5, ev: NoteEvent, particles: ResonanceElement[]): void {
  const cx = p.map(ev.time, 0, 12, p.width * 0.1, p.width * 0.9);
  // Map MIDI note 36-84 to vertical range
  const cy = p.map(ev.note, 36, 84, p.height * 0.85, p.height * 0.15);

  const hue = noteToHue(ev.note);
  const lightness = velocityToLightness(ev.velocity);
  const size = PARTICLE_SIZE * (ev.velocity / 100);

  for (let i = 0; i < PARTICLES_PER_NOTE; i++) {
    particles.push(
      new ResonanceElement({
        x: cx + p.random(-20, 20),
        y: cy + p.random(-20, 20),
        hue,
        saturation: 70 + p.random(-15, 15),
        lightness,
        size: size * p.random(0.5, 1.5),
        lifespan: PARTICLE_LIFESPAN + Math.floor(p.random(-30, 30)),
      })
    );
  }
}
