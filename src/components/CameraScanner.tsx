"use client";

import { useEffect, useRef, useState } from "react";

const CARD_ASPECT = 1.586; // standard business card 85.6 × 54 mm
const FRAME_W = 0.86; // frame covers 86% of the video width
const MAX_W = 1500; // cap stored crop width

/**
 * Live camera preview with a card-shaped framing guide. The MediaStream is
 * acquired by the caller *inside the tap handler* (Safari/iOS require
 * getUserMedia to run in a user gesture), then passed in here.
 */
export function CameraScanner({ stream, onCapture, onClose }: { stream: MediaStream; onCapture: (croppedDataUrl: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    v.play().then(() => setReady(true)).catch(() => setReady(true));
    return () => {
      v.srcObject = null;
    };
  }, [stream]);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const W = v.videoWidth;
    const H = v.videoHeight;
    if (!W || !H) return;
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
        <div className="relative w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="w-full" />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]"
            style={{ width: `${FRAME_W * 100}%`, aspectRatio: String(CARD_ASPECT) }}
          />
        </div>
        <p className="text-center text-xs text-paper/70">Line the card up inside the frame, then capture.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md bg-white/15 px-4 py-2 text-sm text-paper hover:bg-white/25">Cancel</button>
          <button onClick={capture} disabled={!ready} className="rounded-md bg-white px-6 py-2 text-sm font-semibold text-ink disabled:opacity-50">
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}

/** Friendly message for a getUserMedia failure. */
export function cameraErrorMessage(e: unknown): string {
  const name = (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "") || "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The browser blocked camera access for this website. Allowing the camera in system settings isn't enough — each site needs it too. In Safari: tap “aA” (or the page-settings icon) in the address bar → Website Settings → Camera → Allow, then reload. In Chrome: tap the lock/⋮ → Site settings → Camera → Allow.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The camera is in use by another app (e.g. Zoom, Teams, FaceTime). Close it and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No usable camera was found on this device.";
  return "Couldn't open the in-app camera. Use your device camera or upload a photo instead.";
}
