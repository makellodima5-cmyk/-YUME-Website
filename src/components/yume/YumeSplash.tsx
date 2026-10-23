import { useEffect, useState } from "react";
import { Logo } from "@/components/yume/Logo";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";

type SplashProps = {
  /** True when the home view has mounted. */
  contentReady?: boolean;
};

const SPLASH_PROGRESS_DURATION_MS = 8000;
const SPLASH_EXIT_DURATION_MS = 350;

export function YumeSplash({ contentReady = false }: SplashProps) {
  // Keep the splash in the server-rendered markup. The early head script marks
  // Telegram sessions before the browser can paint the home page.
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);

  useEffect(() => {
    const isTelegram = Boolean(getTelegramWebApp()?.initData);
    if (!isTelegram) {
      setVisible(false);
      return;
    }

    const root = document.documentElement;
    root.classList.add("telegram-mini-app");
    root.dataset.yumeSplashActive = "true";

    const startedAt = window.performance.now();
    const progressInterval = window.setInterval(() => {
      const elapsed = window.performance.now() - startedAt;
      const nextProgress = Math.min(100, Math.floor((elapsed / SPLASH_PROGRESS_DURATION_MS) * 100));
      setProgress(nextProgress);
    }, 75);

    const finishTimer = window.setTimeout(() => {
      window.clearInterval(progressInterval);
      setProgress(100);
      setMinimumTimePassed(true);
    }, SPLASH_PROGRESS_DURATION_MS);

    return () => {
      window.clearInterval(progressInterval);
      window.clearTimeout(finishTimer);
    };
  }, []);

  useEffect(() => {
    if (!visible || !minimumTimePassed || !contentReady) return;

    setLeaving(true);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      // Restore the app's selected light/dark theme as soon as the splash exits.
      delete document.documentElement.dataset.yumeSplashActive;
    }, SPLASH_EXIT_DURATION_MS);
    return () => window.clearTimeout(hideTimer);
  }, [contentReady, minimumTimePassed, visible]);

  if (!visible) return null;

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
      aria-label={`Загрузка YUME: ${progress}%`}
      aria-live="off"
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
        <div className="yume-splash__logo-stage">
          <span className="yume-splash__origin-point" aria-hidden="true" />
          <div className="yume-splash__logo">
            <Logo />
          </div>
          <div className="yume-splash__logo-lit" aria-hidden="true">
            <Logo />
          </div>
        </div>
        <div className="yume-splash__loading">
          <div className="yume-splash__spinner" aria-hidden="true" />
          <div className="yume-splash__loading-copy">
            <p>Загрузка...</p>
            <span>{progress}%</span>
          </div>
        </div>
      </div>
      <span className="sr-only">Загрузка YUME, {progress}%</span>
    </div>
  );
}
