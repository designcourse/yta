"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

function useStaggeredChars(text: string) {
  return useMemo(() => {
    return text.split("").map((char, index) => ({ char, index }));
  }, [text]);
}

export default function Hero() {
  const line1 = useStaggeredChars("Hi, I’m Neria.");
  const line2 = useStaggeredChars("Think of me as your personal YouTube coach.");

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chars = Array.from(container.querySelectorAll("[data-char]"));
    const INITIAL_DELAY_S = 0.5; // pause before any animation starts
    const PER_CHAR_DELAY_S = 0.04; // stagger interval between characters
    const PERIOD_EXTRA_PAUSE_S = 1; // extra pause after the period in "Neria."

    let extraOffsetAfterPeriod = 0;
    chars.forEach((el, i) => {
      const element = el as HTMLElement;
      const char = (element.textContent || "").trim();
      const delay = INITIAL_DELAY_S + i * PER_CHAR_DELAY_S + extraOffsetAfterPeriod;
      element.style.animationDelay = `${delay}s`;
      if (extraOffsetAfterPeriod === 0 && char === ".") {
        // Add extra pause for the characters that follow the period
        extraOffsetAfterPeriod = PERIOD_EXTRA_PAUSE_S;
      }
    });
  }, []);

  return (
    <section className="pointer-events-none">
      <div
        ref={containerRef}
        className="mx-auto items-end w-full max-w-[1800px] px-[clamp(16px,5vw,200px)] py-[clamp(48px,10vw,200px)] flex flex-wrap gap-16"
      >
        <div className="flex-1 min-w-0 text-black pr-[clamp(16px,3vw,48px)] overflow-visible hero-fade-in">
          <h1 className="mb-8 text-[clamp(36px,4vw,112px)] font-normal leading-[1.1] break-normal">
            <span className="block">
              {line1.map(({ char, index }) => (
                <span
                  key={`l1-${index}-${char}-${index}`}
                  data-char
                  className="inline-block will-change-transform animate-heroChar"
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              ))}
            </span>
            <span className="block h-[80px]" aria-hidden="true" />
            <span className="block">
              {line2.map(({ char, index }) => (
                <span
                  key={`l2-${index}-${char}-${index}`}
                  data-char
                  className="inline-block will-change-transform animate-heroChar"
                >
                  {char === " " ? "\u00A0" : char}
                </span>
              ))}
            </span>
          </h1>
          <p className="text-sm opacity-80 fade-in" style={{ animationDelay: "3.6s" }}>
            The world’s the most intelligent AI-Driven YouTube strategist.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-start justify-end gap-4 fade-in" style={{ animationDelay: "3.6s", alignItems: "flex-end" }}>
          <Link
            href="/youtube-connect"
            className="bg-white text-black rounded-full px-14 py-6 flex items-center gap-5 transition"
            aria-label="Connect your channel"
          >
            <span className="inline-grid place-items-center w-[31px] h-[22px] overflow-hidden" aria-hidden="true">
              <YouTubeIcon className="w-full h-full" />
            </span>
            <span className="text-[clamp(20px,1.4vw,28px)] font-bold">Connect your channel</span>
          </Link>
          <span className="text-xs text-black">Is this safe?</span>
        </div>
      </div>
    </section>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 31 22" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="31" height="22" rx="11" fill="#FF0000" />
      <path d="M13 7.2L20 11L13 14.8V7.2Z" fill="#FFFFFF" />
    </svg>
  );
}


