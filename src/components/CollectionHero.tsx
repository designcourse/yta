'use client';

import NeriaResponse from './NeriaResponse';

interface CollectionHeroProps {
  neriaResponse: string | null;
}

export default function CollectionHero({ neriaResponse }: CollectionHeroProps) {
  return (
    <>
      <div
        className="box-border content-stretch flex flex-col gap-3 items-start justify-start px-[4%] sm:px-[6%] md:px-[8%] lg:px-[10%] py-[4%] sm:py-[6%] md:py-[8%] relative w-full"
        data-name="Onboarding Hero"
        data-node-id="9:91"
      >
        {/* Neria Response Animation */}
        {neriaResponse && (
          <div className="w-full mb-8">
            <NeriaResponse response={neriaResponse} isVisible={true} />
          </div>
        )}
      </div>

      {/* Fixed bottom-left status indicator */}
      <div className="fixed bottom-20 left-20 z-50 pointer-events-none">
        <div className="flex flex-col gap-2 text-left">
          <div
            className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-mono text-black"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            COLLECTING DATA
          </div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-700">
            This may take a couple minutes..
          </div>
        </div>
      </div>
    </>
  );
}


