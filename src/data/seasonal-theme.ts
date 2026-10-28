import { useEffect, useState } from "react";

export const SEASON_THEME_CHANGED_EVENT = "yume-season-theme-changed";
export const HALLOWEEN_TIME_ZONE = "Europe/Berlin";

/** Halloween runs from October 28 through November 2, inclusive, every year. */
export function isHalloweenSeason(date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: HALLOWEEN_TIME_ZONE,
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    return (month === 10 && day >= 28) || (month === 11 && day <= 2);
  } catch {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return (month === 10 && day >= 28) || (month === 11 && day <= 2);
  }
}

export function applySeasonalTheme(): boolean {
  if (typeof document === "undefined") return false;
  const active = isHalloweenSeason();
  const previous = document.documentElement.dataset.season === "halloween";
  if (active) document.documentElement.dataset.season = "halloween";
  else delete document.documentElement.dataset.season;
  if (previous !== active && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SEASON_THEME_CHANGED_EVENT));
  }
  return active;
}

/** Reads the root-level season flag so all seasonal components change in sync. */
export function useHalloweenSeason(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(document.documentElement.dataset.season === "halloween");
    sync();
    window.addEventListener(SEASON_THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SEASON_THEME_CHANGED_EVENT, sync);
  }, []);
  return active;
}
