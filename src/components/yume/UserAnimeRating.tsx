import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";

type RatingStats = {
  averageRating: number | null;
  voteCount: number;
  myRating: number | null;
};

type ApiRatingResponse = RatingStats & {
  animeId?: string;
  authenticated?: boolean;
  error?: string;
};

type Props = { animeId: string };

const EMPTY_STATS: RatingStats = {
  averageRating: null,
  voteCount: 0,
  myRating: null,
};

function parseStats(value: ApiRatingResponse): RatingStats {
  const voteCount = Number.isSafeInteger(value.voteCount) && value.voteCount > 0
    ? value.voteCount
    : 0;
  const averageRating = voteCount > 0 && typeof value.averageRating === "number" &&
    Number.isFinite(value.averageRating) && value.averageRating >= 1 && value.averageRating <= 10
    ? value.averageRating
    : null;
  const myRating = Number.isInteger(value.myRating) && Number(value.myRating) >= 1 &&
    Number(value.myRating) <= 10
    ? Number(value.myRating)
    : null;
  return { averageRating, voteCount, myRating };
}

export function UserAnimeRating({ animeId }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [stats, setStats] = useState<RatingStats>(EMPTY_STATS);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStats(EMPTY_STATS);
    setSelected(null);
    setLoading(true);
    setSaving(false);
    setError("");
    setNotice("");
    setAuthRequired(false);

    fetch("/api/anime-ratings?animeId=" + encodeURIComponent(animeId), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as ApiRatingResponse;
        if (!response.ok) throw new Error(payload.error ?? "ratings_unavailable");
        const next = parseStats(payload);
        setStats(next);
        setSelected(next.myRating);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(ru ? "Не удалось загрузить оценки. Попробуйте ещё раз позже." : "Could not load ratings. Please try again later.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [animeId, ru]);

  const canSubmit = selected !== null && selected !== stats.myRating && !loading && !saving;
  const voteCountLabel = stats.voteCount.toLocaleString(ru ? "ru-RU" : "en-US");
  const averageLabel = stats.voteCount > 0 && stats.averageRating !== null
    ? stats.averageRating.toFixed(1)
    : "—";

  const saveRating = async () => {
    if (!canSubmit || selected === null) return;
    setSaving(true);
    setError("");
    setNotice("");
    setAuthRequired(false);
    try {
      const response = await fetch("/api/anime-ratings", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, rating: selected }),
      });
      const payload = await response.json().catch(() => ({})) as ApiRatingResponse;
      if (response.status === 401) {
        setAuthRequired(true);
        setError(ru
          ? "Войдите через Telegram, чтобы сохранить свою оценку."
          : "Sign in with Telegram to save your rating.");
        return;
      }
      if (response.status === 404) {
        throw new Error(ru ? "Этот тайтл больше недоступен в каталоге." : "This title is no longer available in the catalogue.");
      }
      if (!response.ok) {
        throw new Error(ru ? "Не удалось сохранить оценку. Попробуйте ещё раз." : "Could not save your rating. Please try again.");
      }
      const next = parseStats(payload);
      setStats(next);
      setSelected(next.myRating ?? selected);
      setNotice(ru ? "Ваша оценка сохранена." : "Your rating has been saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось сохранить оценку." : "Could not save your rating."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="yubera-user-rating" aria-label={ru ? "Оценка пользователей" : "User rating"} aria-busy={loading || saving}>
      <div className="yubera-user-rating-heading">
        <div className="yubera-user-rating-title">
          <span className="yubera-user-rating-accent" aria-hidden="true" />
          <h2>{ru ? "Оценка пользователей" : "User rating"}</h2>
        </div>
        <div className="yubera-user-rating-summary" aria-live="polite">
          <strong>{averageLabel}</strong>
          <Star aria-hidden="true" className="yubera-user-rating-summary-star" />
          <span>({voteCountLabel})</span>
        </div>
      </div>

      <div className="yubera-user-rating-controls">
        <span className="yubera-user-rating-label">{ru ? "Ваша оценка:" : "Your rating:"}</span>
        <div className="yubera-user-rating-stars" role="group" aria-label={ru ? "Выберите оценку от 1 до 10" : "Choose a rating from 1 to 10"}>
          {Array.from({ length: 10 }, (_, index) => {
            const value = index + 1;
            const active = selected !== null && value <= selected;
            return (
              <button
                key={value}
                type="button"
                className={`yubera-user-rating-star-button ${active ? "is-active" : ""}`}
                aria-label={ru ? `Оценка ${value} из 10` : `Rate ${value} out of 10`}
                aria-pressed={selected === value}
                disabled={loading || saving}
                onClick={() => {
                  setSelected(value);
                  setError("");
                  setNotice("");
                  setAuthRequired(false);
                }}
              >
                <Star aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="yubera-user-rating-submit"
          disabled={!canSubmit}
          onClick={() => { void saveRating(); }}
        >
          {saving
            ? (ru ? "Сохраняем…" : "Saving…")
            : (ru ? "Подтвердить" : "Confirm")}
        </button>
      </div>

      {error && (
        <p className="yubera-user-rating-message is-error" role="alert">
          {error}
          {authRequired && (
            <>
              {" "}
              <a href="/?section=login" className="yubera-user-rating-auth-link">
                {ru ? "Войти через Telegram" : "Sign in with Telegram"}
              </a>
            </>
          )}
        </p>
      )}
      {notice && <p className="yubera-user-rating-message" role="status">{notice}</p>}
    </section>
  );
}
