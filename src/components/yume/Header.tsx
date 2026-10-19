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
        className="h-10 w-full rounded-full bg-input pl-9 pr-4 text-sm outline-none ring-1 ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
    </label>
  );
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 glass border-b">
        <div className="flex h-16 items-center gap-6 px-4 md:px-10">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${view === n.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto hidden w-72 md:flex lg:w-96">{search}</div>
          <button onClick={onProfile} aria-label="Профиль" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border transition hover:ring-primary md:ml-0">
            <User className="h-5 w-5" />
          </button>
        </div>
        <div className="flex px-4 pb-3 md:hidden">{search}</div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 glass border-t md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${view === n.id ? "text-primary" : "text-muted-foreground"}`}>
              <n.icon className="h-5 w-5" />
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}