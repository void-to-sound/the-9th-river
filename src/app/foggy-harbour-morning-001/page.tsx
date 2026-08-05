"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { GenerativePrelude } from "@/sounds/generative-prelude";
import type { DustVoice, FloatingDustVoice } from "@/sounds/prelude-voices";
import type { PreludeTriggerOptions } from "@/sounds/prelude";
import { createRecordingBus } from "@/lib/sceneRecorder";
import RecordButton from "@/components/RecordButton";

type VoiceKey = "warmDust" | "floatingDust" | "warmFloatingDust";

const VOICES: { key: VoiceKey; label: string; sub: string }[] = [
  { key: "warmDust",         label: "Warm Dust",         sub: "FM lead · lowpass 700Hz · distortion" },
  { key: "floatingDust",     label: "Floating Dust",     sub: "sine grains · panning LFO · delay" },
  { key: "warmFloatingDust", label: "Warm Floating Dust", sub: "Floating Dust를 살짝 warm 쪽으로" },
];

// Each voice's own authored high-shelf default (only Floating Dust variants have one).
const HIGH_SHELF_DEFAULTS: Partial<Record<VoiceKey, number>> = {
  floatingDust: -5,
  warmFloatingDust: -9,
};

const SILENCE_SECONDS      = 0;  // field recording doesn't start playing until this point (none, for now)
const FADE_IN_SECONDS      = 5;  // 0s -> 5s: ease-in up to FADE_IN_PEAK
const POST_FADE_WAIT_SECONDS = 5; // 5s -> 10s: held flat at FIELD_TARGET_VOLUME (after the rewind) before the prelude starts
const LEAD_SECONDS         = SILENCE_SECONDS + FADE_IN_SECONDS + POST_FADE_WAIT_SECONDS; // 10s: prelude starts here
const FADE_IN_PEAK         = 0.15; // peak the ease-in curve swells up to by FADE_IN_SECONDS — held here for good, no drop after
const FIELD_TARGET_VOLUME  = FADE_IN_PEAK; // same as FADE_IN_PEAK — the rewind only resets playback position, not volume
const FADE_TICK_MS = 50; // how often fades are stepped
// Once the outro's final G4 rings out, the piece waits OUTRO_CODA_SILENCE_MEASURES
// (3 measures = 12s at bpm 60) in silence before formally stopping. The field
// recording's fade-out is timed to fill exactly that same silent stretch.
const FIELD_FADE_OUT_DURATION_MS = 12000;

const ORBIT_MEASURES_PER_CYCLE = 8; // Orbit rule's harmony cycle length
const MUSIC_CYCLES = 2;             // play through measures 1-8 this many times (both cycles play in full — the ending is now handled by the outro below, not a silent last measure)
const MUSIC_SILENT_TAIL_MEASURES = 0;
const VIDEO_STOP_AFTER_FIELD_FADE_SECONDS = 7; // once the field recording reaches 0, wait this long before stopping the video
const FIELD_HIGHPASS_HZ = 100; // shaves off low-frequency wind/handling rumble in the field recording

// Hand-composed ending, played after the 2 normal cycles: two more
// Orbit-generated measures (9th over OUTRO_HARMONY_9, 10th over
// OUTRO_HARMONY_10 — the same 5 tones the old fixed measure 10 used), then
// two fixed measures — the 11th is a full 16-note line (two 8-note halves,
// no rest), the 12th is a single G4 struck at the top and left to ring
// through the rest of its own measure — then a silent wait before the piece
// stops. No separate coda note: measure 12's own G4 is the ending.
const OUTRO_HARMONY_9 = ["A3", "C4", "E4", "G4", "C5"];
const OUTRO_HARMONY_10 = ["D3", "A3", "D4", "F#4", "C5"];
const OUTRO_GENERATED_HARMONIES = [OUTRO_HARMONY_9, OUTRO_HARMONY_10];
const OUTRO_MEASURE_11: (string | null)[] = [
  "B3", "D4", "G4", "B4", "A4", "C5", "B4", "E5",
  "B3", "D4", "G4", "B4", "A4", "C5", "B4", "A4",
];
const OUTRO_MEASURE_12: (string | null)[] = [
  "G4", null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
];
const OUTRO_FIXED_MEASURES: (string | null)[][] = [OUTRO_MEASURE_11, OUTRO_MEASURE_12];
const OUTRO_CODA_SILENCE_MEASURES = 3; // silent wait after measure 12 for its G4 to fully ring out before stopping
// Measure 12's G4: barely held at all (duration is just long enough for the
// attack to land) then immediately released over a full 3 seconds — so the
// note's own envelope IS the fade, a smooth decay from full to nothing
// across those 3s. Reverb and delay are both left at the voice's own normal
// level (no override) — G4 goes through the exact same effects chain as
// every other note now.
const OUTRO_FINAL_TRIGGER_OPTIONS: PreludeTriggerOptions = {
  duration: "32n",
  release: 3,
};

