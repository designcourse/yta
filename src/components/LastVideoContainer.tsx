const imgViewIcon = "/figma/177fa6a4159e356e8c850a9c99d1671a523fa1c5.svg";
const imgCommentIcon = "/figma/838e7355197bfe24b4b705b8565cfbacc6e102d4.svg";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

interface VideoData {
  video_id: string;
  video_title: string;
  thumbnail_url: string;
  view_count: number;
  comment_count: number;
  published_at: string;
  stats_retrieved_at: string;
}

interface LastVideoContainerProps {
  videoData?: VideoData;
}

export default function LastVideoContainer({ videoData }: LastVideoContainerProps) {
  return (
    <div className="bg-white relative rounded-[15px] w-full h-32" data-name="Last Video Container" data-node-id="44:576">
      <div className="box-border flex gap-[25px] items-center justify-start overflow-clip p-[10px] relative w-full h-full">
        <div className="bg-center bg-cover bg-no-repeat h-[108px] rounded-[6px] shrink-0 w-[178px]" data-name="Video Thumbnail" data-node-id="44:577" style={{ backgroundImage: `url('${videoData?.thumbnail_url || '/figma/44d339b12725a1c72f9c2d421872e55e9794d75d.png'}')` }} />
        <div className="flex flex-col gap-[15px] grow items-start justify-start min-h-px min-w-px relative shrink-0" data-name="Video Info Container" data-node-id="57:7">
          <div className="font-bold leading-[24px] min-w-full not-italic relative shrink-0 text-[28px] text-black" data-node-id="44:584">
            <p className="leading-[24px] truncate">{videoData?.video_title || "TOP 10 GUITAR SOLOS OF 2025."}</p>
          </div>
          <div className="flex gap-[23px] items-center justify-start relative shrink-0" data-name="Video Meta Data" data-node-id="57:6">
            <div className="flex gap-1.5 items-center justify-start relative shrink-0" data-name="Views Container" data-node-id="57:4">
              <div className="relative shrink-0 size-6" data-name="View Icon" data-node-id="44:588">
                <img alt="Views" className="block max-w-none size-full" src={imgViewIcon} />
              </div>
              <div className="font-normal leading-[24px] not-italic relative shrink-0 text-[19px] text-black text-nowrap" data-node-id="44:585">
                <p className="leading-[24px] whitespace-pre">{formatNumber(videoData?.view_count || 1200)}</p>
              </div>
            </div>
            <div className="flex gap-1.5 items-center justify-start relative shrink-0" data-name="Comments Container" data-node-id="57:5">
              <div className="relative shrink-0 size-6" data-name="Comment Icon" data-node-id="44:595">
                <img alt="Comments" className="block max-w-none size-full" src={imgCommentIcon} />
              </div>
              <div className="font-normal leading-[24px] not-italic relative shrink-0 text-[19px] text-black text-nowrap" data-node-id="44:590">
                <p className="leading-[24px] whitespace-pre">{formatNumber(videoData?.comment_count || 15)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="absolute border-2 border-[#3086ff] border-solid inset-0 pointer-events-none rounded-[15px]" />
    </div>
  );
}
