"use client";

import { useEffect, useRef, useState } from "react";

import { AppImage } from "@/components/common/AppImage";

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia(MOTION_QUERY).matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const duration = 700;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      setShown(0);
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("en-GB")}
    </span>
  );
}

export function Signature({ watch }: { watch: string }) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <p className="theme-china-signature text-xl leading-none" data-seen={seen ? "true" : "false"}>
      &mdash;{" "}
      <a href="https://josiekins.xyz" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-4 hover:decoration-solid">
        Josie Kins
      </a>
    </p>
  );
}

export function ConsoleGreeting() {
  useEffect(() => {
    console.info(
      "%c你好 FreeODwiki 👋%c\n这些数据包由 scripts/translation/build-packs.mjs 生成；许可以每个数据集标注的为准。\nThe packs are built by scripts/translation/build-packs.mjs; the licence is whatever each dataset is marked with.\ngithub.com/SalviaSWC/FreeODwiki",
      "font-size:14px;font-weight:600",
      "font-size:12px",
    );
  }, []);
  return null;
}

export function MoleculeCarousel({ slugs }: { slugs: readonly string[] }) {
  const seconds = Math.max(40, slugs.length * 5);
  return (
    <div className="theme-china-carousel relative overflow-hidden opacity-70" aria-hidden="true">
      <div className="theme-china-carousel-track flex w-max items-end" style={{ animationDuration: `${seconds}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-end gap-x-3 pr-3">
            {slugs.map((slug) => (
              <AppImage
                key={`${copy}-${slug}`}
                src={`/api/molecules/${slug}`}
                alt=""
                width={144}
                height={144}
                unoptimized
                draggable={false}
                className="h-36 w-auto"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
