import logoArtwork from "@/assets/yume-logo.webp";

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
      className="h-auto w-[104px] shrink-0 object-contain mix-blend-screen select-none md:w-[124px]"
      draggable={false}
    />
  );
}
