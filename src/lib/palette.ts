// Maps MIDI note number to an HSL hue (0-360)
export function noteToHue(note: number): number {
  return (note % 12) * 30; // 12 chromatic pitches spread over 360°
}

// Maps velocity (0-127) to lightness (40-80%)
export function velocityToLightness(velocity: number): number {
  return 40 + (velocity / 127) * 40;
}
