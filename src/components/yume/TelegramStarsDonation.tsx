import { useEffect, useRef, useState } from "react";
import { Info, Send, Star, X } from "lucide-react";
import { getTelegramWebApp, telegramHapticImpact, telegramHapticNotification } from "@/lib/telegram-mini-app";

type Props = { open: boolean; onClose: () => void };
const PRESETS = [50, 100, 250, 500] as const;
const MIN_STARS = 1;
const MAX_STARS = 100000;

function DonationStarArtwork() {
  return (
    <div className="relative mx-auto flex h-[66px] w-[116px] items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 150 92" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="yubera-star-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff4a8" />
            <stop offset="48%" stopColor="#ffc83d" />
            <stop offset="100%" stopColor="#e98a16" />
          </linearGradient>
          <linearGradient id="yubera-star-orbit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b35d9" stopOpacity="0" />
            <stop offset="50%" stopColor="#d76aff" />
            <stop offset="100%" stopColor="#8b35d9" stopOpacity="0" />
          </linearGradient>
          <filter id="yubera-star-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <ellipse cx="75" cy="48" rx="65" ry="19" transform="rotate(-15 75 48)" fill="none" stroke="url(#yubera-star-orbit)" strokeWidth="2.4" filter="url(#yubera-star-glow)" />
        <path d="M75 5 L87 34 L119 36 L94 56 L103 86 L75 68 L47 86 L56 56 L31 36 L63 34 Z" fill="url(#yubera-star-gold)" stroke="#ffe39a" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M75 5 L75 68 L63 34 Z" fill="#fff1a4" opacity=".62" />
        <path d="M75 68 L87 34 L119 36 Z" fill="#f6b42e" opacity=".72" />
        <path d="M75 68 L103 86 L94 56 Z" fill="#d97917" opacity=".55" />
        <path d="M75 68 L47 86 L56 56 Z" fill="#ffcf57" opacity=".45" />
      </svg>
      <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_10px_3px_rgba(216,120,255,.8)]" />
    </div>
  );
}

export function TelegramStarsDonation({ open, onClose }: Props) {
  const [selected, setSelected] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compactMobile, setCompactMobile] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const isCompact = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640;
    setCompactMobile(isCompact);
    const previousOverflow = document.body.style.overflow;
    if (!isCompact) document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    // A click outside closes the sheet; a swipe/scroll on the page does not.
    const onDocumentClick = (event: MouseEvent) => {
      if (!loading && panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onDocumentClick, true);
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
    <>
      <style>{`
        @keyframes yubera-donation-sheet-in {
          from { transform: translate3d(0, 28px, 0); opacity: .72; }
          to { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .yubera-donation-sheet { animation: none !important; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-end justify-center px-0 pb-[calc(env(safe-area-inset-bottom)+18px)] sm:items-center sm:bg-black/65 sm:px-4 sm:py-6 sm:backdrop-blur-md">
        <section
          ref={panelRef}
          role="dialog"
          aria-modal={compactMobile ? "false" : "true"}
          aria-labelledby="yubera-donation-title"
          style={compactMobile ? { width: "82vw", maxWidth: "440px", maxHeight: "46dvh", animation: "yubera-donation-sheet-in 300ms cubic-bezier(.2,.8,.2,1) both" } : undefined}
          className="yubera-donation-sheet pointer-events-auto relative w-[min(82vw,440px)] max-h-[46dvh] overflow-y-auto overscroll-contain rounded-[28px] border border-fuchsia-500/70 bg-[#10091b] shadow-[0_0_38px_rgba(168,75,255,0.25)] sm:my-auto sm:w-full sm:max-w-[580px] sm:max-h-[88dvh] sm:rounded-[32px] sm:border-fuchsia-500/60"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(110,38,158,.34),transparent_62%),radial-gradient(ellipse_at_0%_70%,rgba(75,30,115,.22),transparent_48%),linear-gradient(180deg,#180c28_0%,#10091b_55%,#090611_100%)]" />
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_50%_0%,rgba(197,83,255,.2),transparent_72%)]" />
          <div className="relative px-3 pb-3 pt-2.5 sm:px-7 sm:pb-6 sm:pt-5">
            <button type="button" onClick={onClose} disabled={loading} aria-label="Закрыть" className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40 sm:right-4 sm:top-4 sm:h-9 sm:w-9"><X className="h-5 w-5 sm:h-6 sm:w-6" /></button>

            <DonationStarArtwork />
            <h2 id="yubera-donation-title" className="mt-0.5 text-center text-[19px] font-bold leading-6 tracking-tight text-white sm:mt-2 sm:text-[27px]">Поддержать Yubera</h2>
            <p className="mx-auto mt-1 max-w-md text-center text-[11px] leading-[15px] text-white/70 sm:mt-2 sm:text-base sm:leading-6">Помогите в развитии проекта — поддержите нас донатом в Telegram Stars ⭐</p>

            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:mt-5 sm:gap-3">
              {PRESETS.map((value) => {
                const active = selected === value && !customAmount;
                return <button key={value} type="button" onClick={() => choosePreset(value)} aria-pressed={active} className={`flex min-h-9 items-center justify-center gap-1 rounded-xl border px-1 text-[12px] font-semibold transition sm:min-h-14 sm:gap-2 sm:rounded-2xl sm:px-2 sm:text-base ${active ? "border-fuchsia-400 bg-fuchsia-500/25 text-white shadow-[0_0_18px_rgba(203,80,255,.18)] ring-1 ring-fuchsia-400/50" : "border-white/20 bg-black/20 text-white/90 hover:border-fuchsia-300/60 hover:bg-fuchsia-500/10"}`}>
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300 sm:h-[18px] sm:w-[18px]" />{value}
                </button>;
              })}
            </div>

            <div className="my-2.5 flex items-center gap-2 text-[9px] text-white/55 sm:my-5 sm:gap-3 sm:text-sm">
              <span className="h-px flex-1 bg-white/10" />
              <span className="whitespace-nowrap">Или введите своё количество</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <label className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 transition focus-within:border-fuchsia-400/80 focus-within:ring-2 focus-within:ring-fuchsia-500/20 sm:h-16 sm:gap-3 sm:px-5">
              <Star className="h-4 w-4 shrink-0 fill-amber-300 text-amber-300 sm:h-5 sm:w-5" />
              <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={customAmount} onChange={(event) => updateCustom(event.target.value)} placeholder="Количество Stars" aria-label="Количество Stars" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40 sm:text-base" />
            </label>
            <p className="mt-0.5 min-h-3 px-2 text-[8px] text-white/45 sm:mt-2 sm:min-h-4 sm:px-3 sm:text-xs">{customAmount ? "От 1 до 100 000 Stars" : " "}</p>

            <button type="button" onClick={submit} disabled={loading || !valid} className="mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neon px-4 text-[14px] font-bold text-white shadow-neon transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 sm:mt-2 sm:h-16 sm:gap-3 sm:px-5 sm:text-lg">
              <Send className="h-4 w-4 fill-current sm:h-5 sm:w-5" />{loading ? "Создаём счёт…" : "Отправить донат в Stars"}
            </button>

            <div className="mt-2 flex items-start justify-center gap-1.5 text-center text-[9px] leading-[13px] text-white/55 sm:mt-4 sm:gap-2 sm:text-sm sm:leading-5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>Оплата происходит через официальную систему Telegram. Вы поддерживаете развитие Yubera.</span>
            </div>
            {error && <p role="alert" className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200 sm:text-sm">{error}</p>}
            {notice && <p role="status" className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-100 sm:text-sm">{notice}</p>}
          </div>
        </section>
      </div>
    </>
  );
}
