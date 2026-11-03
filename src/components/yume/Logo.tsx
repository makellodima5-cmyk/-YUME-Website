import logoArtwork from "@/assets/DF5D40FA-7E17-4527-9130-E3E489578CD8.webp";

/**
 * Yubera wordmark artwork: Yubera wordmark without tagline.
 */
export function Logo() {
  return (
    <img
      src={logoArtwork}
      alt="Yubera"
      width={500}
      height={200}
      className="h-auto w-[124px] shrink-0 object-contain select-none md:w-[148px]"
      draggable={false}
    />
  );
}
