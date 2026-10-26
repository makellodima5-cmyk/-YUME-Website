import { useYumePreferences } from "@/data/preferences";
import { APP_VERSION } from "@/data/app-version";
export function Footer() {
  const { t, language } = useYumePreferences();

  return (
    <footer className="mt-16 border-t border-border/70 bg-card/20 px-4 pb-8 pt-7 md:px-10 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold tracking-wide text-foreground">YUME</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("footer.source")}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{language === "en" ? "Version" : "Версия"} {APP_VERSION}</p>
        </div>
        <nav aria-label={language === "en" ? "Legal information" : "Правовая информация"} className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:justify-end sm:text-sm">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("yume-open-cookie-settings"))} className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">{language === "en" ? "Cookie settings" : "Настройки cookies"}</button>
          <a href="/?section=privacy-policy" className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">{language === "en" ? "Privacy policy" : "Политика конфиденциальности"}</a>
          <a href="/?section=rights" className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">{language === "en" ? "For copyright holders" : "Для правообладателей"}</a>
          <a href="/?section=rules" className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">{language === "en" ? "Site rules" : "Правила сайта"}</a>
        </nav>
      </div>
    </footer>
  );
}
