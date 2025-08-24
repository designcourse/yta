"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface NeriaResponseProps {
  response: string;
  isVisible: boolean;
}

function useStaggeredWords(text: string) {
  return useMemo(() => {
    // Comprehensive filtering of problematic characters
    const cleanedText = text
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
      .replace(/\uFFFD/g, '') // Unicode replacement character
      .replace(/[\uD800-\uDFFF]/g, '') // Surrogate pairs
      .replace(/[^\x20-\x7E\n\r\t]/g, '') // Non-printable characters except basic whitespace
      .trim();

    // Split text into sentences first
    const sentences = cleanedText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

    // Filter out any sentences that are just problematic characters
    const cleanSentences = sentences.filter(sentence => {
      const cleanSentence = sentence.replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\uD800-\uDFFF]/g, '').trim();
      return cleanSentence.length > 0;
    });

    // Group sentences into batches of 2
    const sentenceBatches: string[][] = [];
    for (let i = 0; i < cleanSentences.length; i += 2) {
      sentenceBatches.push(cleanSentences.slice(i, i + 2));
    }

    // Process each batch into words and characters
    let globalCharIndex = 0;
    const result: any[] = [];

    sentenceBatches.forEach((batch, batchIndex) => {
      const batchText = batch.join(' ');
      const wordsAndSpaces = batchText.split(/(\s+)/);

      const batchWords = wordsAndSpaces.map((item, wordIndex) => {
        // Final cleanup of any remaining problematic characters
        const cleanItem = item.replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\uD800-\uDFFF]/g, '');
        if (cleanItem.length === 0) return null; // Skip empty items after cleaning

        const chars = cleanItem.split("").map((char, charIndex) => ({
          char,
          globalIndex: globalCharIndex + charIndex,
          localIndex: charIndex
        }));

        globalCharIndex += cleanItem.length;

        return {
          content: cleanItem,
          chars,
          isSpace: /^\s+$/.test(cleanItem),
          wordIndex: result.length + wordIndex,
          batchIndex
        };
      }).filter(Boolean); // Remove null items

      result.push(...batchWords);
    });

    return result;
  }, [text]);
}

