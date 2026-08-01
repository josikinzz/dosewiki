"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { getCategoryIcon } from "@/data/config/categoryIcons";

/** The burst's whole lifetime; the canvas unmounts itself when it elapses. */
const CONFETTI_MS = 2200;
/** Pieces per cannon; two cannons fire, one from each bottom corner. */
const PIECES_PER_CANNON = 70;

/**
 * The palette, as raw channel tokens resolved at fire time. Emerald-weighted
 * because green is the motivating colour here, cut with amber and white so the
 * burst reads as celebration rather than monochrome. Reading tokens (instead
 * of hard-coding literals) keeps the canvas inside the theme system and the
 * token audit.
 */
const CONFETTI_TOKENS = [
  "--c-emerald",
  "--c-emerald",
  "--c-emerald-bright",
  "--c-emerald-bright",
  "--c-emerald-deep",
  "--c-amber-bright",
  "--c-white",
];

interface ConfettiPiece {
  x: number;
  y: number;
  /** Velocity in px/s; gravity and drag reshape it every frame. */
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
}

function spawnPieces(width: number, height: number, colors: string[]): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  const cannons = [
    { x: width * 0.12, direction: 1 },
    { x: width * 0.88, direction: -1 },
  ];
  for (const cannon of cannons) {
    for (let index = 0; index < PIECES_PER_CANNON; index += 1) {
      const speed = 750 + Math.random() * 750;
      // Up and inward, fanned ±35° around a 65° launch.
      const angle =
        (-65 + (Math.random() * 70 - 35)) * (Math.PI / 180) * cannon.direction;
      pieces.push({
        x: cannon.x + (Math.random() * 40 - 20),
        y: height + 12,
        vx: Math.abs(Math.sin(angle)) * speed * cannon.direction,
        vy: -Math.cos(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
        width: 5 + Math.random() * 5,
        height: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }
  return pieces;
}

/**
 * A one-shot, self-cleaning canvas burst. Mounted only for the moment itself:
 * the canvas is created on trigger, animates on its own compositing layer at
 * `pointer-events-none`, and removes itself when the run ends. Reduced motion
 * skips the whole thing — the medallion card and toast carry the news.
 */
function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDone(true);
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      setDone(true);
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.scale(dpr, dpr);

    const styles = getComputedStyle(document.documentElement);
    const colors = CONFETTI_TOKENS.map((token) =>
      styles.getPropertyValue(token).trim(),
    )
      .filter(Boolean)
      .map((triplet) => `rgb(${triplet})`);
    if (colors.length === 0) {
      setDone(true);
      return;
    }

    const pieces = spawnPieces(width, height, colors);
    const gravity = 1700;
    const drag = 0.82;
    let frame = 0;
    let started: number | null = null;
    let previous: number | null = null;

    const step = (now: number) => {
      if (started === null) started = now;
      const elapsed = now - started;
      const delta = Math.min((now - (previous ?? now)) / 1000, 0.05);
      previous = now;

      context.clearRect(0, 0, width, height);
      if (elapsed >= CONFETTI_MS) {
        setDone(true);
        return;
      }

      // Fade the whole run out over its last 30%.
      const fade = Math.min(1, (1 - elapsed / CONFETTI_MS) / 0.3);
      context.globalAlpha = Math.max(0, fade);

      for (const piece of pieces) {
        piece.vy += gravity * delta;
        piece.vx *= 1 - (1 - drag) * delta * 3;
        piece.x += piece.vx * delta;
        piece.y += piece.vy * delta;
        piece.rotation += piece.spin * delta;
        if (piece.y > height + 30) continue;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        // A cheap 3D tumble: the strip's height breathes with its rotation.
        context.scale(1, 0.45 + Math.abs(Math.sin(piece.rotation * 1.6)) * 0.55);
        context.fillStyle = piece.color;
        context.fillRect(
          -piece.width / 2,
          -piece.height / 2,
          piece.width,
          piece.height,
        );
        context.restore();
      }

      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (done) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  );
}

/**
 * The class-complete moment: confetti over a centred medallion card carrying
 * the finished category's own icon. The card never blocks the flow — it is
 * `pointer-events-none`, auto-dismissed by the caller's timer, and any key or
 * pointer press clears it early (without swallowing the press: the review
 * shortcuts underneath still run).
 */
export function ReviewClassCelebration({
  label,
  total,
  iconKey,
  showCard,
  onDismiss,
}: {
  label: string;
  total: number;
  iconKey?: string;
  /**
   * Off when the same tick finished the whole corpus — FinishedState is the
   * headline then, and two stacked "all done" cards would dilute both.
   */
  showCard: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!showCard) return;
    const dismiss = () => onDismiss();
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [onDismiss, showCard]);

  return (
    <>
      <ConfettiBurst />
      {showCard ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          <div className="theme-review-celebration-card rounded-3xl border px-8 py-7 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:slide-in-from-bottom-2">
            <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
              <span
                aria-hidden
                className="theme-review-complete-ping absolute inset-0 rounded-full motion-safe:animate-ping motion-safe:[animation-iteration-count:3]"
              />
              <span className="theme-review-complete-badge relative flex h-16 w-16 items-center justify-center rounded-full border">
                <Icon
                  icon={getCategoryIcon(iconKey ?? "")}
                  size={30}
                  className="theme-review-success-text"
                />
              </span>
            </div>
            <p className="font-display text-xl font-bold">{label} complete!</p>
            <p className="theme-text-secondary mt-1 text-sm">
              All {total.toLocaleString()} articles reviewed — the whole class is
              green.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
