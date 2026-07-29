"use client";

import * as Tone from "tone";

const MEASURES = [
  { measure: 1,  harmony: ["C4","E4","G4","C5","E5"],  notes: ["C4","E4","G4","C5","E5","G4","C5","E5","C4","E4","G4","C5","E5","G4","C5","E5"] },
  { measure: 2,  harmony: ["C4","D4","A4","D5","F5"],  notes: ["C4","D4","A4","D5","F5","A4","D5","F5","C4","D4","A4","D5","F5","A4","D5","F5"] },
  { measure: 3,  harmony: ["B3","D4","G4","D5","F5"],  notes: ["B3","D4","G4","D5","F5","G4","D5","F5","B3","D4","G4","D5","F5","G4","D5","F5"] },
  { measure: 4,  harmony: ["C4","E4","G4","C5","E5"],  notes: ["C4","E4","G4","C5","E5","G4","C5","E5","C4","E4","G4","C5","E5","G4","C5","E5"] },
  { measure: 5,  harmony: ["C4","E4","A4","E5","A5"],  notes: ["C4","E4","A4","E5","A5","A4","E5","A5","C4","E4","A4","E5","A5","A4","E5","A5"] },
  { measure: 6,  harmony: ["C4","D4","F#4","A4","D5"], notes: ["C4","D4","F#4","A4","D5","F#4","A4","D5","C4","D4","F#4","A4","D5","F#4","A4","D5"] },
  { measure: 7,  harmony: ["B3","D4","G4","D5","G5"],  notes: ["B3","D4","G4","D5","G5","G4","D5","G5","B3","D4","G4","D5","G5","G4","D5","G5"] },
  { measure: 8,  harmony: ["B3","C4","E4","G4","C5"],  notes: ["B3","C4","E4","G4","C5","E4","G4","C5","B3","C4","E4","G4","C5","E4","G4","C5"] },
];

export type PreludeMeasure = (typeof MEASURES)[number];

export class Prelude {
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private synth: Tone.Synth;
  private part: Tone.Part | null = null;
  private measureLoop: Tone.Loop | null = null;
  onMeasure: ((index: number) => void) | null = null;

  constructor() {
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

  start(bpm = 72): void {
    Tone.getTransport().bpm.value = bpm;

    // Build all note events across 8 measures
    const events: { time: string; note: string }[] = [];
    MEASURES.forEach((m, mi) => {
      m.notes.forEach((note, ni) => {
        const beat      = Math.floor(ni / 4);
        const sixteenth = ni % 4;
        events.push({ time: `${mi}:${beat}:${sixteenth}`, note });
      });
    });

    this.part = new Tone.Part<{ time: string; note: string }>(
      (time, { note }) => {
        this.synth.triggerAttackRelease(note, "32n", time, 0.55);
      },
      events,
    );
    this.part.loop    = true;
    this.part.loopEnd = `${MEASURES.length}:0:0`;
    this.part.start(0);

    // Fire onMeasure callback each bar so UI can follow along
    this.measureLoop = new Tone.Loop((time) => {
      if (this.onMeasure) {
        const pos     = Tone.getTransport().position as string;
        const barStr  = pos.split(":")[0];
        const bar     = parseInt(barStr, 10) % MEASURES.length;
        Tone.getDraw().schedule(() => { this.onMeasure?.(bar); }, time);
      }
    }, "1m");
    this.measureLoop.start(0);

    Tone.getTransport().start();
  }

  stop(): void {
    this.part?.stop();
    this.measureLoop?.stop();
    Tone.getTransport().stop();
  }

  dispose(): void {
    this.stop();
    this.part?.dispose();
    this.measureLoop?.dispose();
    this.synth.dispose();
    this.reverb.dispose();
    this.filter.dispose();
  }

  get measures() { return MEASURES; }
}
