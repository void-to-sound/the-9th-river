"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// HTMLMediaElement.captureStream() is real in every evergreen browser but
// still isn't part of TypeScript's DOM lib — this just names the shape we
// actually call.
interface CapturableVideoElement extends HTMLVideoElement {
  captureStream(frameRate?: number): MediaStream;
}

const AV_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

// Audio-only recording exists because re-encoding the video track through
// MediaRecorder's realtime software encoder never matches the source's
// quality (camera hardware encoding, non-realtime bitrate budgeting) even
// at a high bitrate — but this scene's video is just an unmodified looping
// source file anyway, so there's nothing to gain from re-encoding it at
// all. Record audio only here, then mux it with the pristine source video
// via ffmpeg outside the browser.
const AUDIO_ONLY_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function pickMimeType(candidates: string[]): string {
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

// Without an explicit bitrate, browsers default to something conservative
// (Chrome: ~2.5Mbps for video) regardless of the source's actual resolution
// — nowhere near what a phone-shot source video (often 15-50Mbps) looks
// like, so the recording reads as visibly softer/blockier than the source
// even though captureStream() preserves full resolution. These are high
// enough that quality is limited by the source, not the encoder.
const VIDEO_BITS_PER_SECOND = 16_000_000;
const AUDIO_BITS_PER_SECOND = 320_000;

// One shared audio bus a scene's Tone.js graph and/or raw Web Audio nodes
// can `.connect()` into — in addition to whatever they already connect to
// for normal playback — so the recorder captures the exact mixed sound the
// user hears (music + field recording, etc.) rather than the whole system's
// audio output. `.connect()` fans out, so wiring a node into this bus never
// disturbs its existing connection.
export function createRecordingBus(ctx: AudioContext): MediaStreamAudioDestinationNode {
  return ctx.createMediaStreamDestination();
}

interface UseSceneRecorderResult {
  isRecording: boolean;
  elapsed: number;
  downloadUrl: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// Records a scene's <video> element (just its own pixels — not the browser
// tab or screen, so no UI/cursor ever ends up in the file) combined with
// whatever's been routed into `audioBus` (see createRecordingBus) into a
// downloadable .webm. Reusable across any scene page built the same way:
// a <video>, a recording bus fed by that scene's audio graph, and this hook.
// Pass `audioOnly: true` to skip the video track entirely (see
// AUDIO_ONLY_MIME_CANDIDATES above for why) — `videoRef` is ignored in that mode.
export function useSceneRecorder(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  audioBusRef: React.RefObject<MediaStreamAudioDestinationNode | null>,
  options?: { audioOnly?: boolean },
): UseSceneRecorderResult {
  const audioOnly = options?.audioOnly ?? false;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const start = useCallback(() => {
    const video = videoRef.current;
    const audioBus = audioBusRef.current;
    if (!audioBus) return;
    if (!audioOnly && !video) return;

    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownloadUrl(null);

    const combined = audioOnly
      ? new MediaStream(audioBus.stream.getAudioTracks())
      : new MediaStream([
          ...(video as CapturableVideoElement).captureStream().getVideoTracks(),
          ...audioBus.stream.getAudioTracks(),
        ]);

    const mimeType = pickMimeType(audioOnly ? AUDIO_ONLY_MIME_CANDIDATES : AV_MIME_CANDIDATES);
    const recorderOptions: MediaRecorderOptions = {
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      ...(audioOnly ? {} : { videoBitsPerSecond: VIDEO_BITS_PER_SECOND }),
      ...(mimeType ? { mimeType } : {}),
    };
    const recorder = new MediaRecorder(combined, recorderOptions);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || (audioOnly ? "audio/webm" : "video/webm") });
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
    };

    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed((prev) => prev + 0.1), 100);
  }, [videoRef, audioBusRef, audioOnly]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownloadUrl(null);
    setElapsed(0);
  }, []);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    };
  }, []);

  return { isRecording, elapsed, downloadUrl, start, stop, reset };
}
