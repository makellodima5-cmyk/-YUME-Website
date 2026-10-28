import {
  getActiveAdvertisement,
  type AdvertisingSlotId,
} from "@/data/advertising";

interface AdvertisingSlotProps {
  slot: AdvertisingSlotId;
  language: "ru" | "en";
}

export function AdvertisingSlot({ slot, language }: AdvertisingSlotProps) {
  const advertisement = getActiveAdvertisement(slot);

  // No campaign means no element, no reserved height and no empty placeholder.
  if (!advertisement || !advertisement.asset || !advertisement.href) return null;

  const isEnglish = language === "en";
  const label = isEnglish ? "Advertisement" : "Реклама";
  const destinationLabel = isEnglish
    ? "Visit advertiser's website"
    : "Перейти на сайт рекламодателя";

  return (
    <aside
      aria-label={label}
      className="mx-4 my-7 md:mx-10 md:my-9"
      data-ad-slot={slot}
    >
      <div className="mx-auto w-full max-w-6xl">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
          {advertisement.advertiser ? ` · ${advertisement.advertiser}` : ""}
        </p>

        {advertisement.format === "image" ? (
          <a
            href={advertisement.href}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            aria-label={advertisement.alt}
            className="block overflow-hidden rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src={advertisement.asset}
              alt={advertisement.alt}
              loading="lazy"
              decoding="async"
              className="mx-auto block h-auto max-h-[360px] w-full rounded-2xl object-contain"
            />
          </a>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-black/20">
            <div className="mx-auto aspect-video w-full max-w-5xl">
              <video
                className="h-full w-full object-contain"
                src={advertisement.asset}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={advertisement.alt}
              >
                {isEnglish
                  ? "Your browser does not support video playback."
                  : "Ваш браузер не поддерживает воспроизведение видео."}
              </video>
            </div>
            <div className="px-3 py-3 text-right sm:px-4">
              <a
                href={advertisement.href}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {destinationLabel}
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
