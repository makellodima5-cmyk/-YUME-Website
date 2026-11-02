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
  const [compactMobile, setCompactMobile] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    setCompactMobile(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    const lockPageScroll = window.matchMedia("(min-width: 640px)").matches;
    if (lockPageScroll) document.body.style.overflow = "hidden";
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pointer-events-none sm:items-center sm:overflow-y-auto sm:bg-black/65 sm:px-4 sm:py-6 sm:backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal={compactMobile ? "false" : "true"} aria-labelledby="yubera-donation-title" style={compactMobile ? { height: "50dvh", minHeight: "50dvh", maxHeight: "50dvh", flex: "0 0 50dvh" } : undefined} className="pointer-events-auto relative h-[50dvh] max-h-[50dvh] w-full max-w-[560px] overflow-hidden rounded-[1.4rem] border border-fuchsia-500/60 bg-[#10091b] shadow-[0_0_45px_rgba(168,75,255,0.24)] sm:my-auto sm:h-auto sm:max-h-[88dvh] sm:max-w-[580px] sm:overflow-y-auto sm:rounded-[2rem]">
        <div className="absolute inset-0 bg-cover bg-center opacity-75" style={{ backgroundImage: "linear-gradient(180deg, rgba(13,7,25,.08), rgba(8,5,16,.78)), url('/images/yubera-stars-donation-bg.webp')", backgroundSize: "100% auto", backgroundPosition: "top center", backgroundRepeat: "no-repeat" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#170b2a]/25 via-[#10091b]/30 to-[#080610]/80" />
        <div className="relative w-full px-3 pb-3 pt-2 sm:px-7 sm:pb-7 sm:pt-6">
          <button type="button" onClick={onClose} disabled={loading} aria-label="Закрыть" className="absolute right-3 top-2 z-10 flex h-7 w-7 sm:right-4 sm:top-4 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-black/25 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"><X className="h-6 w-6" /></button>
          <div className="mx-auto mb-0 flex h-[62px] w-24 items-center justify-center sm:mb-2 sm:h-24">
            <span className="h-full w-full" aria-hidden="true" />
          </div>
          <h2 id="yubera-donation-title" className="text-center text-[17px] font-bold leading-5 tracking-tight text-white sm:text-[27px]">Поддержать Yubera</h2>
          <p className="mx-auto mt-0.5 max-w-md text-center text-[11px] leading-[14px] text-white/70 sm:mt-2 sm:text-base sm:leading-6">Помогите в развитии проекта —<br className="hidden sm:block" /> поддержите нас донатом в Telegram Stars ⭐</p>

          <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-6 sm:gap-3">
            {PRESETS.map((value) => {
              const active = selected === value && !customAmount;
              return <button key={value} type="button" onClick={() => choosePreset(value)} aria-pressed={active} className={`flex min-h-9 items-center justify-center gap-1 rounded-xl sm:min-h-14 sm:rounded-2xl border px-1.5 text-sm font-semibold transition sm:gap-2 sm:text-base ${active ? "border-fuchsia-400 bg-fuchsia-500/25 text-white shadow-[0_0_18px_rgba(203,80,255,.18)] ring-1 ring-fuchsia-400/50" : "border-white/20 bg-black/20 text-white/90 hover:border-fuchsia-300/60 hover:bg-fuchsia-500/10"}`}>
                <Star className="h-4 w-4 fill-amber-300 text-amber-300 sm:h-[18px] sm:w-[18px]" />{value}
              </button>;
            })}
          </div>

          <div className="my-3 flex items-center gap-2 text-[10px] text-white/55 sm:my-6 sm:gap-3 sm:text-sm">
            <span className="h-px flex-1 bg-white/10" />
            <span className="whitespace-nowrap">Или введите своё количество</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <label className="flex h-10 items-center gap-2 rounded-full sm:h-16 sm:gap-3 sm:h-16 border border-white/20 bg-black/20 px-5 transition focus-within:border-fuchsia-400/80 focus-within:ring-2 focus-within:ring-fuchsia-500/20">
            <Star className="h-5 w-5 shrink-0 fill-amber-300 text-amber-300" />
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={customAmount} onChange={(event) => updateCustom(event.target.value)} placeholder="Количество Stars" aria-label="Количество Stars" className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/40" />
          </label>
          <p className="mt-0 min-h-1 px-2 text-[8px] text-white/45 sm:mt-2 sm:min-h-4 sm:px-3 sm:text-xs">{customAmount ? `От 1 до 100 000 Stars` : " "}</p>

          <button type="button" onClick={submit} disabled={loading || !valid} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full sm:mt-2 sm:h-16 sm:gap-3 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 px-5 text-base font-bold text-[#17091f] shadow-[0_7px_28px_rgba(208,55,218,.25)] transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 sm:text-lg">
            <Send className="h-5 w-5 fill-current" />{loading ? "Создаём счёт…" : "Отправить донат в Stars"}
          </button>

          <div className="mt-2 flex items-start justify-center gap-1.5 text-center text-[10px] leading-[14px] text-white/55 sm:mt-5 sm:gap-2 sm:text-sm sm:leading-5">
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
