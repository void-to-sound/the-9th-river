"use client";

import * as Tone from "tone";
import type { DustPreset } from "@/sounds/dust-palette";
import type { PreludeVoice } from "@/sounds/prelude";

// dust-palette.ts's presets each fire once and let a chord/texture ring for
// many seconds — great for a held pad, unplayable as a melody instrument.
// These rebuild the same oscillators/effects but with envelopes short enough
// to articulate Prelude's steady stream of 16th notes, and swap the two
// noise-only presets (coldDust, cathedralDust) for a pitched source run
// through their original effect chain so they can actually play a melody.
export interface DustVoice extends PreludeVoice {
  dispose(): void;
}

// ── Dust Pad ─────────────────────────────────────────────────────────────
export function createDustPadVoice(): DustVoice {
  const reverb = new Tone.Reverb({ decay: 3, preDelay: 0.1, wet: 0.5 }).toDestination();
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square8" as OscillatorType },
    envelope: { attack: 0.25, decay: 0.6, sustain: 0.5, release: 0.3 },
    volume: -20,
  }).connect(reverb);
  const noise = new Tone.Noise({ type: "pink", volume: -36 }).connect(reverb);
  noise.start();

  return {
    trigger: (note, time, velocity) => {
      pad.triggerAttackRelease(note, "16n", time, velocity);
    },
    dispose: () => {
      try { noise.stop(); } catch { /* not running */ }
      pad.dispose(); noise.dispose(); reverb.dispose();
    },
  };
}

// ── Warm Dust ────────────────────────────────────────────────────────────
export function createWarmDustVoice(): DustVoice {
  const reverb = new Tone.Reverb({ decay: 3, preDelay: 0.1, wet: 0.5 }).toDestination();
  const distortion = new Tone.Distortion({ distortion: 0.2, wet: 0.5 }).connect(reverb);
  const filter = new Tone.Filter({ frequency: 700, type: "lowpass" }).connect(distortion);
  const fm = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 5,
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.2, release: 0.3 },
    volume: -12,
  }).connect(filter);

  return {
    trigger: (note, time, velocity) => {
      fm.triggerAttackRelease(note, "16n", time, velocity);
    },
    dispose: () => { fm.dispose(); filter.dispose(); distortion.dispose(); reverb.dispose(); },
  };
}

// ── Cold Dust ────────────────────────────────────────────────────────────
// Original preset is an unpitched NoiseSynth; a plain square wave through
// the same bitcrusher + chorus chain keeps the "crushed digital" character
// while actually being able to play a note.
export function createColdDustVoice(): DustVoice {
  const reverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).toDestination();
  const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.6 }).connect(reverb);
  chorus.start();
  const crusher = new Tone.BitCrusher(4).connect(chorus);
  const synth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.15 },
    volume: -16,
  }).connect(crusher);

  return {
    trigger: (note, time, velocity) => {
      synth.triggerAttackRelease(note, "32n", time, velocity);
    },
    dispose: () => { synth.dispose(); crusher.dispose(); chorus.stop(); chorus.dispose(); reverb.dispose(); },
  };
}

// ── Floating Dust ────────────────────────────────────────────────────────
export function createFloatingDustVoice(): DustVoice {
  const reverb = new Tone.Reverb({ decay: 3, wet: 0.4 }).toDestination();
  const feedbackDelay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.35, wet: 0.4 }).connect(reverb);
  const panner = new Tone.Panner().connect(feedbackDelay);
  const lfo = new Tone.LFO({ frequency: "4n", min: -1, max: 1 }).start();
  lfo.connect(panner.pan);
  const grains = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    detune: 20,
    envelope: { attack: 0.1, decay: 0.3, sustain: 0.3, release: 1.2 },
    volume: -14,
  }).connect(panner);

  return {
    trigger: (note, time, velocity) => {
      grains.triggerAttackRelease(note, "8n", time, velocity);
    },
    dispose: () => { grains.dispose(); lfo.stop(); lfo.dispose(); panner.dispose(); feedbackDelay.dispose(); reverb.dispose(); },
  };
}

// ── Cathedral Dust ───────────────────────────────────────────────────────
// Original preset is unpitched brown noise; a soft sine pad through the
// same huge reverb + sweeping filter LFO keeps the "swirling in a vast
// space" feel while making the melody audible.
export function createCathedralDustVoice(): DustVoice {
  const reverb = new Tone.Reverb({ decay: 3, preDelay: 0.1, wet: 0.5 }).toDestination();
  const filter = new Tone.Filter({ frequency: 1000, type: "lowpass", rolloff: -24 }).connect(reverb);
  const filterLfo = new Tone.LFO({ frequency: "8n", min: 500, max: 3000 }).start();
  filterLfo.connect(filter.frequency);
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.4, decay: 0.8, sustain: 0.4, release: 0.3 },
    volume: -16,
  }).connect(filter);

  return {
    trigger: (note, time, velocity) => {
      pad.triggerAttackRelease(note, "16n", time, velocity);
    },
    dispose: () => { pad.dispose(); filterLfo.stop(); filterLfo.dispose(); filter.dispose(); reverb.dispose(); },
  };
}

export function createDustVoice(preset: DustPreset): DustVoice {
  switch (preset) {
    case "dustPad":       return createDustPadVoice();
    case "warmDust":      return createWarmDustVoice();
    case "coldDust":      return createColdDustVoice();
    case "floatingDust":  return createFloatingDustVoice();
    case "cathedralDust": return createCathedralDustVoice();
  }
}
