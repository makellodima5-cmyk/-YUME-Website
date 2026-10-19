import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Copyright,
  FileText,
  Heart,
  Info,
  Languages,
  LifeBuoy,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Anime } from "@/data/anime";
import { useYumePreferences } from "@/data/preferences";
import { AnimeCard, PosterArt } from "./Poster";
import { Grid } from "./Sections";
import {
  FAVORITES_STORAGE_KEY,
  PROFILE_UPDATED_EVENT,
  readSavedAnimeIds,
  WATCHLIST_STORAGE_KEY,
} from "@/data/profile-storage";

type ProfilePanel =
  | "overview"
  | "favorites"
  | "watchlist"
  | "settings"
  | "documents"
  | "privacy"
  | "rules"
  | "rights"
  | "about"
  | "support";

type Props = {
  animeList: Anime[];
  onSelect: (anime: Anime) => void;
  onCatalog: () => void;
};

export function Profile({ animeList, onSelect, onCatalog }: Props) {
  const { t, language, setLanguage, theme, setTheme } = useYumePreferences();
  const [panel, setPanel] = useState<ProfilePanel>("overview");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);

  useEffect(() => {
    const syncLists = () => {
      setFavoriteIds(readSavedAnimeIds(FAVORITES_STORAGE_KEY));
      setWatchlistIds(readSavedAnimeIds(WATCHLIST_STORAGE_KEY));
    };
    syncLists();
    window.addEventListener(PROFILE_UPDATED_EVENT, syncLists);
    window.addEventListener("storage", syncLists);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncLists);
      window.removeEventListener("storage", syncLists);
    };
  }, []);

  const favorites = useMemo(
    () => favoriteIds.map((id) => animeList.find((anime) => anime.id === id)).filter((anime): anime is Anime => Boolean(anime)),
    [animeList, favoriteIds],
  );
  const watchlist = useMemo(
    () => watchlistIds.map((id) => animeList.find((anime) => anime.id === id)).filter((anime): anime is Anime => Boolean(anime)),
    [animeList, watchlistIds],
  );

  const panelTitles: Record<ProfilePanel, string> = {
    overview: t("profile.title"),
    favorites: t("profile.favorites"),
    watchlist: t("profile.watchlist"),
    settings: t("profile.settings"),
    documents: t("profile.documents"),
    privacy: t("profile.privacy"),
    rules: t("profile.rules"),
    rights: t("profile.rights"),
    about: t("profile.about"),
    support: t("profile.support"),
  };
  const backPanel: ProfilePanel = panel === "privacy" || panel === "rules" || panel === "rights"
    ? "documents"
    : "overview";

  const navigatePanel = (next: ProfilePanel) => {
    setPanel(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const profileRow = (
    icon: typeof Heart,
    title: string,
    subtitle: string,
    next: ProfilePanel,
  ) => (
    <button
      key={title}
      type="button"
      onClick={() => navigatePanel(next)}
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-card/65 p-3.5 text-left transition hover:border-primary/35 hover:bg-accent/70 sm:p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {(() => {
          const Icon = icon;
          return <Icon className="h-5 w-5" />;
        })()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );

  const backButton = (target: ProfilePanel = backPanel) => (
    <button
      type="button"
      onClick={() => navigatePanel(target)}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {target === "documents" ? t("profile.backLegal") : t("profile.back")}
    </button>
  );

  const emptyLibrary = (title: string, description: string) => (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bookmark className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onCatalog}
        className="mt-5 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110"
      >
        {t("profile.goCatalog")}
      </button>
    </div>
  );

  return (
    <main className="px-4 pb-12 pt-28 md:px-10 md:pb-16 md:pt-28">
      <div className="mx-auto max-w-6xl">
        {panel === "overview" ? (
          <>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#120C20] p-5 shadow-[0_16px_55px_rgba(0,0,0,0.2)] sm:p-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl"
              />
              <div className="relative flex items-center gap-4">
                <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border border-primary/50 bg-gradient-to-br from-primary/40 to-fuchsia-400/10 shadow-[0_0_32px_rgba(208,90,255,0.15)] sm:h-20 sm:w-20">
                  <UserRound className="h-9 w-9 text-white sm:h-10 sm:w-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Личное пространство</p>
                  <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Мой профиль</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Твоя коллекция и настройки YUME</p>
                </div>
              </div>
              <div className="relative mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
                <button
                  type="button"
                  onClick={() => navigatePanel("favorites")}
                  className="rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="text-2xl font-bold tabular-nums">{favorites.length}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">В избранном</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigatePanel("watchlist")}
                  className="rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="text-2xl font-bold tabular-nums">{watchlist.length}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">В моём списке</span>
                </button>
              </div>
            </div>

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Избранное</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigatePanel("favorites")}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition hover:text-neon"
                >
                  Все <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {favorites.length ? (
                <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
                  {favorites.slice(0, 4).map((anime) => (
                    <button
                      key={anime.id}
                      type="button"
                      aria-label={anime.title}
                      onClick={() => onSelect(anime)}
                      className="group w-[88px] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 transition hover:-translate-y-1 hover:ring-primary sm:w-[104px]"
                    >
                      <PosterArt anime={anime} className="aspect-[2/3] w-full transition duration-300 group-hover:scale-[1.02]" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
                  <Heart className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Пока здесь пусто</p>
                    <p className="mt-1 text-xs text-muted-foreground">Добавляй любимые тайтлы в избранное на странице аниме.</p>
                  </div>
                  <button type="button" onClick={onCatalog} className="shrink-0 text-sm font-semibold text-primary hover:text-neon">Каталог</button>
                </div>
              )}
            </section>

            <section className="mt-7 grid gap-2.5">
              {profileRow(Bookmark, {t("profile.watchlist")}, {t("profile.watchlistDescription")}, "watchlist")}
              {profileRow(Settings2, {t("profile.settings")}, {t("profile.settingsDescription")}, "settings")}
              {profileRow(ShieldCheck, {t("profile.legal")}, {t("profile.legalDescription")}, "documents")}
              {profileRow(Info, {t("profile.about")}, {t("profile.aboutDescription")}, "about")}
              {profileRow(LifeBuoy, {t("profile.support")}, {t("profile.supportDescription")}, "support")}
            </section>
          </>
        ) : (
          <>
            {backButton()}
            <div className="mb-6">
              <h1 className="text-2xl font-bold sm:text-3xl">{panelTitles[panel]}</h1>
              {panel === "watchlist" && <p className="mt-1 text-sm text-muted-foreground">Аниме, которые ты сохранил на потом</p>}
            </div>

            {panel === "favorites" && (
              favorites.length
                ? <Grid items={favorites} onSelect={onSelect} empty="В избранном пока нет тайтлов." />
                : emptyLibrary({t("profile.emptyFavoritesTitle")}, {t("profile.emptyFavoritesDescription")})
            )}

            {panel === "watchlist" && (
              watchlist.length
                ? <Grid items={watchlist} onSelect={onSelect} empty="В твоём списке пока нет тайтлов." />
                : emptyLibrary({t("profile.emptyWatchlistTitle")}, {t("profile.emptyWatchlistDescription")})
            )}

            {panel === "settings" && (
              <div className="grid max-w-3xl gap-4">
                <section className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sun className="h-5 w-5" /></span>
                    <div>
                      <h2 className="text-lg font-semibold">{t("settings.appearance")}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{t("settings.appearanceDescription")}</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 text-sm font-medium">{t("settings.theme")}</p>
                    <p className="mb-3 text-xs text-muted-foreground">{t("settings.themeDescription")}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([
                        { id: "dark", label: t("settings.dark"), icon: Moon },
                        { id: "light", label: t("settings.light"), icon: Sun },
                        { id: "system", label: t("settings.system"), icon: Monitor },
                      ] as const).map((option) => {
                        const Icon = option.icon;
                        const active = theme === option.id;
                        return (
                          <button key={option.id} type="button" aria-pressed={active} onClick={() => setTheme(option.id)}
                            className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition ${active ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30" : "border-border bg-secondary/45 text-muted-foreground hover:bg-accent"}`}>
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="min-w-0">{option.label}</span>
                            {active && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t("settings.systemDescription")}</p>
                  </div>
                  <div className="mt-6 border-t border-border pt-5">
                    <div className="flex items-center gap-3">
                      <Languages className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{t("settings.language")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("settings.languageDescription")}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {([
                        { id: "ru", label: t("settings.russian") },
                        { id: "en", label: t("settings.english") },
                      ] as const).map((option) => {
                        const active = language === option.id;
                        return (
                          <button key={option.id} type="button" aria-pressed={active} onClick={() => setLanguage(option.id)}
                            className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${active ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30" : "border-border bg-secondary/45 text-muted-foreground hover:bg-accent"}`}>
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{t("settings.savedOnDevice")}</p>
                  </div>
                </section>
                <section className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
                    <div>
                      <h2 className="text-lg font-semibold">{t("settings.preferences")}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("settings.preferencesDescription")}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    {t("settings.comingWithRecommendations")}
                  </div>
                </section>
              </div>
            )}

            {panel === "documents" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {profileRow(ShieldCheck, t("profile.privacy"), {t("profile.privacyDescription")}, "privacy")}
                {profileRow(FileText, t("profile.rules"), {t("profile.rulesDescription")}, "rules")}
                {profileRow(Copyright, t("profile.rights"), {t("profile.rightsDescription")}, "rights")}
              </div>
            )}

            {(panel === "privacy" || panel === "rules" || panel === "rights") && (
              <article className="max-w-3xl rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
                <p className="text-sm leading-relaxed text-muted-foreground">{t(panel === "privacy" ? "profile.privacyPlaceholder" : panel === "rules" ? "profile.rulesPlaceholder" : "profile.rightsPlaceholder")}</p>
                <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  Текст документа будет подготовлен и проверен перед полноценным запуском сайта.
                </p>
              </article>
            )}

            {panel === "about" && (
              <div className="max-w-3xl rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Info className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-semibold">YUME — больше чем аниме</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Каталог и личное пространство для любителей аниме.</p>
                  </div>
                </div>
                <div className="mt-5 divide-y divide-border">
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">Версия сайта</span>
                    <span className="font-medium">Тестовая сборка</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">Источник сведений об аниме</span>
                    <span className="font-medium">Shikimori</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">Состояние проекта</span>
                    <span className="font-medium">В разработке</span>
                  </div>
                </div>
              </div>
            )}

            {panel === "support" && (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 sm:p-8">
                <LifeBuoy className="h-7 w-7 text-primary" />
                <h2 className="mt-3 text-lg font-semibold">Раздел поддержки готовится</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Здесь появится способ сообщить о проблеме, задать вопрос или отправить предложение по улучшению YUME.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
