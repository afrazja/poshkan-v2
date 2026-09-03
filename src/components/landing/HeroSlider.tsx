"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SHADOW_MD } from "./lp";

export interface Slide {
  src: string;
  alt: string;
  caption: string;
}

// The hero's product tour: one box, a handful of screens, and a caption that
// names each. It advances on its own every five seconds unless the visitor is
// hovering, has focus inside it, is mid-swipe, or asked the OS for reduced
// motion. Arrows, dots, the keyboard arrows and a swipe all move it too.
export default function HeroSlider({ slides, aspect }: { slides: Slide[]; aspect: string }) {
  const n = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);
  const go = useCallback((k: number) => setI(((k % n) + n) % n), [n]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (paused || reduced || n < 2) return;
    const t = setInterval(() => setI((k) => (k + 1) % n), 5000);
    return () => clearInterval(t);
  }, [paused, reduced, n]);

  const arrow =
    "absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full " +
    "bg-[#161826d9] text-[20px] leading-none text-[#e9e9ed] opacity-70 ring-1 ring-[var(--lp-divider)] " +
    "transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]";

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Screens from the app"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const x0 = touchX.current;
        touchX.current = null;
        if (x0 != null) {
          const dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        }
        setPaused(false);
      }}
    >
      <div
        className="relative overflow-hidden rounded-[14px] bg-[#161826]"
        style={{ aspectRatio: aspect, boxShadow: SHADOW_MD }}
      >
        {slides.map((s, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.src}
            src={s.src}
            alt={s.alt}
            aria-hidden={k !== i}
            loading={k === 0 ? "eager" : "lazy"}
            fetchPriority={k === 0 ? "high" : "auto"}
            className="absolute inset-0 block h-full w-full object-cover transition-opacity duration-500"
            style={{ opacity: k === i ? 1 : 0 }}
          />
        ))}
        <button type="button" aria-label="Previous screen" onClick={() => go(i - 1)} className={`${arrow} left-3`}>
          <span aria-hidden className="-translate-y-px">‹</span>
        </button>
        <button type="button" aria-label="Next screen" onClick={() => go(i + 1)} className={`${arrow} right-3`}>
          <span aria-hidden className="-translate-y-px">›</span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="m-0 text-[13.5px] leading-[22px] text-[#e9e9ed9e]" aria-live="polite">
          {slides[i].caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Choose a screen">
          {slides.map((s, k) => (
            <button
              key={s.src}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`Screen ${k + 1} of ${n}: ${s.caption}`}
              onClick={() => go(k)}
              className={`h-1.5 rounded-full transition-all ${
                k === i ? "w-5 bg-[var(--lp-accent)]" : "w-1.5 bg-[#e9e9ed4d] hover:bg-[#e9e9ed80]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
