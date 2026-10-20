import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Home, LayoutGrid, Library, User, Menu, X, Bell, Settings, Moon, Sun, ShieldCheck, Heart, Clock3, Star } from "lucide-react";
import { Logo } from "./Logo";
import { useYumePreferences, type TranslationKey } from "@/data/preferences";

export type View = "home" | "catalog" | "collections" | "profile";

export const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: LayoutGrid },
  { id: "collections", label: "Подборки", icon: Library },
  { id: "profile", label: "Профиль", icon: User },
];

type Props = {
  view: View;
  setView: (v: View) => void;
  onProfile: () => void;
};

type DragGeometry = { leftPercent: number; widthPercent: number };

export function Header({ view, setView, onProfile }: Props) {
  const { t, theme, setTheme } = useYumePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const navLabels: Record<View, TranslationKey> = {
    home: "nav.home",
    catalog: "nav.catalog",
    collections: "nav.collections",
    profile: "nav.profile",
  };
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    moved: boolean;
  } | null>(null);
  const suppressDragClickRef = useRef(false);
  const [dragGeometry, setDragGeometry] = useState<DragGeometry | null>(null);
  const activeIndex = Math.max(0, NAV.findIndex((item) => item.id === view));

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-nav-id]")) return;

    suppressDragClickRef.current = false;
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    const nav = mobileNavRef.current;
    if (!pointer || !nav || pointer.pointerId !== event.pointerId) return;

    const deltaXFromStart = event.clientX - pointer.startX;
    const deltaYFromStart = event.clientY - pointer.startY;
    // Keep normal vertical page scrolling separate from the horizontal tab gesture.
    if (Math.abs(deltaYFromStart) > 12 && Math.abs(deltaYFromStart) > Math.abs(deltaXFromStart)) return;
    if (Math.abs(deltaXFromStart) < 8) return;

    pointer.moved = true;
    const bounds = nav.getBoundingClientRect();
    const localX = Math.max(4, Math.min(bounds.width - 4, event.clientX - bounds.left));
    const slotWidth = bounds.width / NAV.length;
    const baseWidth = Math.max(0, slotWidth - 8);

    // Stretch the glass pill in proportion to the current finger movement.
    // The pill follows the finger continuously; it returns to a regular tab width on release.
    const deltaX = event.clientX - pointer.lastX;
    const stretch = Math.min(Math.abs(deltaX) * 1.8, slotWidth * 0.48);
    const pillWidth = Math.min(bounds.width - 8, baseWidth + stretch);
    // Bias the stretch behind the moving finger, like a soft elastic tab indicator.
    const trailingOffset = deltaX > 0 ? stretch * 0.28 : deltaX < 0 ? -stretch * 0.28 : 0;
    const left = Math.max(4, Math.min(bounds.width - pillWidth - 4, localX - pillWidth / 2 - trailingOffset));
    setDragGeometry({
      leftPercent: (left / bounds.width) * 100,
      widthPercent: (pillWidth / bounds.width) * 100,
    });
    pointer.lastX = event.clientX;

  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    const nav = mobileNavRef.current;
    if (!pointer || !nav || pointer.pointerId !== event.pointerId) return;

    if (pointer.moved) {
      suppressDragClickRef.current = true;
      const bounds = nav.getBoundingClientRect();
      const clampedX = Math.max(bounds.left, Math.min(bounds.right - 1, event.clientX));
      const slotWidth = bounds.width / NAV.length;
      const index = Math.max(0, Math.min(NAV.length - 1, Math.floor((clampedX - bounds.left) / slotWidth)));
      const destination = NAV[index]!.id;
      // Keep the current page while dragging; navigate only once the gesture ends.
      if (destination !== view) setView(destination);
    }

    pointerRef.current = null;
    setDragGeometry(null);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerRef.current?.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    suppressDragClickRef.current = false;
    setDragGeometry(null);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressDragClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDragClickRef.current = false;
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 w-full border-b border-white/10 bg-background/90 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition hover:bg-primary/10">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => { setView("home"); setMenuOpen(false); }} aria-label="YUME — главная" className="shrink-0"><Logo /></button>
          <div className="hidden min-w-0 flex-1 md:block" />
          <div className="ml-auto flex items-center gap-2">
            <button type="button" aria-label="Уведомления" title="Уведомления скоро появятся" className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-primary/10"><Bell className="h-5 w-5" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" /></button>
            <button onClick={onProfile} aria-label={t("nav.profileButton")} className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-foreground transition hover:bg-primary/20"><User className="h-5 w-5" /></button>
          </div>
        </div>
      </header>
      {menuOpen && <><button type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" /><aside className="fixed bottom-0 left-0 top-16 z-50 flex w-[min(82vw,290px)] flex-col border-r border-border bg-background/95 p-4 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">YUME · Навигация</div>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {NAV.filter((item) => item.id !== "profile").map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => { setView(item.id); setMenuOpen(false); }} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${view === item.id ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-primary/10"}`}><Icon className="h-5 w-5" />{t(navLabels[item.id])}</button>;
          })}
          <button type="button" onClick={() => { setView("catalog"); setMenuOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground/80 hover:bg-primary/10"><Star className="h-5 w-5" />Популярное</button>
          <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground/80 hover:bg-primary/10"><Heart className="h-5 w-5" />Избранное</button>
          <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground/80 hover:bg-primary/10"><Clock3 className="h-5 w-5" />История</button>
          <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground/80 hover:bg-primary/10"><Settings className="h-5 w-5" />Настройки и политика конфиденциальности</button>
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">{theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</span>Тема оформления</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTheme("light")} className={`rounded-lg px-2 py-2 text-xs ${theme === "light" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>Светлая</button>
            <button type="button" onClick={() => setTheme("dark")} className={`rounded-lg px-2 py-2 text-xs ${theme === "dark" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>Тёмная</button>
          </div>
        </div>
      </aside></>}


      <nav
        ref={mobileNavRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        aria-label={t("nav.main")}
        className="fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-2xl glass-liquid ring-1 ring-white/25 shadow-[0_12px_50px_rgba(0,0,0,0.55),0_0_30px_rgba(174,66,255,0.2)] select-none [touch-action:pan-y] [-webkit-tap-highlight-color:transparent] md:hidden"
      >
        <div className="relative grid grid-cols-4">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-1 top-1 z-0 rounded-xl glass-active ${dragGeometry ? "transition-[width] duration-100 ease-out" : "transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"}`}
            style={{
              left: dragGeometry ? `${dragGeometry.leftPercent}%` : `calc(${activeIndex * 25}% + 4px)`,
              width: dragGeometry ? `${dragGeometry.widthPercent}%` : "calc(25% - 8px)",
            }}
          />
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              data-nav-id={n.id}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => setView(n.id)}
              className={`relative z-10 flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-colors duration-200 focus:outline-none touch-manipulation ${view === n.id ? "text-white" : "text-white/65 hover:text-white"}`}
            >
              <n.icon className="h-5 w-5" />
              {t(navLabels[n.id])}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
