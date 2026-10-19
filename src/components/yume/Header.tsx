import { CalendarDays, Home, LayoutGrid, Library, Search, User } from "lucide-react";
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
  query: string;
  setQuery: (q: string) => void;
  onProfile: () => void;
};

export function Header({ view, setView, query, setQuery, onProfile }: Props) {
  const search = (
    <label className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск аниме, жанра…"
        aria-label="Поиск"
        className="glass-search h-11 w-full rounded-full pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/60 focus:ring-2 focus:ring-primary/70"
      />
    </label>
  );
  return (
    <>
      <header className="fixed inset-x-3 top-3 z-40 overflow-hidden rounded-2xl glass-liquid ring-1 ring-white/20 md:inset-x-4 md:top-3">
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
          <div className="ml-auto hidden w-72 md:flex lg:w-96">{search}</div>
          <button onClick={onProfile} aria-label="Профиль" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl transition hover:bg-white/20 md:ml-0">
            <User className="h-5 w-5" />
          </button>
        </div>
        <div className="flex px-4 pb-3 md:hidden">{search}</div>
      </header>

      <nav className="fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-2xl glass-liquid ring-1 ring-white/25 shadow-[0_12px_50px_rgba(0,0,0,0.55),0_0_30px_rgba(174,66,255,0.2)] md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} className={`relative flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-all duration-300 ${view === n.id ? "glass-active mx-1 my-1 rounded-xl text-white" : "text-white/65 hover:text-white"}`}>
              <n.icon className="h-5 w-5" />
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}