export default function NeriaResponse({ response, isVisible }: NeriaResponseProps) {
  const [currentBatch, setCurrentBatch] = useState(0);
  const [fadingOutBatch, setFadingOutBatch] = useState<number | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animatingBatch, setAnimatingBatch] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const animatedText = useStaggeredWords(response);

  // Get unique batches
  const batches = useMemo(() => {
    const batchIndices = [...new Set(animatedText.map(item => item.batchIndex))];
    const result = batchIndices.map(batchIndex => ({
      batchIndex,
      items: animatedText.filter(item => item.batchIndex === batchIndex)
    }));

    console.log(`Created ${result.length} batches:`, result.map(b => ({
      batchIndex: b.batchIndex,
      itemCount: b.items.length,
      charCount: b.items.reduce((sum, item) => sum + item.chars.length, 0)
    })));

    return result;
  }, [animatedText]);

  useEffect(() => {
    if (isVisible && !showAnimation) {
      // Small delay to ensure component is rendered
      const timer = setTimeout(() => {
        setShowAnimation(true);
        setCurrentBatch(0);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, showAnimation]);

  useEffect(() => {
    if (showAnimation && currentBatch < batches.length && containerRef.current) {
      const currentBatchData = batches[currentBatch];
      if (!currentBatchData) return;

      const container = containerRef.current;

      console.log(`Current batch: ${currentBatch}, Total batches: ${batches.length}`);
      console.log(`Current batch data:`, currentBatchData);
      console.log(`Current batch items: ${currentBatchData.items.length}`);

      // Small delay to ensure DOM is ready
      setTimeout(() => {
              // Mark this batch as animating
              setAnimatingBatch(currentBatch);

              // Get characters for current batch only
      const allCharElements = Array.from(container.querySelectorAll('[data-char]'));
      console.log(`Total characters in DOM: ${allCharElements.length}`);

      // Get all characters that belong to the current batch
      const batchChars = allCharElements.filter(el => {
        const batchAttr = el.getAttribute('data-batch');
        return batchAttr === currentBatch.toString();
      });

      console.log(`Found ${batchChars.length} characters for batch ${currentBatch}`);

        const INITIAL_DELAY_S = 0.5;
        const PER_CHAR_DELAY_S = 0.04;

        // Set animation delays for current batch with sentence pauses
        let cumulativeDelay = INITIAL_DELAY_S;
        batchChars.forEach((el, i) => {
          const element = el as HTMLElement;
          element.style.animationDelay = `${cumulativeDelay}s`;

          // Add extra pause after punctuation (but skip commas in numbers)
          const char = el.textContent || '';
          if (char === '.' || char === '!' || char === '?') {
            cumulativeDelay += 1.0; // 1 second pause after sentence end
          } else if (char === ',') {
            // Check if this comma is part of a number (has digits before/after)
            // We need to check the surrounding characters to determine context
            const prevChar = i > 0 ? batchChars[i - 1]?.textContent || '' : '';
            const nextChar = i < batchChars.length - 1 ? batchChars[i + 1]?.textContent || '' : '';

            // Only add delay if comma is NOT between digits (not part of a number)
            const isPrevDigit = /\d/.test(prevChar);
            const isNextDigit = /\d/.test(nextChar);

            if (!isPrevDigit || !isNextDigit) {
              cumulativeDelay += 0.5; // 0.5 second pause after comma (not in numbers)
            }
          }

          cumulativeDelay += PER_CHAR_DELAY_S;
        });

        // Schedule next batch after current batch animation completes
        if (currentBatch < batches.length - 1) {
          // Calculate total animation duration including sentence pauses
          let totalDuration = cumulativeDelay;
          console.log(`Scheduling batch transition: current=${currentBatch}, duration=${totalDuration}s, chars=${batchChars.length}`);

          const timer = setTimeout(() => {
            console.log(`Transitioning from batch ${currentBatch} to ${currentBatch + 1}`);
            // Clear animating state and fade out current batch
            setAnimatingBatch(null);
            setFadingOutBatch(currentBatch);

            // After fade out, move to next batch
            setTimeout(() => {
              setFadingOutBatch(null);
              setCurrentBatch(currentBatch + 1);
            }, 500); // 0.5s fade out duration
          }, (totalDuration + 3) * 1000); // 3s pause after animation

          return () => clearTimeout(timer);
        } else {
          console.log(`Final batch ${currentBatch} completed, no more transitions`);
        }
      }, 100); // Small delay for DOM readiness
    }
  }, [showAnimation, currentBatch, batches]);

  if (!isVisible) return null;

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="mx-auto items-end w-full max-w-[1800px] px-[clamp(16px,5vw,200px)] py-[clamp(24px,5vw,100px)] flex flex-wrap gap-16"
      >
        <div className="flex-1 min-w-0 text-black pr-[clamp(16px,3vw,48px)] overflow-visible hero-fade-in">


          <div className="text-[clamp(24px,3vw,48px)] font-normal leading-[1.1] break-normal">
            {batches.map((batch) => (
              <div
                key={`batch-${batch.batchIndex}`}
                className={`transition-opacity duration-500 ${
                  fadingOutBatch === batch.batchIndex ? 'opacity-0' : 'opacity-100'
                }`}
                style={{
                  display: (batch.batchIndex === currentBatch && batch.batchIndex === animatingBatch) || batch.batchIndex === fadingOutBatch ? 'inline' : 'none'
                }}
              >
                {batch.items.map((wordOrSpace) => (
                  <span
                    key={`word-${wordOrSpace.wordIndex}`}
                    className={wordOrSpace.isSpace ? "inline" : "inline-block"}
                  >
                    {wordOrSpace.chars.map(({ char, globalIndex, localIndex }) => (
                      <span
                        key={`char-${globalIndex}-${char}-${localIndex}`}
                        data-char
                        data-batch={wordOrSpace.batchIndex}
                        className="inline-block will-change-transform opacity-0"
                        style={{
                          animationDelay: `${0.5 + localIndex * 0.04}s`,
                          animation: 'heroChar 1200ms cubic-bezier(0.2, 0.7, 0.2, 1) both'
                        }}
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
