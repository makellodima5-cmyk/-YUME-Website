import { ArrowLeft, Bell } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
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
 * persistent five-destination bottom bar; this header only exposes the
 * notification centre.
 */
export function Header({ setView, unreadNotificationCount = 0, variant = "app" }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";

  return (
    <header className="yubera-topbar">
      <div className="yubera-topbar-inner">
        <div className="flex min-w-0 items-center gap-3">
          {variant === "detail" && <button type="button" onClick={() => setView("catalog")} aria-label={ru ? "Назад" : "Back"} className="grid h-10 w-8 shrink-0 place-items-center text-foreground"><ArrowLeft className="h-6 w-6" /></button>}
          <div className="shrink-0" aria-label="YUBERA">
            <Logo />
          </div>
        </div>

        {variant === "app" && <div className="yubera-topbar-actions flex items-center gap-1.5">
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
