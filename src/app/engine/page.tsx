"use client";

import { useMemo } from "react";
import P5Canvas from "@/components/P5Canvas";
import { createEngineSketch } from "@/sketches/002-particle-engine/sketch";

export default function EnginePage() {
  const sketch = useMemo(() => createEngineSketch(), []);
  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <P5Canvas sketch={sketch} />
    </main>
  );
}
