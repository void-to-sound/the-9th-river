"use client";

import * as Tone from "tone";
import { MEASURES } from "@/sounds/prelude";
import type { PreludeVoice, PreludeTriggerOptions } from "@/sounds/prelude";
import { pickStepIndex, type RuleKey, type GestureKey } from "@/sounds/generative-rules";

// A hand-composed ending tacked on after the normal `maxPlays` measures: any
// number of Orbit-generated measures (one per harmony in `generatedHarmonies`,
// played in order), then any number of exact fixed measures in order (use
// null steps within a measure to let a note ring out instead of being
// re-attacked), then a silent wait before the piece formally stops.
// `codaNote`, if given, is swelled in (a few soft re-triggers to feed the
// reverb) at the start of that wait — omit it if the fixed measures' own
// ending is already all the "coda" you want.
export interface PreludeOutro {
  generatedHarmonies: string[][];
  fixedMeasures: (string | null)[][];
  codaNote?: string;
  codaSilenceMeasures?: number; // how long to wait in silence before stopping (default 4)
  // Applied (via PreludeVoice.trigger's options) to any note in the LAST
  // fixed measure only — lets the piece's final note behave differently
  // (held longer, cut drier) from every other note without touching them.
  finalMeasureTriggerOptions?: PreludeTriggerOptions;
}

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
  private rule: RuleKey;
  private gestureMap: GestureKey[] = new Array(MEASURES.length).fill("wave");
  private stepLoop: Tone.Loop | null = null;
  onMeasure: ((index: number) => void) | null = null;
  onFinished: (() => void) | null = null;
  // Fires the instant the outro's final silent wait begins (right after the
  // last fixed measure finishes) — a good hook for starting anything that
  // should fade out over that same silent stretch, timed to it precisely.
  onOutroSilenceStart: (() => void) | null = null;

  constructor(voice?: PreludeVoice, rule: RuleKey = "dustRandom") {
    this.voice = voice ?? null;
    this.rule = rule;

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

  setRule(rule: RuleKey): void {
    this.rule = rule;
  }

  // One gesture per measure (0-7), only consulted when rule === "gestureMap".
  setGestureMap(map: GestureKey[]): void {
    this.gestureMap = map;
  }

  // Steps 0-15 for one measure. Step 0 is always the preserved bass note;
  // steps 1-15 are drawn from the measure's own pitch set according to
  // `this.rule` (see generative-rules.ts), read fresh each call so a live
  // rule switch takes effect starting at the next measure boundary.
  // `playIndex` is the raw, ever-advancing measure-play counter (NOT the
  // same as which harmony/chord is sounding — see harmonyIndexFor below).
  // It's only consulted by rules whose pattern depends on it, e.g. Shape
  // Cycle uses `playIndex % 4` to pick which of its 4 shapes to play next.
  private generateMeasureSteps(pitchSet: readonly string[], playIndex: number): string[] {
    const steps: string[] = new Array(16);
    const indices: number[] = new Array(16);
    steps[0] = pitchSet[0];
    indices[0] = 0;

    for (let i = 1; i < 16; i++) {
      const prevIndex = indices[i - 1];
      const recent = indices.slice(Math.max(0, i - 3), i);
      const idx = pickStepIndex(this.rule, pitchSet.length, i, prevIndex, recent, playIndex, this.gestureMap);
      steps[i] = pitchSet[idx];
      indices[i] = idx;
    }
    return steps;
  }

  // How many measure-plays make up one full lap of the piece. Normally one
  // play per harmony (8), but Shape Cycle holds each harmony for 4 plays
  // (original + 3 variants) before moving on, so it needs 8 x 4 = 32.
  private totalSlotsFor(rule: RuleKey): number {
    return rule === "shapeCycle" ? MEASURES.length * 4 : MEASURES.length;
  }

  // Which harmony (0-7) is sounding at a given play slot. Shape Cycle stays
  // on the same harmony for 4 consecutive plays; every other rule advances
  // the harmony every single play.
  private harmonyIndexFor(rule: RuleKey, playIndex: number): number {
    if (rule === "shapeCycle") {
      return Math.floor(playIndex / 4) % MEASURES.length;
    }
    return playIndex % MEASURES.length;
  }

  private triggerNote(note: string, time: number, velocity = 0.55, options?: PreludeTriggerOptions): void {
    if (this.voice) {
      this.voice.trigger(note, time, velocity, options);
    } else {
      this.synth.triggerAttackRelease(note, options?.duration ?? "32n", time, velocity);
    }
  }

  // `maxPlays`, if given, stops the piece for good after that many total
  // measure-plays (e.g. 2 laps of an 8-measure cycle = 16) instead of
  // looping forever. `silentTailPlays` stops triggering NEW notes for the
  // last N of those plays instead — rather than fading the master volume
  // down (which crushes the reverb tail at the same rate as everything
  // else), this just goes quiet and lets whatever was already ringing decay
  // on its own, the way a room's reverb actually dies out. Tone.Transport
  // stopping doesn't cut off audio already in the graph, so the tail rings
  // out in real time even after the piece has formally "ended". `outro`, if
  // given, plays a hand-composed ending after those `maxPlays` measures
  // instead of stopping right away (see PreludeOutro).
  start(bpm = 72, maxPlays?: number, silentTailPlays = 0, outro?: PreludeOutro): void {
    Tone.getTransport().bpm.value = bpm;

    let playIndex = 0;
    let stepIndex = 0;
    let playsCompleted = 0;
    let harmonyIndex = this.harmonyIndexFor(this.rule, playIndex);
    let currentSteps = this.generateMeasureSteps(MEASURES[harmonyIndex].harmony, playIndex);

    type Phase = "main" | "outroGenerated" | "outroFixed" | "coda";
    let phase: Phase = "main";
    let outroSteps: string[] = [];
    let generatedMeasureIndex = 0;
    let fixedMeasureIndex = 0;
    let codaStepsElapsed = 0;
    const codaSilenceSteps = (outro?.codaSilenceMeasures ?? 4) * 16;

    if (this.onMeasure) {
      const idx = harmonyIndex;
      Tone.getDraw().schedule(() => { this.onMeasure?.(idx); }, Tone.now());
    }

    this.stepLoop = new Tone.Loop((time) => {
      if (phase === "outroGenerated" && outro) {
        this.triggerNote(outroSteps[stepIndex], time);
        stepIndex++;
        if (stepIndex >= 16) {
          stepIndex = 0;
          generatedMeasureIndex++;
          if (generatedMeasureIndex >= outro.generatedHarmonies.length) {
            phase = "outroFixed";
          } else {
            outroSteps = this.generateMeasureSteps(
              outro.generatedHarmonies[generatedMeasureIndex],
              playIndex + 1 + generatedMeasureIndex,
            );
          }
        }
        return;
      }

      if (phase === "outroFixed" && outro) {
        const note = outro.fixedMeasures[fixedMeasureIndex][stepIndex];
        if (note !== null) {
          const isLastFixedMeasure = fixedMeasureIndex === outro.fixedMeasures.length - 1;
          const options = isLastFixedMeasure ? outro.finalMeasureTriggerOptions : undefined;
          this.triggerNote(note, time, 0.55, options);
        }
        stepIndex++;
        if (stepIndex >= 16) {
          stepIndex = 0;
          fixedMeasureIndex++;
          if (fixedMeasureIndex >= outro.fixedMeasures.length) {
            phase = "coda";
            if (this.onOutroSilenceStart) {
              Tone.getDraw().schedule(() => { this.onOutroSilenceStart?.(); }, time);
            }
          }
        }
        return;
      }

      if (phase === "coda" && outro) {
        if (codaStepsElapsed === 0 && outro.codaNote) {
          // A few soft, closely-spaced re-triggers "feed" the voice's own
          // reverb tank before it's left alone — the tail reads as a long,
          // swelling resonance instead of just one note's normal decay,
          // using the same reverb every other note already goes through.
          const swell = [
            { offset: 0,    velocity: 0.55 },
            { offset: 0.18, velocity: 0.4 },
            { offset: 0.4,  velocity: 0.28 },
            { offset: 0.7,  velocity: 0.18 },
          ];
          for (const { offset, velocity } of swell) {
            this.triggerNote(outro.codaNote, time + offset, velocity);
          }
        }
        codaStepsElapsed++;
        if (codaStepsElapsed >= codaSilenceSteps) {
          this.stop();
          this.onFinished?.();
        }
        return;
      }

      // phase === "main"
      const inSilentTail = maxPlays !== undefined && silentTailPlays > 0
        && playsCompleted >= maxPlays - silentTailPlays;

      if (!inSilentTail) {
        this.triggerNote(currentSteps[stepIndex], time);
      }

      stepIndex++;
      if (stepIndex >= 16) {
        stepIndex = 0;
        playsCompleted++;

        if (maxPlays !== undefined && playsCompleted >= maxPlays) {
          if (outro && outro.generatedHarmonies.length > 0) {
            phase = "outroGenerated";
            generatedMeasureIndex = 0;
            outroSteps = this.generateMeasureSteps(outro.generatedHarmonies[0], playIndex + 1);
          } else if (outro) {
            phase = "outroFixed";
          } else {
            this.stop();
            this.onFinished?.();
          }
          return;
        }

        const totalSlots = this.totalSlotsFor(this.rule);
        playIndex = (playIndex + 1) % totalSlots;
        harmonyIndex = this.harmonyIndexFor(this.rule, playIndex);
        currentSteps = this.generateMeasureSteps(MEASURES[harmonyIndex].harmony, playIndex);
        if (this.onMeasure) {
          const idx = harmonyIndex;
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