// Exponential ease curves, matched pair: ease-in (slow start, fast finish)
// for rising, ease-out (fast start, slow finish) for falling — both read as
// smooth/logarithmic to the ear rather than the abrupt-then-flat feel of a
// linear ramp.
function easeInValue(progress: number, from: number, to: number, steepness = 5): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = (Math.exp(steepness * p) - 1) / (Math.exp(steepness) - 1);
  return from + (to - from) * eased;
}

function easeOutValue(progress: number, from: number, to: number, steepness = 5): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = (1 - Math.exp(-steepness * p)) / (1 - Math.exp(-steepness));
  return from + (to - from) * eased;
}

// Runs an eased fade over `durationMs`, ticking every FADE_TICK_MS; calls
// onDone once it reaches the target so fades can be chained together.
function runVolumeFade(
  ease: (progress: number, from: number, to: number) => number,
  from: number,
  to: number,
  durationMs: number,
  onTick: (vol: number) => void,
  onDone: () => void,
): ReturnType<typeof setInterval> {
  const totalTicks = Math.max(1, Math.round(durationMs / FADE_TICK_MS));
  let tick = 0;
  const id = setInterval(() => {
    tick++;
    const progress = tick / totalTicks;
    onTick(ease(progress, from, to));
    if (progress >= 1) {
      clearInterval(id);
      onDone();
    }
  }, FADE_TICK_MS);
  return id;
}

function supportsHighShelf(voice: DustVoice): voice is FloatingDustVoice {
  return "setHighShelfGain" in voice;
}

