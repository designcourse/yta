const imgIcon = "/assets/7eb54fd22a922dabecc0d418ad3cf042065f0708.svg";

export default function NoScriptLayout() {
  return (
    <div className="relative rounded-[13px] w-full" data-name="No Script Layout" data-node-id="81:733">
      <div className="box-border content-stretch flex gap-[86px] items-center justify-center overflow-clip p-[64px] relative w-full">
        <div className="h-[107.662px] relative shrink-0 w-[159.389px]" data-name="Icon" data-node-id="81:737">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="block max-w-none w-full h-full" src={imgIcon} />
        </div>
        <div className="basis-0 content-stretch flex flex-col gap-6 grow items-start justify-start leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-black" data-name="No Script Content" data-node-id="81:734">
          <div className="font-['Inter:Bold',_sans-serif] font-bold relative shrink-0 text-[26px] w-full" data-node-id="81:721">
            <p className="leading-[normal]">{`Want a script & assets for this video?`}</p>
          </div>
          <div className="font-['Inter:Regular',_sans-serif] font-normal h-[59px] relative shrink-0 text-[20px] w-full" data-node-id="81:722">
            <p className="leading-[30px]">Ask me in the chat to write a script / flow for this video, along with any specific instructions about the video length, tone, etc..</p>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[#c9cbdd] border-solid inset-0 pointer-events-none rounded-[13px]" />
    </div>
  );
}


