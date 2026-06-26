"use client";

import { useEffect, useRef, useState } from "react";

const CARD_ASPECT = 1.586; // standard business card 85.6 × 54 mm
const FRAME_W = 0.86; // frame covers 86% of the video width
const MAX_W = 1500; // cap stored crop width

/**
 * In-app camera capture with a card-shaped framing guide. The user lines the
 * card up inside the frame and taps Capture; we crop to the frame and return a
 * JPEG data URL of just the card.
 */
export function CameraScanner({ onCapture, onClose }: { onCapture: (croppedDataUrl: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch {
        setErr("Couldn't open the camera. Check the browser's camera permission, or use “Upload” instead.");
      }
    })();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const W = v.videoWidth;
    const H = v.videoHeight;
    if (!W || !H) return;
    // Crop the centred card-aspect frame (same proportions as the overlay).
    let cw = W * FRAME_W;
    let ch = cw / CARD_ASPECT;
    if (ch > H * 0.92) {
      ch = H * 0.92;
      cw = ch * CARD_ASPECT;
    }
    const cx = (W - cw) / 2;
    const cy = (H - ch) / 2;
    const scale = Math.min(1, MAX_W / cw);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4" onClick={(e) => e.stopPropagation()}>
        {err ? (
          <p className="max-w-md text-center text-sm text-paper">{err}</p>
        ) : (
          <div className="relative w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="w-full" />
            {/* Card framing guide */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]"
              style={{ width: `${FRAME_W * 100}%`, aspectRatio: String(CARD_ASPECT) }}
            />
          </div>
        )}
        <p className="text-center text-xs text-paper/70">
          {err ? "" : "Line the card up inside the frame, then capture."}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md bg-white/15 px-4 py-2 text-sm text-paper hover:bg-white/25">Cancel</button>
          {!err && (
            <button onClick={capture} disabled={!ready} className="rounded-md bg-white px-6 py-2 text-sm font-semibold text-ink disabled:opacity-50">
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
