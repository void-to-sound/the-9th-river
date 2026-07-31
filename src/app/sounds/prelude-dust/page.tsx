"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { Prelude } from "@/sounds/prelude";
import type { DustPreset } from "@/sounds/dust-palette";
import type { DustVoice } from "@/sounds/prelude-voices";

const PRESETS: { key: DustPreset; label: string; sub: string }[] = [
  { key: "dustPad",       label: "Dust Pad",       sub: "square8 pad · pink noise · reverb 4s" },
  { key: "warmDust",      label: "Warm Dust",      sub: "FM lead · lowpass · distortion" },
  { key: "coldDust",      label: "Cold Dust",      sub: "square · bitcrusher 4bit · chorus" },
  { key: "floatingDust",  label: "Floating Dust",  sub: "sine grains · panning LFO · delay" },
  { key: "cathedralDust", label: "Cathedral Dust", sub: "sine pad · filter LFO · reverb 10s" },
];

export default function PreludeDustPage() {
  const preludeRef = useRef<Prelude | null>(null);
  const voiceRef   = useRef<DustVoice | null>(null);
  const [active, setActive]   = useState<DustPreset | null>(null);
  const [measure, setMeasure] = useState<number | null>(null);

  const teardown = () => {
    preludeRef.current?.stop();
    preludeRef.current?.dispose();
    preludeRef.current = null;
    voiceRef.current?.dispose();
    voiceRef.current = null;
  };

  const handlePlay = async (key: DustPreset) => {
    await Tone.start();

    if (active === key) {
      teardown();
      setActive(null);
      setMeasure(null);
      return;
    }

    teardown();

    const [{ Prelude }, { createDustVoice }] = await Promise.all([
      import("@/sounds/prelude"),
      import("@/sounds/prelude-voices"),
    ]);

    const voice = createDustVoice(key);
    voiceRef.current = voice;
    preludeRef.current = new Prelude(voice);
    preludeRef.current.onMeasure = (i) => setMeasure(i);
    preludeRef.current.start(72);
    setActive(key);
  };

  useEffect(() => {
    return () => teardown();
  }, []);

  return (
    <main className="flex flex-col items-center justify-center w-screen min-h-screen py-20 gap-3 bg-stone-950 text-stone-300 font-mono">
      <p className="text-xs tracking-widest text-stone-500 mb-2">prelude · BWV 846 · dust voices</p>

      <div className="flex gap-2 mb-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={`w-6 h-6 flex items-center justify-center rounded text-xs border transition-colors duration-100 ${
              active && measure === i
                ? "border-stone-300 text-stone-200 bg-stone-800"
                : "border-stone-800 text-stone-700"
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {PRESETS.map(({ key, label, sub }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => handlePlay(key)}
            className={`w-96 text-left px-6 py-5 border rounded transition-colors ${
              isActive
                ? "border-amber-500 bg-stone-900"
                : "border-stone-800 hover:border-stone-600 hover:bg-stone-900"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm ${isActive ? "text-amber-400" : "text-stone-200"}`}>
                {label}
              </span>
              <span className="text-xs text-stone-600">
                {isActive ? "■ stop" : "▶"}
              </span>
            </div>
            <p className="text-xs text-stone-500">{sub}</p>
          </button>
        );
      })}
    </main>
  );
}
