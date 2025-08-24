'use client';

import NeriaResponse from './NeriaResponse';

interface CollectionHeroProps {
  neriaResponse: string | null;
}

export default function CollectionHero({ neriaResponse }: CollectionHeroProps) {
  return (
    <div
      className="box-border content-stretch flex flex-col gap-3 items-start justify-start px-[309px] py-[258px] relative w-full"
      data-name="Onboarding Hero"
      data-node-id="9:91"
    >
      {/* Neria Response Animation */}
      {neriaResponse && (
        <div className="w-full mb-8">
          <NeriaResponse response={neriaResponse} isVisible={true} />
        </div>
      )}

      <div
        className="content-stretch flex flex-col font-normal gap-6 items-end justify-start leading-[0] relative shrink-0 text-[#000000] text-right"
        data-name="Status Container"
        data-node-id="10:116"
      >
        <div
          className="relative shrink-0 text-[40px] w-full font-mono"
          data-node-id="10:106"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          <p className="leading-[normal]">COLLECTING DATA</p>
        </div>
        <div
          className="not-italic relative shrink-0 text-[16px] w-full"
          data-node-id="10:114"
        >
          <p className="leading-[normal]">This may take a couple minutes..</p>
        </div>
      </div>
    </div>
  );
}


