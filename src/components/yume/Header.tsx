import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarDays, Home, LayoutGrid, Library, User } from "lucide-react";
import { Logo } from "./Logo";

export type View = "home" | "catalog" | "collections" | "schedule";

export const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: LayoutGrid },
  { id: "collections", label: "Подборки", icon: Library },
  { id: "schedule", label: "Расписание", icon: CalendarDays },
];

type Props = {
  view: View;
  setView: (v: View) => void;
  onProfile: () => void;
};

type DragGeometry = { leftPercent: number; widthPercent: number };

export function Header({ view, setView, onProfile }: Props) {
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
      <header className="fixed inset-x-0 top-0 z-40 w-full overflow-hidden rounded-none border-b border-white/10 bg-[#090714]/95 shadow-[0_8px_28px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="flex h-16 items-center gap-6 px-4 md:px-10">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${view === n.id ? "glass-active text-white shadow-[0_0_24px_rgba(208,90,255,0.42)]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <button onClick={onProfile} aria-label="Профиль" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl transition hover:bg-white/20 md:ml-0">
            <User className="h-5 w-5" />
          </button>
        </div>
      </header>

      <nav
        ref={mobileNavRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        aria-label="Основная навигация"
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
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
