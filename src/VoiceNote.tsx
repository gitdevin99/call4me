import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Mic, Pause, Play, Trash2, Send, LoaderCircle } from "lucide-react";
import { readVoice, saveVoice } from "./voice-store";
const time = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export function VoiceBubble({ id }: { id: string }) {
  const [url, setUrl] = useState(""),
    [duration, setDuration] = useState(0),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false),
    [speed, setSpeed] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let active = true,
      value = "";
    readVoice(id)
      .then((note) => {
        if (!active) return;
        if (!note) {
          setFailed(true);
          return;
        }
        value = URL.createObjectURL(note.blob);
        setUrl(value);
        setDuration(note.duration);
      })
      .catch(() => setFailed(true));
    return () => {
      active = false;
      if (value) URL.revokeObjectURL(value);
    };
  }, [id]);
  if (failed)
    return (
      <small className="voice-unavailable">
        Voice recording is stored on the device where it was sent.
      </small>
    );
  return (
    <div className="voice-bubble">
      <audio
        ref={audio}
        src={url}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        disabled={!url}
        onClick={() => {
          if (playing) audio.current?.pause();
          else void audio.current?.play().catch(() => setFailed(true));
        }}
      >
        {playing ? <Pause size={23} /> : <Play size={23} />}
      </button>
      <div className="voice-track">
        <div className="voice-waveform" aria-hidden="true">
          {Array.from({ length: 34 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${8 + Math.sin(i * 1.7) ** 2 * 21}px`,
                opacity: i / 34 < position / (duration || 1) ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <input
          aria-label="Voice note playback position"
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(position, duration)}
          onChange={(e) => {
            if (audio.current)
              audio.current.currentTime = Number(e.target.value);
            setPosition(Number(e.target.value));
          }}
        />
        <small>{time(playing ? position : duration)}</small>
      </div>
      <button
        className="voice-speed"
        type="button"
        aria-label="Change playback speed"
        onClick={() => {
          const n = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
          setSpeed(n);
          if (audio.current) audio.current.playbackRate = n;
        }}
      >
        {speed}×
      </button>
      <Mic size={19} />
    </div>
  );
}
export function VoiceNote({
  token,
  enabled,
  onText,
  onSignIn,
  children,
}: {
  token?: string;
  enabled: boolean;
  onText: (text: string, audioId: string) => void;
  onSignIn: () => void;
  children: (microphone: ReactNode) => ReactNode;
}) {
  const [mode, setMode] = useState<"idle" | "recording" | "paused" | "review">(
      "idle",
    ),
    [blob, setBlob] = useState<Blob>(),
    [url, setUrl] = useState(""),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [levels, setLevels] = useState<number[]>(Array(32).fill(4));
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    context = useRef<AudioContext | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    mounted = useRef(true),
    duration = useRef(0),
    discarding = useRef(false),
    abort = useRef<AbortController | null>(null);
  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
    if (context.current && context.current.state !== "closed")
      void context.current.close();
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  async function start() {
    if (busy) return;
    if (enabled && !token) {
      onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Your browser cannot record audio. Please type your request.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      discarding.current = false;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        cleanup();
        if (mounted.current && !discarding.current) {
          setBlob(new Blob(chunks, { type: r.mimeType }));
          setMode("review");
        }
      };
      r.onerror = () => {
        cleanup();
        if (mounted.current) {
          setError("Recording stopped unexpectedly. Please try again.");
          setMode("idle");
        }
      };
      duration.current = 0;
      setSeconds(0);
      setBlob(undefined);
      setMode("recording");
      r.start();
      let analyser: AnalyserNode | undefined;
      try {
        const ctx = new AudioContext();
        context.current = ctx;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        ctx.createMediaStreamSource(media).connect(analyser);
      } catch {
        /* Recording still works if visualisation is unavailable. */
      }
      timer.current = setInterval(() => {
        if (r.state !== "recording") return;
        duration.current += 0.1;
        setSeconds(duration.current);
        if (analyser) {
          const values = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(values);
          setLevels(Array.from(values, (v) => 4 + (v / 255) * 32));
        }
        if (duration.current >= 60) r.stop();
      }, 100);
    } catch (e) {
      cleanup();
      setMode("idle");
      setError(
        e instanceof Error && e.name !== "NotAllowedError"
          ? e.message
          : "Allow microphone access in your browser, or type your request.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function discard() {
    discarding.current = true;
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    cleanup();
    setMode("idle");
    setBlob(undefined);
    setError("");
  }
  async function send() {
    if (!token) {
      onSignIn();
      return;
    }
    if (!enabled) {
      setError(
        "Transcription is unavailable. Keep your recording and try again later.",
      );
      return;
    }
    if (!blob || busy) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    const timeout = setTimeout(() => abort.current?.abort(), 30000);
    try {
      const response = await fetch("/api/concierge/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": blob.type,
          Authorization: `Bearer ${token}`,
        },
        body: blob,
        signal: abort.current.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not transcribe. Try again.");
      if (!mounted.current) return;
      const id = await saveVoice(blob, duration.current);
      if (!mounted.current) return;
      onText(result.text, id);
      setBlob(undefined);
      setMode("idle");
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not send. Your recording is still here.",
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      {mode === "idle" ? (
        children(
          <button
            className="voice-mic-button"
            type="button"
            disabled={busy}
            aria-label="Record voice note"
            onClick={() => void start()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={22} />
            ) : (
              <Mic size={23} />
            )}
          </button>,
        )
      ) : (
        <div className="recording-panel">
          <div className="recording-timeline">
            <span
              className={
                mode === "recording"
                  ? "recording-clock active"
                  : "recording-clock"
              }
            >
              {time(seconds)}
            </span>
            {mode === "review" ? (
              <audio controls src={url} aria-label="Review your recording" />
            ) : (
              <div
                className="recording-wave"
                aria-label={
                  mode === "paused"
                    ? "Recording paused"
                    : "Recording in progress"
                }
              >
                {levels.map((level, i) => (
                  <i key={i} style={{ height: level }} />
                ))}
              </div>
            )}
            <small>60s max</small>
          </div>
          <div className="recording-controls">
            <button
              type="button"
              aria-label="Delete recording"
              disabled={busy}
              onClick={discard}
            >
              <Trash2 size={24} />
            </button>
            {mode !== "review" ? (
              <>
                <button
                  className="pause-recording"
                  type="button"
                  aria-label={
                    mode === "recording"
                      ? "Pause recording"
                      : "Resume recording"
                  }
                  onClick={() => {
                    if (mode === "recording") {
                      recorder.current?.pause();
                      setMode("paused");
                    } else {
                      recorder.current?.resume();
                      setMode("recording");
                    }
                  }}
                >
                  {mode === "recording" ? (
                    <Pause size={25} />
                  ) : (
                    <Mic size={25} />
                  )}
                </button>
                <button
                  className="voice-send"
                  type="button"
                  aria-label="Finish recording"
                  onClick={() => recorder.current?.stop()}
                >
                  <Send size={23} />
                </button>
              </>
            ) : (
              <>
                <span className="recording-label">
                  {busy
                    ? "Transcribing…"
                    : !token
                      ? "Sign in to send"
                      : "Ready to send"}
                </span>
                <button
                  className="voice-send"
                  type="button"
                  aria-label={
                    !token ? "Sign in to send voice note" : "Send voice note"
                  }
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={23} />
                  ) : (
                    <Send size={23} />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="recording-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
