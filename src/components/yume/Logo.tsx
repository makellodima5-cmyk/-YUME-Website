import logoArtwork from "@/assets/yume-logo-new.png.PNG";

/**
 * YUME wordmark artwork: crescent moon and white serif lettering, without kanji.
 */
export function Logo() {
  return (
    <img
      src={logoArtwork}
      alt="YUME"
      width={2089}
      height={753}
      className="h-auto w-[124px] shrink-0 object-contain select-none md:w-[148px]"
      draggable={false}
    />
  );
}
