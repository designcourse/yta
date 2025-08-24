"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface NeriaResponseProps {
  response: string;
  isVisible: boolean;
}

function useStaggeredWords(text: string) {
  return useMemo(() => {
    // Split text into words and spaces
    const wordsAndSpaces = text.split(/(\s+)/);
    let globalCharIndex = 0;

    return wordsAndSpaces.map((item, wordIndex) => {
      const chars = item.split("").map((char, charIndex) => ({
        char,
        globalIndex: globalCharIndex + charIndex,
        localIndex: charIndex
      }));

      globalCharIndex += item.length;

      return {
        content: item,
        chars,
        isSpace: /^\s+$/.test(item),
        wordIndex
      };
    });
  }, [text]);
}

export default function NeriaResponse({ response, isVisible }: NeriaResponseProps) {
  const [showAnimation, setShowAnimation] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const animatedText = useStaggeredWords(response);

  useEffect(() => {
    if (isVisible && !showAnimation) {
      // Small delay to ensure component is rendered
      const timer = setTimeout(() => setShowAnimation(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, showAnimation]);

  useEffect(() => {
    if (showAnimation && containerRef.current) {
      const container = containerRef.current;
      const chars = Array.from(container.querySelectorAll("[data-char]"));
      const INITIAL_DELAY_S = 0.5; // pause before any animation starts
      const PER_CHAR_DELAY_S = 0.04; // stagger interval between characters

      chars.forEach((el, i) => {
        const element = el as HTMLElement;
        const delay = INITIAL_DELAY_S + i * PER_CHAR_DELAY_S;
        element.style.animationDelay = `${delay}s`;
      });
    }
  }, [showAnimation]);

  if (!isVisible) return null;

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="mx-auto items-end w-full max-w-[1800px] px-[clamp(16px,5vw,200px)] py-[clamp(48px,10vw,200px)] flex flex-wrap gap-16"
      >
        <div className="flex-1 min-w-0 text-black pr-[clamp(16px,3vw,48px)] overflow-visible hero-fade-in">
          <div className="mb-8">
            <h4 className="text-sm opacity-80 fade-in mb-4" style={{ animationDelay: "0.5s" }}>
              Neria says:
            </h4>
          </div>

          <div className="text-[clamp(24px,3vw,48px)] font-normal leading-[1.1] break-normal">
            {animatedText.map((wordOrSpace) => (
              <span
                key={`word-${wordOrSpace.wordIndex}`}
                className={wordOrSpace.isSpace ? "inline" : "inline-block"}
              >
                {wordOrSpace.chars.map(({ char, globalIndex, localIndex }) => (
                  <span
                    key={`char-${globalIndex}-${char}-${localIndex}`}
                    data-char
                    className="inline-block will-change-transform animate-heroChar"
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
