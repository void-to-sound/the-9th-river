import type p5 from "p5";

// Returns a flow direction vector from Perlin noise at the given point and time.
// The returned vector has magnitude `strength`.
export function flowVector(
  p: p5,
  x: number,
  y: number,
  t: number,
  scale: number,
  strength: number
): { vx: number; vy: number } {
  const angle = p.noise(x * scale, y * scale, t * scale) * p.TWO_PI * 2;
  return {
    vx: Math.cos(angle) * strength,
    vy: Math.sin(angle) * strength,
  };
}
