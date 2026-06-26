"use client";

import { useEffect, useState } from "react";
import type p5 from "p5";
import P5Canvas from "@/components/P5Canvas";
import { loadNoteEvents, type NoteEvent } from "@/lib/noteEvents";
import { createSketch } from "@/sketches/001-piano-dots/sketch";

export default function Home() {
  const [sketch, setSketch] = useState<((p: p5) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNoteEvents("/json/piano-001.json")
      .then((events: NoteEvent[]) => {
        // Wrap in a function so useState doesn't call it as an updater
        setSketch(() => createSketch(events));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return (
      <main className="flex items-center justify-center w-screen h-screen bg-black text-red-400 font-mono text-sm">
        {error}
      </main>
    );
  }

  if (!sketch) {
    return (
      <main className="flex items-center justify-center w-screen h-screen bg-[#0a0a14] text-white/30 font-mono text-sm">
        loading…
      </main>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <P5Canvas sketch={sketch} />
    </main>
  );
}
