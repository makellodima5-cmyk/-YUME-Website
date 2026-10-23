import { useEffect, useState } from "react";
import { Logo } from "@/components/yume/Logo";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";

type SplashProps = {
  /** True when the home view has mounted. */
  contentReady?: boolean;
};

export function YumeSplash({ contentReady = false }: SplashProps) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [isTelegramSession, setIsTelegramSession] = useState(false);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);

  useEffect(() => {
    const isTelegram = Boolean(getTelegramWebApp()?.initData);
    setIsTelegramSession(isTelegram);
    if (!isTelegram) {
      setVisible(false);
      return;
    }
    const minimumTimer = window.setTimeout(() => setMinimumTimePassed(true), 1200);
    return () => window.clearTimeout(minimumTimer);
  }, []);

  useEffect(() => {
    if (!isTelegramSession || !visible || !minimumTimePassed || !contentReady) return;
    setLeaving(true);
    const hideTimer = window.setTimeout(() => setVisible(false), 520);
    return () => window.clearTimeout(hideTimer);
  }, [isTelegramSession, visible, minimumTimePassed, contentReady]);

  if (!visible || !isTelegramSession) return null;

  const petals = Array.from({ length: 16 }, (_, index) => ({
    id: index,
    left: `${(index * 37 + 11) % 100}%`,
    delay: `${(index % 8) * -1.35}s`,
    duration: `${8 + ((index * 13) % 7)}s`,
    size: `${14 + ((index * 11) % 16)}px`,
    drift: `${((index * 29) % 150) - 75}px`,
    rotate: `${(index * 47) % 360}deg`,
    blur: index % 5 === 0 ? "1px" : "0px",
    opacity: 0.38 + ((index * 7) % 40) / 100,
  }));

  return (
    <div
      className={`yume-splash fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden ${leaving ? "yume-splash--leaving" : ""}`}
      role="status"
      aria-label="YUME"
      aria-live="polite"
    >
      <div className="yume-splash__vignette" aria-hidden="true" />
      <div className="yume-splash__glow" aria-hidden="true" />
      <div className="yume-splash__spark" aria-hidden="true" />
      <div className="yume-splash__petals" aria-hidden="true">
        {petals.map((petal) => (
          <span
            key={petal.id}
            className="yume-splash__petal"
            style={{
              left: petal.left,
              animationDelay: petal.delay,
              animationDuration: petal.duration,
              width: petal.size,
              height: `calc(${petal.size} * 1.45)`,
              "--petal-drift": petal.drift,
              "--petal-rotate": petal.rotate,
              "--petal-blur": petal.blur,
              "--petal-opacity": petal.opacity,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="yume-splash__identity">
        <div className="yume-splash__logo"><Logo /></div>
        <p className="yume-splash__caption">YOUR UNIVERSE OF ANIME</p>
        <div className="yume-splash__loader" aria-hidden="true"><span /></div>
      </div>
      <span className="sr-only">Загрузка YUME…</span>
    </div>
  );
}
