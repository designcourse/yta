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
      <div className="hidden" />

      {/* Removed collecting status indicator */}
    </>
  );
}


