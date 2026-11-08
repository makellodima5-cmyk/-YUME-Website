import { useCallback, useEffect, useMemo, useState } from "react";
import { Radio, RotateCcw } from "lucide-react";
import type { Anime } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { useYumePreferences } from "@/data/preferences";
import { Grid, SectionBanner } from "./Sections";
import type { View } from "./Header";

type Props = { animeList: Anime[]; onNavigate: (view: View) => void; onSelect: (anime: Anime) => void };

export function TrackedTitlesPage({ animeList, onNavigate, onSelect }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [extra, setExtra] = useState<Anime[]>([]);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState<string[]>([]);
  const byId = useMemo(() => new Map([...extra, ...animeList].map(item => [item.id, item])), [extra, animeList]);
  const missing = useMemo(() => ids.filter(id => !byId.has(id)), [ids, byId]);

  const load = useCallback(() => {
    setLoaded(false);
    setFailed(false);
    fetch("/api/anime-subscriptions", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as { subscriptions?: string[] };
        if (!response.ok || !Array.isArray(payload.subscriptions)) throw new Error("subscriptions_unavailable");
        setIds(payload.subscriptions.filter(id => /^\d{1,20}$/.test(id)));
      })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 35) chunks.push(missing.slice(i, i + 35));
    Promise.all(chunks.map(chunk => getShikimoriAnimes({ data: { ids: chunk.join(","), limit: chunk.length, order: "ranked" } })))
      .then(results => { if (!cancelled) setExtra(current => Array.from(new Map([...current, ...results.flatMap(result => result.items)].map(item => [item.id, item])).values())); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [missing]);

  const items = ids.map(id => byId.get(id)).filter((item): item is Anime => Boolean(item));
  const remove = async (anime: Anime) => {
    if (deleting.includes(anime.id)) return;
    setDeleting(current => [...current, anime.id]);
    try {
      const response = await fetch("/api/anime-subscriptions", { method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: anime.id }) });
      if (!response.ok) throw new Error("unsubscribe_failed");
      setIds(current => current.filter(id => id !== anime.id));
    } catch {
      setFailed(true);
    } finally {
      setDeleting(current => current.filter(id => id !== anime.id));
    }
  };

  return <main id="main-content" className="yubera-with-bottom-nav mx-auto w-full max-w-[1600px] px-3 pb-8 pt-[78px] sm:px-4 md:px-6 lg:px-8">
    <SectionBanner title={ru ? "Подписки на новые серии" : "New episode subscriptions"} subtitle={ru ? "Здесь будут отображаться аниме, за выходом новых серий которых ты следишь" : "Anime whose new episodes you follow will appear here"} />
    {failed && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm"><span>{ru ? "Не удалось обновить подписки." : "Could not update subscriptions."}</span><button type="button" onClick={load} className="inline-flex items-center gap-2 text-primary"><RotateCcw className="h-4 w-4" />{ru ? "Повторить" : "Retry"}</button></div>}
    {!loaded ? <p className="rounded-2xl border border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">{ru ? "Загружаем подписки…" : "Loading subscriptions…"}</p> :
      items.length ? <Grid items={items} onSelect={onSelect} empty="" onRemove={remove} removeLabel={ru ? "Отменить подписку" : "Unsubscribe"} /> :
      <section className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center"><Radio className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-bold">{ru ? "Пока нет отслеживаемых тайтлов" : "No tracked titles yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{ru ? "Подпишитесь на новые серии на странице аниме, и они появятся здесь." : "Subscribe to new episodes on an anime page and titles will appear here."}</p></section>}
    {loaded && missing.length > 0 && <p className="mt-4 text-xs text-muted-foreground">{ru ? "Часть постеров пока не удалось загрузить." : "Some posters could not be loaded."}</p>}
  </main>;
}
