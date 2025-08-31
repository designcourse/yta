'use client';

import NeriaResponse from './NeriaResponse';

interface CollectionHeroProps {
  neriaResponse: string | null;
  onNeriaComplete?: () => void;
  onExitComplete?: () => void;
  isStrategy?: boolean;
}

export default function CollectionHero({ neriaResponse, onNeriaComplete, onExitComplete, isStrategy }: CollectionHeroProps) {
  console.log("🔍 CollectionHero rendered with neriaResponse:", {
    hasResponse: !!neriaResponse,
    responseLength: neriaResponse?.length || 0,
    responsePreview: neriaResponse?.substring(0, 100) || "none"
  });

  return (
    <>
      <div
        className="box-border content-stretch flex flex-col gap-3 items-start justify-start px-[4%] sm:px-[6%] md:px-[8%] lg:px-[10%] py-[4%] sm:py-[6%] md:py-[8%] relative w-full"
        data-name="Onboarding Hero"
        data-node-id="9:91"
      >
        {/* Neria Response Animation */}
        {neriaResponse ? (
          <div className="w-full mb-8">
            <NeriaResponse 
              response={neriaResponse} 
              isVisible={true} 
              onComplete={onNeriaComplete} 
              onExitComplete={onExitComplete}
              isStrategy={isStrategy} 
            />
          </div>
        ) : null}
      </div>

      {/* Removed collecting status indicator */}
    </>
  );
}


