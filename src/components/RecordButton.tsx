"use client";

import { useSceneRecorder } from "@/lib/sceneRecorder";

interface RecordButtonProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioBusRef: React.RefObject<MediaStreamAudioDestinationNode | null>;
  filename?: string;
  // Skip the video track entirely — for scenes whose visuals are just an
  // unmodified source file, this avoids MediaRecorder's realtime re-encode
  // quality loss; mux the resulting small audio file with the pristine
  // source video via ffmpeg afterward instead.
  audioOnly?: boolean;
  label?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Drop this into any scene page alongside a <video> and a recording bus
// (see src/lib/sceneRecorder.ts) to get record / stop / download for free.
export default function RecordButton({
  videoRef,
  audioBusRef,
  filename = "scene-recording.webm",
  audioOnly = false,
  label = "● record",
}: RecordButtonProps) {
  const { isRecording, elapsed, downloadUrl, start, stop, reset } = useSceneRecorder(videoRef, audioBusRef, { audioOnly });

  if (isRecording) {
    return (
      <button
        onClick={stop}
        className="px-4 py-2 border border-red-500 rounded text-sm text-red-400 font-mono animate-pulse"
      >
        ■ stop ({formatElapsed(elapsed)})
      </button>
    );
  }

  if (downloadUrl) {
    return (
      <div className="flex items-center gap-2 font-mono">
        <a
          href={downloadUrl}
          download={filename}
          className="px-4 py-2 border border-emerald-500 rounded text-sm text-emerald-400 hover:bg-stone-900 transition-colors"
        >
          ↓ download
        </a>
        <button onClick={reset} className="text-xs text-stone-500 hover:text-stone-300">
          다시 녹화
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      className="px-4 py-2 border border-stone-600 bg-stone-950/60 rounded text-sm text-stone-300 font-mono hover:border-red-500 hover:text-red-400 transition-colors"
    >
      {label}
    </button>
  );
}
