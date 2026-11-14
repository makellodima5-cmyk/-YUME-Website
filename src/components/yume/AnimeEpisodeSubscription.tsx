import { useState } from "react";
import { Bell, X } from "lucide-react";

type Source = { id: string; title: string };
type Props = {
  animeId: string;
  language: "ru" | "en";
  disabled: boolean;
  subscribed: boolean;
  subscribedVoiceover?: string;
  needsVoiceoverSelection?: boolean;
  onSubscribed: (subscribed: boolean, voiceover?: string) => void;
  onAuthRequired: () => void;
  onError: () => void;
};

export function AnimeEpisodeSubscription({
  animeId, language, disabled, subscribed, subscribedVoiceover, needsVoiceoverSelection = false, onSubscribed, onAuthRequired, onError,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const english = language === "en";
  const needsVoiceover = subscribed && (needsVoiceoverSelection || !subscribedVoiceover) && !disabled;

  async function beginSubscription() {
    setDialogOpen(true);
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/kodik?animeId=" + encodeURIComponent(animeId), {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as {
        sources?: Source[];
        error?: string;
      };
      if (response.status === 401) {
        setDialogOpen(false);
        onAuthRequired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "kodik_sources_unavailable");
      const available = Array.isArray(payload.sources)
        ? payload.sources.filter((source) => source && typeof source.id === "string" && typeof source.title === "string")
        : [];
      setSources(available);
      setSelectedSourceId(available[0]?.id ?? "");
      if (!available.length) {
        setError(english ? "No voice-overs are currently available for this anime." : "Для этого аниме пока нет доступных озвучек.");
      }
    } catch {
      setError(english ? "Could not load voice-overs. Please try again." : "Не удалось загрузить озвучки. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const response = await fetch("/api/anime-subscriptions", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) {
        onAuthRequired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "subscription_failed");
      onSubscribed(false);
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  async function saveSubscription() {
    if (!selectedSourceId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/anime-subscriptions", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, translationId: selectedSourceId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; translationTitle?: string };
      if (response.status === 401) {
        setDialogOpen(false);
        onAuthRequired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "subscription_failed");
      const selected = sources.find((source) => source.id === selectedSourceId);
      onSubscribed(true, payload.translationTitle || selected?.title);
      setDialogOpen(false);
    } catch {
      setError(english ? "Could not save the subscription. Please try again." : "Не удалось сохранить подписку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={(disabled && !subscribed) || busy}
        title={disabled && !subscribed ? (english ? "No more episodes are expected for this title" : "Новые серии для этого тайтла больше не выходят") : undefined}
        onClick={() => { if (subscribed && !needsVoiceover) void unsubscribe(); else void beginSubscription(); }}
        aria-pressed={subscribed}
        className="inline-flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-full bg-secondary px-2 py-2.5 text-center text-[11px] font-semibold leading-tight ring-1 ring-border transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:flex-row md:gap-2 md:px-4 md:py-2.5 md:text-sm"
      >
        <Bell className={`h-4 w-4 ${subscribed ? "fill-current text-primary" : ""}`} />
        {needsVoiceover
          ? (english ? "Choose a voice-over" : "Выбрать озвучку")
          : subscribed
            ? (english ? `Following: ${subscribedVoiceover}` : `Подписка: ${subscribedVoiceover}`)
            : (english ? "Follow new episodes" : "Отслеживать новые серии")}
      </button>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="episode-subscription-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="episode-subscription-title" className="text-lg font-bold">
                  {english ? "Choose a voice-over" : "Выберите озвучку"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {english
                    ? "You'll only be notified when a new episode appears in this voice-over."
                    : "Уведомление придёт, только когда новая серия появится в выбранной озвучке."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label={english ? "Close" : "Закрыть"}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                {english ? "Loading voice-overs…" : "Загружаем озвучки…"}
              </p>
            ) : error ? (
              <p role="alert" className="py-5 text-sm text-muted-foreground">{error}</p>
            ) : (
              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium">{english ? "Voice-over" : "Озвучка"}</span>
                <select
                  value={selectedSourceId}
                  onChange={(event) => setSelectedSourceId(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
                </select>
              </label>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
              >
                {english ? "Cancel" : "Отмена"}
              </button>
              <button
                type="button"
                disabled={loading || !selectedSourceId || busy || !!error}
                onClick={() => void saveSubscription()}
                className="rounded-full bg-neon px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? (english ? "Saving…" : "Сохраняем…") : (english ? "Subscribe" : "Подписаться")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
