const imgMaterialSymbolsRefreshRounded = "/figma/4c1ed6096d75bb1e0b4aaf60d7b5987063794d9e.svg";

interface RefreshContainerProps {
  lastUpdated?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

function getTimeAgo(dateString?: string): string {
  if (!dateString) return "NEVER";
  
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffInMinutes = Math.floor((now - then) / (1000 * 60));
  
  if (diffInMinutes < 1) return "JUST NOW";
  if (diffInMinutes === 1) return "1 MINUTE AGO";
  if (diffInMinutes < 60) return `${diffInMinutes} MINUTES AGO`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) return "1 HOUR AGO";
  if (diffInHours < 24) return `${diffInHours} HOURS AGO`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "1 DAY AGO";
  return `${diffInDays} DAYS AGO`;
}

export default function RefreshContainer({ lastUpdated, onRefresh, isLoading }: RefreshContainerProps) {
  return (
    <div className="flex gap-3.5 items-center justify-start relative w-full" data-name="Refresh Container" data-node-id="57:3">
      <button 
        onClick={onRefresh}
        disabled={isLoading}
        className="flex gap-[9px] items-center justify-start relative shrink-0 hover:opacity-70 transition-opacity disabled:opacity-50" 
        data-name="Refresh CTA" 
        data-node-id="57:2"
      >
        <div className={`relative shrink-0 size-5 ${isLoading ? 'animate-spin' : ''}`} data-name="material-symbols:refresh-rounded" data-node-id="44:605">
          <img alt="Refresh" className="block max-w-none size-full" src={imgMaterialSymbolsRefreshRounded} />
        </div>
        <div className="font-bold leading-[0] not-italic relative shrink-0 text-[18px] text-black text-nowrap" data-node-id="44:604">
          <p className="leading-[normal] whitespace-pre">{isLoading ? 'Refreshing...' : 'Refresh'}</p>
        </div>
      </button>
      <div className="basis-0 font-normal grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[#6268a3] text-[14px]" data-node-id="44:608">
        <p className="leading-[normal]">LAST UPDATED {getTimeAgo(lastUpdated)}</p>
      </div>
    </div>
  );
}
