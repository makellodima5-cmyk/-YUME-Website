/**
 * Shared YUBERA wordmark used by the website and Telegram Mini App.
 * The source is the optimized transparent WebP asset committed under public/images.
 */
export function Logo() {
  return (
    <img
      src="/images/yubera/yubera_logo.webp"
      alt="YUBERA"
      width={2172}
      height={724}
      className="h-auto w-[124px] shrink-0 object-contain select-none md:w-[148px]"
      draggable={false}
    />
  );
}
