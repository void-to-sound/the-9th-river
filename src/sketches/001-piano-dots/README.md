# 001 — Piano Dots

Particles spawned from MIDI note events, drifting through a Perlin noise flow field.

## How it works

- `piano-001.json` is fetched on load — each entry is a note event with `time`, `note`, `velocity`, `duration`
- At the scheduled frame (time × 60), `PARTICLES_PER_NOTE` particles burst from the note's position
- Position on canvas: X = time, Y = pitch
- Color: hue from pitch class (12 chromatic pitches → 360°), brightness from velocity
- Movement: each frame a flow vector derived from `p.noise(x, y, t)` is applied

## Params to tweak (`config.ts`)

| Key | Default | Effect |
|---|---|---|
| `PARTICLES_PER_NOTE` | 30 | Density of each burst |
| `FLOW_SCALE` | 0.003 | Noise zoom — lower = bigger swirls |
| `FLOW_STRENGTH` | 1.5 | Speed of drift |
| `PARTICLE_LIFESPAN` | 180 | Frames before a particle fades out |
| `BG_ALPHA` | 15 | Trail length — lower = longer trails |