export default function VideoOrbitPage() {
  const preludeRef    = useRef<GenerativePrelude | null>(null);
  const voiceRef       = useRef<DustVoice | null>(null);
  const videoRef       = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef     = useRef<HTMLAudioElement | null>(null);
  const startTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioGraphRef = useRef<{ source: MediaElementAudioSourceNode; filters: BiquadFilterNode[] } | null>(null);
  const audioBusRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  // A ref (not just state) so async fade callbacks started earlier always
  // read the live value instead of the mute state at the moment they were scheduled.
  const fieldRecMutedRef = useRef(false);
  const [active, setActive] = useState<VoiceKey | null>(null);
  const [measure, setMeasure] = useState<number | null>(null);
  const [highShelfGain, setHighShelfGain] = useState(-5);
  const [bgVolume, setBgVolume] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0); // dB, applied to Tone.Destination — affects only the generative music, not the field recording (which bypasses Tone.Destination)
  const [elapsed, setElapsed] = useState(0);
  const [highpassHz, setHighpassHz] = useState(FIELD_HIGHPASS_HZ);
  const [filterBypassed, setFilterBypassed] = useState(false);
  const [fieldRecMuted, setFieldRecMuted] = useState(false);

  const teardown = () => {
    if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (fadeStartTimerRef.current) { clearTimeout(fadeStartTimerRef.current); fadeStartTimerRef.current = null; }
    if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
    if (videoStopTimerRef.current) { clearTimeout(videoStopTimerRef.current); videoStopTimerRef.current = null; }
    preludeRef.current?.stop();
    preludeRef.current?.dispose();
    preludeRef.current = null;
    voiceRef.current?.dispose();
    voiceRef.current = null;
    bgAudioRef.current?.pause();
    videoRef.current?.pause();
  };

  const handleVideoEnded = () => {
    teardown();
    setActive(null);
    setMeasure(null);
    setElapsed(0);
  };

  // `previewEnding`, when true, skips straight to (roughly) the outro
  // instead of the full 2-cycle piece — field recording jumps straight to
  // FIELD_TARGET_VOLUME (no 10s fade-in / 5s wait) and only 1 main measure
  // plays before the outro starts, instead of ORBIT_MEASURES_PER_CYCLE *
  // MUSIC_CYCLES. Lets the ending be checked in ~10s instead of ~2 minutes.
  const handleSelectVoice = async (key: VoiceKey, previewEnding = false) => {
    await Tone.start();

    if (!previewEnding && active === key) {
      teardown();
      setActive(null);
      setMeasure(null);
      setElapsed(0);
      return;
    }

    teardown();

    const video = videoRef.current;
    const bgAudio = bgAudioRef.current;

    if (video) { video.currentTime = 0; video.play(); }
    setBgVolume(0);

    const applyBgVolume = (vol: number) => {
      const effective = fieldRecMutedRef.current ? 0 : vol;
      setBgVolume(effective);
      if (bgAudioRef.current) {
        bgAudioRef.current.volume = effective;
      }
    };

    if (previewEnding) {
      if (bgAudio) {
        bgAudio.currentTime = 0;
        bgAudio.play();
      }
      applyBgVolume(FIELD_TARGET_VOLUME);
    } else {
      // Field recording starts right away, eases up to FADE_IN_PEAK over
      // FADE_IN_SECONDS (exponential ease-in), then — right as that swell
      // finishes — jumps back to its own 0:00 and immediately settles at
      // the much quieter, steady FIELD_TARGET_VOLUME for the rest of the
      // POST_FADE_WAIT_SECONDS wait before the prelude starts.
      fadeStartTimerRef.current = setTimeout(() => {
        if (bgAudio) {
          bgAudio.currentTime = 0;
          bgAudio.volume = 0;
          bgAudio.play();
        }

        fadeIntervalRef.current = runVolumeFade(
          easeInValue, 0, FADE_IN_PEAK, FADE_IN_SECONDS * 1000,
          applyBgVolume,
          () => {
            fadeIntervalRef.current = null;
            if (bgAudioRef.current) {
              bgAudioRef.current.currentTime = 0;
            }
            applyBgVolume(FIELD_TARGET_VOLUME);
          },
        );
      }, SILENCE_SECONDS * 1000);
    }

    setElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 0.1);
    }, 100);

    const [{ GenerativePrelude }, voices] = await Promise.all([
      import("@/sounds/generative-prelude"),
      import("@/sounds/prelude-voices"),
    ]);

    // Generative prelude starts at LEAD_SECONDS (no fade-in — it just comes
    // in directly at the chosen volume), plays through measures 1-8
    // MUSIC_CYCLES times, then plays the hand-composed outro (one more
    // generated measure, one fixed measure, then a coda note left to ring
    // out over a long silence) before formally stopping. The field recording
    // eases up to FIELD_TARGET_VOLUME at the same moment the music starts,
    // swelling slightly to meet it, and keeps going until the outro's silent
    // wait begins (see onOutroSilenceStart below).
    const leadMs = previewEnding ? 0 : LEAD_SECONDS * 1000;
    const maxPlays = previewEnding ? 1 : ORBIT_MEASURES_PER_CYCLE * MUSIC_CYCLES;
    startTimerRef.current = setTimeout(() => {
      const voice =
        key === "warmDust" ? voices.createWarmDustVoice() :
        key === "floatingDust" ? voices.createFloatingDustVoice() :
        voices.createWarmFloatingDustVoice();

      const shelfDefault = HIGH_SHELF_DEFAULTS[key];
      if (shelfDefault !== undefined) {
        setHighShelfGain(shelfDefault);
      }

      voiceRef.current = voice;
      preludeRef.current = new GenerativePrelude(voice, "orbit");
      preludeRef.current.onMeasure = (i) => setMeasure(i);
      // The outro's final G4 has just been triggered and the piece is now in
      // its silent wait (OUTRO_CODA_SILENCE_MEASURES measures) before it
      // formally stops — start the field recording's fade-out right here so
      // it runs 0.15 -> 0 over exactly that same silent stretch, ending right
      // as the G4's reverb tail (and the silence) finishes.
      preludeRef.current.onOutroSilenceStart = () => {
        const startVol = bgAudioRef.current?.volume ?? FIELD_TARGET_VOLUME;
        if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); }
        fadeIntervalRef.current = runVolumeFade(
          easeOutValue, startVol, 0, FIELD_FADE_OUT_DURATION_MS,
          applyBgVolume,
          () => {
            fadeIntervalRef.current = null;
            bgAudioRef.current?.pause();
            videoStopTimerRef.current = setTimeout(() => {
              videoRef.current?.pause();
            }, VIDEO_STOP_AFTER_FIELD_FADE_SECONDS * 1000);
          },
        );
      };
      preludeRef.current.start(60, maxPlays, MUSIC_SILENT_TAIL_MEASURES, {
        generatedHarmonies: OUTRO_GENERATED_HARMONIES,
        fixedMeasures: OUTRO_FIXED_MEASURES,
        codaSilenceMeasures: OUTRO_CODA_SILENCE_MEASURES,
        finalMeasureTriggerOptions: OUTRO_FINAL_TRIGGER_OPTIONS,
      });
      // No fade-in — the music just starts at the chosen level right away.
      // The field recording is already sitting flat at FIELD_TARGET_VOLUME
      // by now (set at the rewind, or immediately in previewEnding mode).
      Tone.Destination.volume.cancelScheduledValues(Tone.now());
      Tone.Destination.volume.value = musicVolume;
    }, leadMs);

    setActive(key);
  };

  const handleHighShelfChange = (db: number) => {
    setHighShelfGain(db);
    const voice = voiceRef.current;
    if (voice && supportsHighShelf(voice)) {
      voice.setHighShelfGain(db);
    }
  };

  const handleBgVolumeChange = (vol: number) => {
    setBgVolume(vol);
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = vol;
    }
  };

  const handleMusicVolumeChange = (db: number) => {
    setMusicVolume(db);
    if (preludeRef.current) {
      Tone.Destination.volume.value = db;
    }
  };

  const handleHighpassChange = (hz: number) => {
    setHighpassHz(hz);
    if (audioGraphRef.current) {
      for (const f of audioGraphRef.current.filters) {
        f.frequency.value = hz;
      }
    }
  };

  // True bypass — rewires the graph so the field recording's raw signal
  // (not just a very-low highpass frequency) reaches the speakers/recording
  // bus, for an exact A/B against the filtered version.
  const handleToggleFilterBypass = (bypass: boolean) => {
    setFilterBypassed(bypass);
    if (!audioGraphRef.current || !audioBusRef.current) return;

    const ctx = Tone.getContext().rawContext as AudioContext;
    const [filterA, filterB] = audioGraphRef.current.filters;

    if (bypass) {
      audioGraphRef.current.source.disconnect(filterA);
      filterB.disconnect(ctx.destination);
      filterB.disconnect(audioBusRef.current);
      audioGraphRef.current.source.connect(ctx.destination);
      audioGraphRef.current.source.connect(audioBusRef.current);
    } else {
      audioGraphRef.current.source.disconnect(ctx.destination);
      audioGraphRef.current.source.disconnect(audioBusRef.current);
      audioGraphRef.current.source.connect(filterA);
      filterB.connect(ctx.destination);
      filterB.connect(audioBusRef.current);
    }
  };

  // Silences the field recording without touching any of its fade/rewind
  // timers — they keep running on schedule (e.g. the ending's fade-out
  // still anchors the video-stop timing), just inaudibly. Lets the music be
  // A/B'd on its own without restructuring the ending timeline.
  const handleToggleFieldRecMuted = (muted: boolean) => {
    fieldRecMutedRef.current = muted;
    setFieldRecMuted(muted);
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = muted ? 0 : bgVolume;
    }
  };

  useEffect(() => {
    return () => teardown();
  }, []);

  // Route the field recording's plain <audio> output through two cascaded
  // highpass filters (-24dB/octave combined, instead of one biquad's gentle
  // -12dB/octave) to actually knock down wind/handling rumble — a single
  // stage barely touches anything just below its cutoff, and broadband air
  // noise often has real energy up into the 100-300Hz range, not just deep
  // bass. A native <audio> element has no filtering of its own, only volume.
  // A media element can only ever get ONE MediaElementAudioSourceNode for
  // its whole lifetime, so this guards against re-creating it (e.g. React
  // StrictMode's double-invoke).
  useEffect(() => {
    const audioEl = bgAudioRef.current;
    if (!audioEl || audioGraphRef.current) return;

    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const source = ctx.createMediaElementSource(audioEl);
      const filterA = ctx.createBiquadFilter();
      const filterB = ctx.createBiquadFilter();
      for (const f of [filterA, filterB]) {
        f.type = "highpass";
        f.frequency.value = FIELD_HIGHPASS_HZ;
      }
      source.connect(filterA);
      filterA.connect(filterB);
      filterB.connect(ctx.destination);
      audioGraphRef.current = { source, filters: [filterA, filterB] };

      // A recording bus fed by both the field recording (post-highpass) and
      // the generative music (Tone.Destination) — see RecordButton below.
      // .connect() fans out, so this doesn't touch either's normal playback path.
      const bus = createRecordingBus(ctx);
      filterB.connect(bus);
      Tone.getDestination().connect(bus);
      audioBusRef.current = bus;
    } catch {
      // Already connected (e.g. a dev-mode double-invoke) — nothing to do.
    }
  }, []);

  const activeSupportsHighShelf = active === "floatingDust" || active === "warmFloatingDust";

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-black">
      {/* Video — full length (1:56), loops continuously */}
      <video
        ref={videoRef}
        src="/video/IMG_6306.MOV"
        muted
        loop
        playsInline
        onEnded={handleVideoEnded}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Field recording — starts right away, swells to FADE_IN_PEAK over
          FADE_IN_SECONDS, then rewinds and settles at FIELD_TARGET_VOLUME.
          Loops so it never cuts out. */}
      <audio ref={bgAudioRef} src="/audio/new-recording-20.m4a" loop className="hidden" />

      {/* Elapsed time since the play button was pressed */}
      {active && (
        <div className="absolute top-6 left-6 font-mono text-sm text-stone-300 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded">
          {elapsed.toFixed(1)}s
        </div>
      )}

      {/* Measure indicator — which of the 8 measures is currently sounding */}
      {active && (
        <div className="absolute top-6 right-6 flex gap-2 font-mono">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className={`w-7 h-7 flex items-center justify-center rounded text-xs border transition-colors duration-100 ${
                measure === i
                  ? "border-stone-100 text-stone-100 bg-stone-800/80"
                  : "border-stone-600 text-stone-500 bg-stone-950/60"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {/* Scratch UI — edge-anchored, to be removed later */}
      <div className="absolute bottom-6 right-6 flex items-end gap-4 font-mono">
        <label className="flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300">
          <span className="text-xs text-stone-500 whitespace-nowrap">field rec</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={bgVolume}
            onChange={(e) => handleBgVolumeChange(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-stone-400 w-12 text-right">{bgVolume.toFixed(2)}</span>
        </label>

        <label className="flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300">
          <span className="text-xs text-stone-500 whitespace-nowrap">현장음 끄기</span>
          <input
            type="checkbox"
            checked={fieldRecMuted}
            onChange={(e) => handleToggleFieldRecMuted(e.target.checked)}
          />
        </label>

        <label className={`flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300 ${filterBypassed ? "opacity-40" : ""}`}>
          <span className="text-xs text-stone-500 whitespace-nowrap">highpass</span>
          <input
            type="range"
            min={20}
            max={300}
            step={5}
            value={highpassHz}
            disabled={filterBypassed}
            onChange={(e) => handleHighpassChange(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-stone-400 w-14 text-right">{highpassHz.toFixed(0)}Hz</span>
        </label>

        <label className="flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300">
          <span className="text-xs text-stone-500 whitespace-nowrap">필터 bypass</span>
          <input
            type="checkbox"
            checked={filterBypassed}
            onChange={(e) => handleToggleFilterBypass(e.target.checked)}
          />
        </label>

        <label className="flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300">
          <span className="text-xs text-stone-500 whitespace-nowrap">music</span>
          <input
            type="range"
            min={-24}
            max={18}
            step={1}
            value={musicVolume}
            onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-stone-400 w-12 text-right">{musicVolume.toFixed(0)}dB</span>
        </label>

        {activeSupportsHighShelf && (
          <label className="flex items-center gap-2 px-3 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300">
            <span className="text-xs text-stone-500 whitespace-nowrap">high shelf</span>
            <input
              type="range"
              min={-12}
              max={0}
              step={0.5}
              value={highShelfGain}
              onChange={(e) => handleHighShelfChange(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="text-xs text-stone-400 w-12 text-right">{highShelfGain.toFixed(1)}dB</span>
          </label>
        )}

        {/* Audio-only — video is an unmodified source file, so it's muxed
            back in via ffmpeg afterward instead of being re-encoded here. */}
        <RecordButton
          videoRef={videoRef}
          audioBusRef={audioBusRef}
          audioOnly
          filename="foggy-harbour-morning-001-audio.webm"
          label="● record audio"
        />

        <div className="flex gap-2">
          {VOICES.map(({ key, label, sub }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => handleSelectVoice(key)}
                title={sub}
                className={`px-4 py-3 border rounded text-sm transition-colors ${
                  isActive
                    ? "border-stone-300 bg-stone-900/80 text-stone-100"
                    : "border-stone-600 bg-stone-950/60 text-stone-300 hover:bg-stone-900/80"
                }`}
              >
                {isActive ? "■ " : "▶ "}{label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => handleSelectVoice(active ?? "warmFloatingDust", true)}
          title="1마디만 재생하고 바로 outro(9~12마디 + 코다)로 건너뜀 — 엔딩만 빠르게 확인용"
          className="px-4 py-3 border border-amber-600 bg-stone-950/60 rounded text-sm text-amber-400 hover:bg-stone-900/80 transition-colors"
        >
          ⏭ 엔딩만 미리듣기
        </button>
      </div>
    </main>
  );
}
