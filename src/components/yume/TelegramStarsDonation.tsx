import { useEffect, useState } from "react";
import { Info, Send, Star, X } from "lucide-react";
import { getTelegramWebApp, telegramHapticImpact, telegramHapticNotification } from "@/lib/telegram-mini-app";

type Props = { open: boolean; onClose: () => void };
const PRESETS = [50, 100, 250, 500] as const;
const MIN_STARS = 1;
const MAX_STARS = 100000;

export function TelegramStarsDonation({ open, onClose }: Props) {
  const [selected, setSelected] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  const parsedCustom = customAmount.trim() ? Number(customAmount) : null;
  const amount = parsedCustom ?? selected ?? 0;
  const valid = Number.isSafeInteger(amount) && amount >= MIN_STARS && amount <= MAX_STARS;

  const choosePreset = (value: number) => {
    telegramHapticImpact("light");
    setSelected(value);
    setCustomAmount("");
    setError("");
    setNotice("");
  };

  const updateCustom = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, 6);
    setCustomAmount(digits);
    setSelected(null);
    setError("");
    setNotice("");
  };

  const submit = async () => {
    if (!valid || loading) {
      setError("Укажите целое число от 1 до 100 000 Stars.");
      telegramHapticNotification("error");
      return;
    }
    const webApp = getTelegramWebApp();
    if (!webApp?.initData || !webApp.openInvoice) {
      setError("Оплата доступна только в актуальной версии Telegram.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/telegram/stars-invoice", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, amount }),
      });
      const result = await response.json().catch(() => ({})) as { invoiceUrl?: string; error?: string };
      if (!response.ok || typeof result.invoiceUrl !== "string") {
        throw new Error(result.error === "telegram_auth_expired"
          ? "Сессия Telegram устарела. Закройте и снова откройте приложение."
          : "Не удалось создать счёт. Попробуйте ещё раз.");
      }
      webApp.openInvoice(result.invoiceUrl, (status) => {
        if (status === "paid") {
          setNotice("Спасибо за поддержку Yubera! 💜");
          telegramHapticNotification("success");
        } else if (status === "failed") {
          setError("Платёж не прошёл. Попробуйте ещё раз.");
          telegramHapticNotification("error");
        } else if (status === "cancelled") {
          setNotice("Оплата отменена. Вы можете вернуться к ней позже.");
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось начать оплату.");
      telegramHapticNotification("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/65 px-4 py-6 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="yubera-donation-title" className="relative my-auto w-full max-w-[580px] overflow-hidden rounded-[2rem] border border-fuchsia-500/60 bg-[#10091b] shadow-[0_0_45px_rgba(168,75,255,0.24)]">
        <div className="absolute inset-0 bg-cover bg-center opacity-75" style={{ backgroundImage: "linear-gradient(180deg, rgba(13,7,25,.08), rgba(8,5,16,.78)), url('/images/yubera-stars-donation-bg.webp')", backgroundSize: "100% 100%", backgroundPosition: "top center" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#170b2a]/25 via-[#10091b]/30 to-[#080610]/80" />
        <div className="relative px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <button type="button" onClick={onClose} disabled={loading} aria-label="Закрыть" className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"><X className="h-6 w-6" /></button>
          <div className="mx-auto mb-2 flex h-24 w-28 items-center justify-center">
            <span className="h-24 w-28" aria-hidden="true" />
          </div>
          <h2 id="yubera-donation-title" className="text-center text-2xl font-bold tracking-tight text-white sm:text-[27px]">Поддержать Yubera</h2>
          <p className="mx-auto mt-2 max-w-md text-center text-[15px] leading-6 text-white/70 sm:text-base">Помогите в развитии проекта —<br className="hidden sm:block" /> поддержите нас донатом в Telegram Stars ⭐</p>

          <div className="mt-6 grid grid-cols-4 gap-2.5 sm:gap-3">
            {PRESETS.map((value) => {
              const active = selected === value && !customAmount;
              return <button key={value} type="button" onClick={() => choosePreset(value)} aria-pressed={active} className={`flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border px-1.5 text-sm font-semibold transition sm:gap-2 sm:text-base ${active ? "border-fuchsia-400 bg-fuchsia-500/25 text-white shadow-[0_0_18px_rgba(203,80,255,.18)] ring-1 ring-fuchsia-400/50" : "border-white/20 bg-black/20 text-white/90 hover:border-fuchsia-300/60 hover:bg-fuchsia-500/10"}`}>
                <Star className="h-4 w-4 fill-amber-300 text-amber-300 sm:h-[18px] sm:w-[18px]" />{value}
              </button>;
            })}
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-white/55 sm:text-sm">
            <span className="h-px flex-1 bg-white/10" />
            <span className="whitespace-nowrap">Или введите своё количество</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <label className="flex h-16 items-center gap-3 rounded-full border border-white/20 bg-black/20 px-5 transition focus-within:border-fuchsia-400/80 focus-within:ring-2 focus-within:ring-fuchsia-500/20">
            <Star className="h-5 w-5 shrink-0 fill-amber-300 text-amber-300" />
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={customAmount} onChange={(event) => updateCustom(event.target.value)} placeholder="Количество Stars" aria-label="Количество Stars" className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/40" />
          </label>
          <p className="mt-2 min-h-4 px-3 text-xs text-white/45">{customAmount ? `От 1 до 100 000 Stars` : " "}</p>

          <button type="button" onClick={submit} disabled={loading || !valid} className="mt-2 flex h-16 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 px-5 text-base font-bold text-[#17091f] shadow-[0_7px_28px_rgba(208,55,218,.25)] transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 sm:text-lg">
            <Send className="h-5 w-5 fill-current" />{loading ? "Создаём счёт…" : "Отправить донат в Stars"}
          </button>

          <div className="mt-5 flex items-start justify-center gap-2 text-center text-xs leading-5 text-white/55 sm:text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Оплата происходит через официальную систему Telegram. Вы поддерживаете развитие Yubera.</span>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">{error}</p>}
          {notice && <p role="status" className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-100">{notice}</p>}
        </div>
      </section>
    </div>
  );
}
