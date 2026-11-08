import { ArrowLeft, Bell, Search } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
import { telegramHapticImpact } from "@/lib/telegram-mini-app";
import { Logo } from "./Logo";

export type View =
  | "home" | "admin" | "catalog" | "collections" | "my" | "news" | "profile"
  | "login" | "register" | "popular" | "new-releases" | "announcements" | "airing"
  | "favorites" | "watchlist" | "history" | "privacy" | "privacy-policy" | "rules"
  | "rights" | "notifications" | "tracked-titles";

type Props = {
  setView: (view: View) => void;
  unreadNotificationCount?: number;
  variant?: "app" | "detail";
};

/**
 * Compact Android-style app bar. All primary navigation lives in the
 * persistent five-destination bottom bar; this header only exposes search
 * and the notification centre.
 */
export function Header({ setView, unreadNotificationCount = 0, variant = "app" }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";

  return (
    <header className="yubera-topbar">
      <div className="yubera-topbar-inner">
        <div className="flex min-w-0 items-center gap-3">
          {variant === "detail" && <button type="button" onClick={() => setView("catalog")} aria-label={ru ? "Назад в каталог" : "Back to catalog"} className="grid h-10 w-8 shrink-0 place-items-center text-foreground"><ArrowLeft className="h-6 w-6" /></button>}
          <button
            type="button"
            onClick={() => { telegramHapticImpact("light"); setView("home"); }}
            aria-label="YUBERA — главная"
            className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Logo />
          </button>
        </div>

        {variant === "app" && <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { telegramHapticImpact("light"); setView("catalog"); }}
            aria-label={ru ? "Поиск аниме" : "Search anime"}
            title={ru ? "Поиск" : "Search"}
            className="yubera-topbar-action"
          >
            <Search className="h-6 w-6" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => { telegramHapticImpact("light"); setView("notifications"); }}
            aria-label={ru ? "Уведомления" : "Notifications"}
            title={ru ? "Уведомления" : "Notifications"}
            className="yubera-topbar-action"
          >
            <Bell className="h-6 w-6" strokeWidth={2} />
            {unreadNotificationCount > 0 && <span className="yubera-topbar-dot" aria-hidden="true" />}
          </button>
        </div>}
      </div>
    </header>
  );
}
