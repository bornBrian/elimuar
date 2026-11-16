"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, Pause, Play, X } from "@phosphor-icons/react";
import type { ArActivitySummary } from "@elimuar/shared";

/** An activity's Observe scene as the phone plays it: the Observe card, the narration with timed
   captions, and the phone's recording of the scene behind them. */
export function ActivityObservePreview({ activity, onClose }: { activity: ArActivitySummary; onClose: () => void }) {
  const preview = activity.preview;
  const audio = useRef<HTMLAudioElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Caption start times from their durations; a negative duration holds to the end.
  const cues = useMemo(() => {
    let at = 0;
    return (preview?.captions ?? []).map((c) => {
      const cue = { start: at, end: c.duration < 0 ? Number.POSITIVE_INFINITY : at + Math.max(0.5, c.duration), text: c.text };
      at = cue.end === Number.POSITIVE_INFINITY ? at : cue.end;
      return cue;
    });
  }, [preview]);
  const caption = cues.find((c) => time >= c.start && time < c.end)?.text ?? "";

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const tick = () => {
      setTime(a.currentTime);
      if (video.current && Math.abs(video.current.currentTime - a.currentTime) > 0.35) video.current.currentTime = a.currentTime;
    };
    const ended = () => setPlaying(false);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", ended);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", ended);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function play() {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      video.current?.pause();
      setPlaying(false);
      return;
    }
    await a.play().catch(() => undefined);
    await video.current?.play().catch(() => undefined);
    setPlaying(true);
  }

  function replay() {
    if (audio.current) audio.current.currentTime = 0;
    if (video.current) video.current.currentTime = 0;
    setTime(0);
    if (!playing) void play();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4" role="dialog" aria-modal="true" aria-label={`${activity.title} preview`}>
      <div className="w-full max-w-[1200px]">
        <div className="mb-2 flex items-center justify-between text-white">
          <p className="text-[14px] font-semibold">
            {activity.title} · {preview?.title ?? "Observe"} — as it plays on the phone
          </p>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-1.5 hover:bg-white/10">
            <X size={20} weight="bold" />
          </button>
        </div>

        <div
          className="relative w-full overflow-hidden rounded-2xl"
          style={{
            aspectRatio: "2340 / 1080",
            backgroundColor: "#E6E6E6",
            backgroundImage:
              "linear-gradient(#CFCFCF 1px, transparent 1px), linear-gradient(90deg, #CFCFCF 1px, transparent 1px)",
            backgroundSize: "4.2% 9.1%",
          }}
        >
          {preview?.videoUrl ? (
            <video ref={video} src={preview.videoUrl} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-[8%] text-center">
              <p className="max-w-[60%] text-[1.5vw] font-semibold text-[#6B6B6B]">
                The animated scene has not been recorded yet. On a phone signed in as the platform admin, open this
                activity&apos;s ⋯ menu and choose Web Preview.
              </p>
            </div>
          )}



          {caption && (
            <p
              className="absolute bottom-[6%] left-1/2 w-[54%] -translate-x-1/2 text-center text-[1.9vw] font-bold leading-snug text-white"
              style={{ textShadow: "0 0 3px #141414, 0 0 3px #141414, 1px 1px 2px #141414" }}
              dangerouslySetInnerHTML={{ __html: caption }}
            />
          )}

          <div className="absolute bottom-[4.6%] right-[3%] flex gap-[0.8%]">
            <button
              type="button"
              onClick={replay}
              className="flex flex-col items-center gap-1 rounded-[1vw] bg-[#F0EDEA]/90 px-[1.4vw] py-[0.9vw] text-[1.4vw] text-[#2B2B2B]"
            >
              <ArrowClockwise className="h-[2.4vw] w-[2.4vw]" />
              Replay
            </button>
            <button
              type="button"
              onClick={() => void play()}
              className="flex flex-col items-center gap-1 rounded-[1vw] bg-[#F0EDEA]/90 px-[1.4vw] py-[0.9vw] text-[1.4vw] text-[#2B2B2B]"
            >
              {playing ? <Pause className="h-[2.4vw] w-[2.4vw]" /> : <Play className="h-[2.4vw] w-[2.4vw]" />}
              {playing ? "Pause" : "Play"}
            </button>
          </div>
        </div>

        {preview?.audioUrl ? (
          <audio ref={audio} src={preview.audioUrl} preload="auto" />
        ) : (
          <p className="mt-2 text-[13px] text-white/80">This activity has no narration to preview.</p>
        )}

      </div>
    </div>
  );
}
