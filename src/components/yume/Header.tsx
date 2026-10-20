import { useEffect, useState } from "react";
import { Home, LayoutGrid, Library, User, Menu, X, Bell, Settings, Moon, Sun, ShieldCheck, Heart, Clock3, Star } from "lucide-react";
import { Logo } from "./Logo";
import { useYumePreferences, type TranslationKey } from "@/data/preferences";

export type View = "home" | "catalog" | "collections" | "profile";

export const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: LayoutGrid },
  { id: "collections", label: "Подборки", icon: Library },
];

type Props = {
  view: View;
  setView: (v: View) => void;
  onProfile: () => void;
};

export function Header({ view, setView, onProfile }: Props) {
  const { t, theme, setTheme } = useYumePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const navLabels: Record<"home" | "catalog" | "collections", TranslationKey> = {
    home: "nav.home",
    catalog: "nav.catalog",
    collections: "nav.collections",
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const goToView = (next: View) => {
    setView(next);
    setMenuOpen(false);
  };

  const navButtonClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors duration-200 ${active ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-primary/8 hover:text-foreground"}`;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 w-full border-b border-border bg-background shadow-sm">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="yume-navigation-drawer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition hover:bg-primary/10"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => goToView("home")} aria-label="YUME — главная" className="shrink-0">
            <Logo />
          </button>
          <div className="hidden min-w-0 flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              aria-label="Уведомления"
              title="Уведомления скоро появятся"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-primary/10"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
            <button
              type="button"
              onClick={onProfile}
              aria-label={t("nav.profileButton")}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-foreground transition hover:bg-primary/20"
            >
              <User className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/45"
          />
          <aside
            id="yume-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.main")}
            className="fixed bottom-0 left-0 top-16 z-50 flex w-1/2 min-w-[170px] max-w-[320px] flex-col border-r border-border bg-background p-3 shadow-2xl md:w-[290px] md:min-w-0 md:max-w-none md:p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">YUME · Навигация</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Закрыть меню"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition hover:bg-primary/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToView(item.id)}
                    aria-current={view === item.id ? "page" : undefined}
                    className={navButtonClass(view === item.id)}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{t(navLabels[item.id as keyof typeof navLabels])}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => goToView("catalog")} className={navButtonClass(view === "catalog")}>
                <Star className="h-5 w-5 shrink-0" /><span>Популярное</span>
              </button>
              <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className={navButtonClass(view === "profile")}>
                <Heart className="h-5 w-5 shrink-0" /><span>Избранное</span>
              </button>
              <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className={navButtonClass(false)}>
                <Clock3 className="h-5 w-5 shrink-0" /><span>История</span>
              </button>
              <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className={navButtonClass(false)}>
                <Settings className="h-5 w-5 shrink-0" /><span>Настройки</span>
              </button>
              <button type="button" onClick={() => { onProfile(); setMenuOpen(false); }} className={navButtonClass(false)}>
                <ShieldCheck className="h-5 w-5 shrink-0" /><span>Политика и правила</span>
              </button>
            </nav>

            <div className="mt-auto rounded-xl border border-border bg-card p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">Тема</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  aria-pressed={theme === "light"}
                  className={`rounded-lg px-2 py-2 text-xs transition ${theme === "light" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-primary/10"}`}
                >Светлая</button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  aria-pressed={theme === "dark"}
                  className={`rounded-lg px-2 py-2 text-xs transition ${theme === "dark" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-primary/10"}`}
                >Тёмная</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
