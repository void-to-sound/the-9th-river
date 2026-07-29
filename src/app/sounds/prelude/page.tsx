"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { Prelude } from "@/sounds/prelude";

export default function PreludePage() {
  const ref        = useRef<Prelude | null>(null);
  const [playing, setPlaying]   = useState(false);
  const [measure, setMeasure]   = useState<number | null>(null);

  const init = async () => {
    if (ref.current) return;
    const { Prelude } = await import("@/sounds/prelude");
    ref.current = new Prelude();
    ref.current.onMeasure = (i) => setMeasure(i);
  };

  const handleToggle = async () => {
    await Tone.start();
    await init();
    if (playing) {
      ref.current?.stop();
      setPlaying(false);
      setMeasure(null);
    } else {
      ref.current?.start(72);
      setPlaying(true);
    }
  };

  useEffect(() => {
    return () => ref.current?.dispose();
  }, []);

  const measures = ref.current?.measures ?? [];

  return (
    <main className="flex flex-col items-center justify-center w-screen h-screen gap-10 bg-stone-950 text-stone-300 font-mono">
      <p className="text-xs tracking-widest text-stone-500">prelude · BWV 846 · mm. 1–8</p>

      {/* Measure indicators */}
      <div className="flex gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={`w-7 h-7 flex items-center justify-center rounded text-xs border transition-colors duration-100 ${
              playing && measure === i
                ? "border-stone-300 text-stone-200 bg-stone-800"
                : "border-stone-800 text-stone-700"
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Harmony notes of current measure */}
      <div className="h-5 flex gap-2">
        {playing && measure !== null && measures[measure]?.harmony.map((note, i) => (
          <span key={i} className="text-xs text-stone-500">{note}</span>
        ))}
      </div>

      {/* Play / Stop */}
      <button
        onClick={handleToggle}
        className={`px-10 py-4 border rounded transition-colors text-sm ${
          playing
            ? "border-stone-400 bg-stone-900 text-stone-200"
            : "border-stone-700 hover:bg-stone-900 text-stone-400"
        }`}
      >
        {playing ? "■ stop" : "▶ play"}
      </button>
    </main>
  );
}
