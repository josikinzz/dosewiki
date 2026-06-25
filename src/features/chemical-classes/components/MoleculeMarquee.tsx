"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { AppImage } from "@/components/common/AppImage";
import { prefersReducedMotion } from "@/utils/navigation";
import type { ChemicalClassMolecule } from "../types";

interface MoleculeMarqueeProps {
  molecules: ChemicalClassMolecule[];
  /** Leading featured molecules kept in place; everything after is shuffled. */
  featuredCount: number;
  /** Class label, for the accessible region name. */
  label: string;
}

/**
 * Cap how many structures actually render. Big classes have 40-50 members;
 * drawing them all (×2 for the seamless loop) is pure waste on low-end machines.
 * A shuffled sample of this many still gives a full, varied drift and plenty of
 * track to loop, while the featured picks always lead.
 */
const MAX_RENDERED = 18;

/** Fisher–Yates shuffle of the tail, keeping the featured prefix fixed. */
function shuffleTail(items: ChemicalClassMolecule[], keepFirst: number): ChemicalClassMolecule[] {
  const head = items.slice(0, keepFirst);
  const tail = items.slice(keepFirst);
  for (let i = tail.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [tail[i], tail[j]] = [tail[j], tail[i]];
  }
  return [...head, ...tail];
}

/**
 * A minimalist, auto-scrolling gallery of a chemical class's molecule structures.
 * The curated featured picks lead; the rest are shuffled per visit. It drifts on
 * its own, pauses while hovered/focused/touched, and stays freely scrollable —
 * no arrows, dots, or chrome. Each structure links to its substance.
 */
export function MoleculeMarquee({ molecules, featuredCount, label }: MoleculeMarqueeProps) {
  const [ordered, setOrdered] = useState(() => molecules.slice(0, MAX_RENDERED));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(true);
  const posRef = useRef(0);
  const dirRef = useRef(1);

  // Shuffle the non-featured tail on mount, then keep only a bounded sample
  // (client-only → no hydration mismatch since the initial render is the
  // server's featured-first prefix in the same order).
  useEffect(() => {
    setOrdered(shuffleTail(molecules, featuredCount).slice(0, MAX_RENDERED));
  }, [molecules, featuredCount]);

  // Only drift while the gallery is actually on-screen. Scrolled past it (down
  // to the panels) the rAF goes idle, so it stops costing anything. Tab-hidden
  // is already free — browsers halt rAF for background tabs.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? true;
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Gentle, never-stopping ping-pong drift: it pans to one end, turns around,
  // pans back, and repeats. Position is tracked as a float (scrollLeft is
  // integer-quantized, which would otherwise stall a sub-pixel speed). It only
  // idles while off-screen and resumes on its own when scrolled into view;
  // disabled for reduced motion (the strip stays manually scrollable).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    posRef.current = 0;
    dirRef.current = 1;
    if (prefersReducedMotion()) return;

    const SPEED = 0.4; // px per frame
    let raf = 0;
    const step = () => {
      if (visibleRef.current) {
        const max = el.scrollWidth - el.clientWidth;
        if (max > 0) {
          let pos = posRef.current + SPEED * dirRef.current;
          if (pos >= max) {
            pos = max;
            dirRef.current = -1;
          } else if (pos <= 0) {
            pos = 0;
            dirRef.current = 1;
          }
          posRef.current = pos;
          el.scrollLeft = pos;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ordered]);

  if (ordered.length === 0) return null;

  return (
    <section aria-label={`${label} molecule structures`}>
      <div
        ref={scrollerRef}
        className="flex w-full items-end gap-7 overflow-x-auto px-4 py-3 sm:gap-12 [contain:layout_paint] [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)] [&::-webkit-scrollbar]:hidden"
      >
        {ordered.map((m) => {
          return (
            <Link
              key={m.slug}
              href={`/${m.slug}`}
              className="group flex shrink-0 flex-col items-center gap-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-dose-accent/60"
            >
              <AppImage
                src={m.url}
                alt={`${m.name} molecule structure`}
                width={220}
                height={220}
                className="theme-molecule-image h-32 w-36 object-contain object-bottom transition-[transform,filter] duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.05] group-hover:drop-shadow-[0_12px_24px_rgba(217,70,239,0.28)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100 sm:h-36 sm:w-44"
              />
              <span className="theme-text-secondary relative font-[family-name:var(--font-family-display)] text-[0.8125rem] font-semibold leading-none tracking-[0.01em] transition-colors duration-200 group-hover:text-dose-accent after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-center after:scale-x-0 after:bg-dose-accent after:transition-transform after:duration-300 after:ease-out group-hover:after:scale-x-100 motion-reduce:after:transition-none sm:text-sm">
                {m.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
