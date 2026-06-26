export interface NoteEvent {
  time: number;     // seconds
  note: number;     // MIDI note number (0-127)
  velocity: number; // 0-127
  duration: number; // seconds
}

export async function loadNoteEvents(path: string): Promise<NoteEvent[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load note events from ${path}`);
  return res.json();
}
