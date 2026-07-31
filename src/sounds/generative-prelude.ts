"use client";

import * as Tone from "tone";
import { MEASURES } from "@/sounds/prelude";
import type { PreludeVoice } from "@/sounds/prelude";

// Generative reinterpretation of Prelude (BWV 846, mm. 1-8), built to spec:
//   - 4/4 time, one measure = 16 sixteenth-note steps
//   - preserve the original bass note
//   - preserve the measure's pitch set and octaves
//   - divide the measure into four groups of four sixteenth notes
//   - generate each four-note group from the measure's notes
//   - prevent immediate repetition of the same pitch
//   - keep the first note of each measure fixed
//   - randomize only the inner notes
//   - move to the next harmonic group after exactly 16 steps
//
// Each measure's harmony set (5 pitches, octaves as written, harmony[0] is
// the bass) is re-shuffled into a fresh 16-step sequence every time that
// measure comes around, so the piece keeps drifting into new variations
// instead of repeating the same generated pattern on every loop.
export class GenerativePrelude {
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private synth: Tone.Synth;
  private voice: PreludeVoice | null;
  private stepLoop: Tone.Loop | null = null;
  onMeasure: ((index: number) => void) | null = null;

  constructor(voice?: PreludeVoice) {
    this.voice = voice ?? null;

    this.filter = new Tone.Filter({
      frequency: 1800,
      type: "lowpass",
      rolloff: -12,
    }).toDestination();

    this.reverb = new Tone.Reverb({
      decay: 1.2,
      wet: 0.08,
    }).connect(this.filter);

    this.synth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: {
        attack:  0.005,
        decay:   0.12,
        sustain: 0,
        release: 0.08,
      },
    }).connect(this.reverb);
  }

  // Steps 0-15 for one measure. Step 0 is always the preserved bass note;
  // steps 1-15 (the four groups' inner notes, and groups 2-4 in full) are
  // drawn from the measure's own pitch set with no immediate repeats.
  private generateMeasureSteps(pitchSet: readonly string[]): string[] {
    const bass = pitchSet[0];
    const steps: string[] = new Array(16);
    steps[0] = bass;

    for (let i = 1; i < 16; i++) {
      let candidate: string;
      do {
        candidate = pitchSet[Math.floor(Math.random() * pitchSet.length)];
      } while (candidate === steps[i - 1]);
      steps[i] = candidate;
    }
    return steps;
  }

  start(bpm = 72): void {
    Tone.getTransport().bpm.value = bpm;

    let measureIndex = 0;
    let stepIndex = 0;
    let currentSteps = this.generateMeasureSteps(MEASURES[measureIndex].harmony);

    if (this.onMeasure) {
      const idx = measureIndex;
      Tone.getDraw().schedule(() => { this.onMeasure?.(idx); }, Tone.now());
    }

    this.stepLoop = new Tone.Loop((time) => {
      const note = currentSteps[stepIndex];
      if (this.voice) {
        this.voice.trigger(note, time, 0.55);
      } else {
        this.synth.triggerAttackRelease(note, "32n", time, 0.55);
      }

      stepIndex++;
      if (stepIndex >= 16) {
        stepIndex = 0;
        measureIndex = (measureIndex + 1) % MEASURES.length;
        currentSteps = this.generateMeasureSteps(MEASURES[measureIndex].harmony);
        if (this.onMeasure) {
          const idx = measureIndex;
          Tone.getDraw().schedule(() => { this.onMeasure?.(idx); }, time);
        }
      }
    }, "16n");
    this.stepLoop.start(0);

    Tone.getTransport().start();
  }

  stop(): void {
    this.stepLoop?.stop();
    this.stepLoop?.dispose();
    this.stepLoop = null;
    Tone.getTransport().stop();
  }

  dispose(): void {
    this.stop();
    this.synth.dispose();
    this.reverb.dispose();
    this.filter.dispose();
  }

  get measures() { return MEASURES; }
}
