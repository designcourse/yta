"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

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

export default function OnboardHero() {
  const [userName, setUserName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isContentVisible, setIsContentVisible] = useState(false);

  // Fetch user name from google_accounts table
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: googleAccount } = await supabase
            .from("google_accounts")
            .select("account_name, given_name")
            .eq("user_id", user.id)
            .single();

          if (googleAccount) {
            // Use given_name if available, otherwise account_name, otherwise fallback to "there"
            const name = googleAccount.given_name || googleAccount.account_name?.split(" ")[0] || "there";
            setUserName(name);
          } else {
            setUserName("there");
          }
        }
      } catch (error) {
        console.error("Error fetching user name:", error);
        setUserName("there");
      } finally {
        setIsLoading(false);
        // Show content after 0.3 seconds to prevent flash
        setTimeout(() => setIsContentVisible(true), 300);
      }
    };

    fetchUserName();
  }, []);

  const line1 = useStaggeredWords(`Hey ${userName || "there"},`);
  const line2 = useStaggeredWords("I now need you to grant me access to view your YouTube account.");

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoading || !isContentVisible) return;

    const container = containerRef.current;
    if (!container) return;

    const line1Chars = Array.from(container.querySelectorAll("[data-line='1'] [data-char]"));
    const line2Chars = Array.from(container.querySelectorAll("[data-line='2'] [data-char]"));

    const INITIAL_DELAY_S = 0.5; // pause before any animation starts
    const PER_CHAR_DELAY_S = 0.04; // stagger interval between characters
    const PERIOD_EXTRA_PAUSE_S = 1; // extra pause after the period in "Neria."

    // Animate line 1 characters
    let line1ExtraOffsetAfterPeriod = 0;
    line1Chars.forEach((el, i) => {
      const element = el as HTMLElement;
      const char = (element.textContent || "").trim();
      const delay = INITIAL_DELAY_S + i * PER_CHAR_DELAY_S + line1ExtraOffsetAfterPeriod;
      element.style.animationDelay = `${delay}s`;
      if (line1ExtraOffsetAfterPeriod === 0 && char === ".") {
        line1ExtraOffsetAfterPeriod = PERIOD_EXTRA_PAUSE_S;
      }
    });

    // Calculate when line 1 finishes (last character delay + animation duration)
    const line1LastCharDelay = INITIAL_DELAY_S + (line1Chars.length - 1) * PER_CHAR_DELAY_S + line1ExtraOffsetAfterPeriod;
    const line1TotalDuration = line1LastCharDelay + 0.5; // Add animation duration

    // Animate line 2 characters starting after line 1 completes
    let line2ExtraOffsetAfterPeriod = 0;
    line2Chars.forEach((el, i) => {
      const element = el as HTMLElement;
      const char = (element.textContent || "").trim();
      const delay = line1TotalDuration + i * PER_CHAR_DELAY_S + line2ExtraOffsetAfterPeriod;
      element.style.animationDelay = `${delay}s`;
      if (line2ExtraOffsetAfterPeriod === 0 && char === ".") {
        line2ExtraOffsetAfterPeriod = PERIOD_EXTRA_PAUSE_S;
      }
    });
  }, [isLoading, isContentVisible]);

  return (
    <section className="pointer-events-none">
      <div
        ref={containerRef}
        className={`mx-auto items-end w-full max-w-[1800px] px-[clamp(16px,5vw,200px)] py-[clamp(48px,10vw,200px)] flex flex-wrap gap-16 transition-opacity duration-300 ${
          isContentVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex-1 min-w-0 text-black pr-[clamp(16px,3vw,48px)] overflow-visible hero-fade-in">
          <h1 className="mb-8 text-[clamp(36px,4vw,112px)] font-normal leading-[1.1] break-normal">
            <span className="block" data-line="1">
              {line1.map((wordOrSpace) => (
                <span
                  key={`l1-word-${wordOrSpace.wordIndex}`}
                  className={wordOrSpace.isSpace ? "inline" : "inline-block"}
                >
                  {wordOrSpace.chars.map(({ char, globalIndex, localIndex }) => (
                    <span
                      key={`l1-${globalIndex}-${char}-${localIndex}`}
                      data-char
                      className="inline-block will-change-transform animate-heroChar"
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                </span>
              ))}
            </span>
            <span className="block h-[80px]" aria-hidden="true" />
            <span className="block" data-line="2">
              {line2.map((wordOrSpace) => (
                <span
                  key={`l2-word-${wordOrSpace.wordIndex}`}
                  className={wordOrSpace.isSpace ? "inline" : "inline-block"}
                >
                  {wordOrSpace.chars.map(({ char, globalIndex, localIndex }) => (
                    <span
                      key={`l2-${globalIndex}-${char}-${localIndex}`}
                      data-char
                      className="inline-block will-change-transform animate-heroChar"
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </h1>
          <p className="text-sm opacity-80 fade-in" style={{ animationDelay: "3.5s" }}>
            The world&apos;s the most intelligent AI-Driven YouTube strategist.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-start justify-end gap-4 fade-in" style={{ animationDelay: "3.5s", alignItems: "flex-end" }}>
          <button
            onClick={() => {
              const popup = window.open('/youtube-connect', 'youtube', 'width=500,height=600');
              if (popup) {
                window.addEventListener('message', function(event) {
                  if (event.data === 'youtube-connected') {
                    popup.close();
                    // Redirect to dashboard after successful connection
                    window.location.href = '/dashboard';
                  }
                });
              }
            }}
            className="bg-black text-white rounded-full px-14 py-6 flex items-center gap-5 transition hover:opacity-80"
            aria-label="Connect your YouTube account"
          >
            <span className="inline-grid place-items-center w-[31px] h-[22px] overflow-hidden" aria-hidden="true">
              <YouTubeIcon className="w-full h-full" />
            </span>
            <span className="text-[clamp(20px,1.4vw,28px)] font-bold">Connect YouTube</span>
          </button>
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
