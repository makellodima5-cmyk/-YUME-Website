import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Header, type View } from "@/components/yume/Header";
import { Grid, SectionBanner } from "@/components/yume/Sections";
import { getShikimoriAnimeDetails } from "@/data/shikimori";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import { canonicalUrl } from "@/data/seo";

export const Route = createFileRoute("/anime/$animeId/similar")({
  staleTime: 30_000,
  loader: async ({ params }) => {
    const result = await getShikimoriAnimeDetails({ data: { animeId: params.animeId } });
    if (!result.anime && !result.apiError) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const anime = loaderData?.anime;
    const title = anime ? `Похожие аниме — ${anime.title} | Yubera` : "Похожие аниме | Yubera";
    const description = anime
      ? `Аниме, похожие на «${anime.title}», в каталоге Yubera.`
      : "Подборка похожих аниме в каталоге Yubera.";
    const canonical = anime
      ? canonicalUrl(`/anime/${encodeURIComponent(anime.id)}/similar`)
      : canonicalUrl("/");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: SimilarAnimePage,
});

function SimilarAnimePage() {
  const { anime, relatedAnime, apiError } = Route.useLoaderData();
  const { animeId } = Route.useParams();
  const navigate = useNavigate();
  const { language } = useYumePreferences();

  const setView = (view: View) => {
    if (view === "catalog") {
      void navigate({ to: "/anime/$animeId", params: { animeId } });
      return;
    }
    void navigate({ to: "/", search: { section: view } });
  };

  if (!anime) {
    return (
      <div className="min-h-screen pb-8">
        <Header setView={setView} variant="detail" />
        <main id="main-content" className="px-3 pb-12 pt-[78px] sm:px-4 md:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center">
            <h1 className="text-xl font-bold">{language === "ru" ? "Не удалось открыть похожие тайтлы" : "Similar titles are unavailable"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{apiError}</p>
          </div>
        </main>
      </div>
    );
  }

  const pageTitle = language === "ru" ? "Похожие аниме" : "Similar anime";
  const subtitle = language === "ru"
    ? `Тайтлы, похожие на «${displayAnimeTitle(anime, language)}»`
    : `Titles similar to “${displayAnimeTitle(anime, language)}”`;

  return (
    <div className="min-h-screen pb-8">
      <Header setView={setView} variant="detail" />
      <main id="main-content" className="px-3 pb-12 pt-[78px] sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          {apiError && (
            <p role="status" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
              {language === "ru" ? "Shikimori временно недоступен. Показаны сохранённые данные." : "Shikimori is temporarily unavailable. Saved data is shown."}
            </p>
          )}
          <SectionBanner title={pageTitle} subtitle={subtitle} />
          <Grid
            items={relatedAnime}
            onSelect={(item) => void navigate({ to: "/anime/$animeId", params: { animeId: item.id } })}
            empty={language === "ru" ? "Похожие тайтлы не найдены." : "No similar titles were found."}
          />
        </div>
      </main>
    </div>
  );
}
