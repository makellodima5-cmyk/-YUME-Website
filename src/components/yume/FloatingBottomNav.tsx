import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bookmark, Home, LayoutGrid, Newspaper, UserRound } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
import type { View } from "./Header";

type Props = {
  view: View;
  setView: (view: View) => void;
};

const destinations: Array<{ id: Extract<View, "home" | "catalog" | "my" | "news" | "profile">; label: { ru: string; en: string }; icon: typeof Home; matches: View[] }> = [
  { id: "home", label: { ru: "Главная", en: "Home" }, icon: Home, matches: ["home", "popular", "new-releases", "announcements", "airing", "collections"] },
  { id: "catalog", label: { ru: "Каталог", en: "Catalog" }, icon: LayoutGrid, matches: ["catalog"] },
  { id: "my", label: { ru: "Моё", en: "My" }, icon: Bookmark, matches: ["my", "favorites", "watchlist", "history", "tracked-titles", "notifications"] },
  { id: "news", label: { ru: "Новости", en: "News" }, icon: Newspaper, matches: ["news"] },
  { id: "profile", label: { ru: "Профиль", en: "Profile" }, icon: UserRound, matches: ["profile", "admin", "privacy", "privacy-policy", "rules", "rights"] },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function FloatingBottomNav({ view, setView }: Props) {
  const { language } = useYumePreferences();
  const activeIndex = Math.max(0, destinations.findIndex((item) => item.matches.includes(view)));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const previewIndex = dragIndex ?? activeIndex;

  const indexAt = (clientX: number) => {
    const rect = navRef.current?.getBoundingClientRect();
    if (!rect) return activeIndex;
    const horizontalInset = rect.width <= 360 ? 6 : 8;
    const usableWidth = Math.max(1, rect.width - horizontalInset * 2);
    return clamp(((clientX - rect.left - horizontalInset) / usableWidth) * destinations.length, 0, destinations.length - 1);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClickRef.current = false;
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        gestureRef.current = null;
        return;
      }
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      gesture.dragging = true;
      suppressClickRef.current = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional in embedded webviews. */ }
      setDragIndex(indexAt(event.clientX));
    }
    setDragIndex(indexAt(event.clientX));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (gesture.dragging) {
      event.preventDefault();
      const destination = destinations[Math.round(indexAt(event.clientX))];
      setDragIndex(null);
      if (destination) setView(destination.id);
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
    } else {
      setDragIndex(null);
    }
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    suppressClickRef.current = false;
    setDragIndex(null);
  };

  return (
    <nav
      ref={navRef}
      className="yubera-bottom-nav"
      aria-label={language === "ru" ? "Основная навигация" : "Main navigation"}
      data-dragging={dragIndex !== null ? "true" : "false"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(event) => {
        if (suppressClickRef.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }
      }}
    >
      <span
        className="yubera-bottom-nav-indicator"
        aria-hidden="true"
        style={{ transform: `translate3d(${previewIndex * 100}%,0,0)` }}
      />
      {destinations.map((item, index) => {
        const Icon = item.icon;
        const isActive = item.matches.includes(view);
        const isPreviewActive = Math.round(previewIndex) === index;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            aria-current={isActive ? "page" : undefined}
            data-preview-active={isPreviewActive ? "true" : "false"}
          >
            <Icon aria-hidden="true" />
            <span>{item.label[language === "ru" ? "ru" : "en"]}</span>
          </button>
        );
      })}
    </nav>
  );
}
