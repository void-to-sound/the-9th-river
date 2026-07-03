// Requires: ffmpeg installed on your system (brew install ffmpeg)
// Usage: npm run convert -- public/audio/file-name.m4a

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Register CPU backend before BasicPitch loads TensorFlow
require('@tensorflow/tfjs-backend-cpu');
const tf = require('@tensorflow/tfjs');

const {
  BasicPitch,
  outputToNotesPoly,
  noteFramesToTime,
  addPitchBendsToNoteEvents,
} = require('@spotify/basic-pitch');

const { Midi } = require('@tonejs/midi');

const MODEL_DIR = path.resolve(__dirname, '../node_modules/@spotify/basic-pitch/model');
const ROOT = path.resolve(__dirname, '..');

// Load the TF.js graph model from disk, bypassing fetch (which can't handle file:// in Node.js)
async function loadModelFromDisk() {
  const modelJson = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'model.json'), 'utf8'));
  const weightPaths = modelJson.weightsManifest[0].paths;
  const weightSpecs = modelJson.weightsManifest[0].weights;

  const shards = weightPaths.map((p) => fs.readFileSync(path.join(MODEL_DIR, p)));
  const totalBytes = shards.reduce((sum, b) => sum + b.byteLength, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const shard of shards) {
    merged.set(new Uint8Array(shard.buffer, shard.byteOffset, shard.byteLength), offset);
    offset += shard.byteLength;
  }

  return tf.loadGraphModel(
    tf.io.fromMemory(modelJson.modelTopology, weightSpecs, merged.buffer)
  );
}

async function convert(inputFile) {
  const absInput = path.resolve(process.cwd(), inputFile);

  if (!fs.existsSync(absInput)) {
    throw new Error(`File not found: ${absInput}`);
  }

  const baseName = path.basename(absInput, path.extname(absInput));
  const tmpWav = path.join(os.tmpdir(), `${baseName}-${Date.now()}.wav`);

  // Step 1: Decode .m4a → WAV at 22050 Hz mono (required by Basic Pitch)
  console.log(`[1/4] Decoding audio → WAV...`);
  execSync(`ffmpeg -y -i "${absInput}" -ar 22050 -ac 1 "${tmpWav}"`, {
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  // Step 2: Load WAV into an AudioBuffer via node-web-audio-api
  console.log(`[2/4] Loading audio buffer...`);
  const { AudioContext } = await import('node-web-audio-api');
  const audioCtx = new AudioContext({ sampleRate: 22050 });

  const wavFile = fs.readFileSync(tmpWav);
  const arrayBuffer = wavFile.buffer.slice(
    wavFile.byteOffset,
    wavFile.byteOffset + wavFile.byteLength
  );

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();
  fs.unlinkSync(tmpWav);

  // Step 3: Run Basic Pitch (audio → MIDI note events)
  console.log(`[3/4] Running pitch detection...`);
  await tf.setBackend('cpu');
  await tf.ready();

  const model = await loadModelFromDisk();
  const basicPitch = new BasicPitch(Promise.resolve(model));
  const frames = [];
  const onsets = [];
  const contours = [];

  await basicPitch.evaluateModel(
    audioBuffer,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p) => process.stdout.write(`\r    ${Math.round(p * 100)}% complete`)
  );
  process.stdout.write('\n');

  const notes = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)
    )
  );
  console.log(`    → ${notes.length} notes detected`);

  // Step 4: Build MIDI + JSON and save
  console.log(`[4/4] Writing output files...`);
  const midi = new Midi();
  const track = midi.addTrack();

  for (const note of notes) {
    track.addNote({
      midi: note.pitchMidi,
      time: note.startTimeSeconds,
      duration: note.durationSeconds,
      velocity: note.amplitude,
    });

    if (note.pitchBends?.length) {
      const stepDuration = note.durationSeconds / note.pitchBends.length;
      note.pitchBends.forEach((bend, i) => {
        track.addPitchBend({
          time: note.startTimeSeconds + i * stepDuration,
          value: bend,
        });
      });
    }
  }

  const midiOut = path.join(ROOT, 'public/midi', `${baseName}.mid`);
  const jsonOut = path.join(ROOT, 'public/json', `${baseName}.json`);

  fs.writeFileSync(midiOut, Buffer.from(midi.toArray()));

  const cleanNotes = midi.tracks
    .flatMap((track) =>
      track.notes.map((note) => ({
        time: note.time,
        note: note.name,
        duration: note.duration,
        velocity: note.velocity,
      }))
    )
    .sort((a, b) => a.time - b.time);

  fs.writeFileSync(jsonOut, JSON.stringify(cleanNotes, null, 2));

  console.log(`\nDone!`);
  console.log(`  MIDI → ${path.relative(ROOT, midiOut)}`);
  console.log(`  JSON → ${path.relative(ROOT, jsonOut)}`);
}

const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: npm run convert -- <path-to-audio-file>');
  console.error('Example: npm run convert -- public/audio/001-piano.m4a');
  process.exit(1);
}

convert(inputFile).catch((err) => {
  console.error('\nError:', err.message || err);
  process.exit(1);
});
