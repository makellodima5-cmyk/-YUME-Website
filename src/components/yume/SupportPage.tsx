import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Pencil, Rocket, Send, Server, Star } from "lucide-react";
import { getTelegramWebApp, telegramHapticImpact, telegramHapticNotification } from "@/lib/telegram-mini-app";

type Props = { onBack: () => void };
type PaymentStatus = "pending" | "pre_checkout" | "paid" | "failed";
const PRESETS = [50, 100, 250, 500, 1000] as const;
const MIN_STARS = 1;
const MAX_STARS = 100000;

function StarsMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "relative inline-flex h-12 w-12 shrink-0 items-center justify-center" : "relative inline-flex h-[68px] w-[68px] shrink-0 items-center justify-center"} aria-hidden="true">
      <Star className="h-[82%] w-[82%] fill-[#FFC044] text-[#FFE49A] drop-shadow-[0_0_9px_rgba(255,190,55,.48)]" strokeWidth={1.4} />
      <span className="absolute bottom-0 right-0 grid h-[19px] w-[19px] place-items-center rounded-full border-2 border-[#22232a] bg-[#229ED9] text-white"><Send className="h-2.5 w-2.5 fill-current" /></span>
    </span>
  );
}

export function SupportPage({ onBack }: Props) {
  const [selected, setSelected] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("");
  const pollingRef = useRef(false);\n  const submitLockRef = useRef(false);

  const amount = customAmount ? Number(customAmount) : selected;
  const valid = Number.isSafeInteger(amount) && amount >= MIN_STARS && amount <= MAX_STARS;

  useEffect(() => {
    if (!customOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [customOpen]);

  const checkStatus = async (payload: string, initData: string) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setStatus("pending");
    setMessage("Проверяем подтверждение оплаты Telegram…");
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch("/api/telegram/stars-status?payload=" + encodeURIComponent(payload), {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "X-Telegram-Init-Data": initData },
        });
        if (!response.ok) throw new Error("Не удалось проверить статус платежа.");
        const result = await response.json() as { status?: PaymentStatus };
        if (result.status === "paid") {
          setStatus("paid");
          setMessage("Спасибо за поддержку YUBERA! Твоя поддержка помогает проекту развиваться и становиться лучше.");
          telegramHapticNotification("success");
          return;
        }
        if (result.status === "failed") {
          setStatus("failed");
          setMessage("Платёж не завершён. Можно попробовать ещё раз.");
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 1200));
      }
      setStatus("pending");
      setMessage("Подтверждение ещё не получено. Проверь статус позже — мы не считаем платёж успешным без ответа сервера.");
    } catch (cause) {
      setStatus("pending");
      setMessage(cause instanceof Error ? cause.message : "Не удалось проверить статус платежа.");
    } finally {
      pollingRef.current = false;
    }
  };

  const submit = async () => {
    if (!valid || submitLockRef.current) {
      setError("Укажите целое число от 1 до 100 000 Stars.");
      return;
    }
    const webApp = getTelegramWebApp();
    if (!webApp?.initData || !webApp.openInvoice) {
      setError("Оплата доступна только в актуальной версии Telegram.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    setStatus(null);
    try {
      const response = await fetch("/api/telegram/stars-invoice", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, amount }),
      });
      const result = await response.json().catch(() => ({})) as { invoiceUrl?: string; payload?: string; error?: string };
      if (!response.ok || typeof result.invoiceUrl !== "string" || typeof result.payload !== "string") {
        throw new Error(result.error === "telegram_auth_expired"
          ? "Сессия Telegram устарела. Закрой и снова открой приложение."
          : "Не удалось создать счёт. Попробуй ещё раз.");
      }
      webApp.openInvoice(result.invoiceUrl, (invoiceStatus) => {
        if (invoiceStatus === "paid" || invoiceStatus === "pending") {
          void checkStatus(result.payload!, webApp.initData);
        } else if (invoiceStatus === "cancelled") {
          setStatus(null);
          setMessage("Оплата отменена. Счёт не оплачен.");
        } else if (invoiceStatus === "failed") {
          setStatus("failed");
          setMessage("Не удалось завершить оплату. Попробуй ещё раз.");
          telegramHapticNotification("error");
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось начать оплату.");
      telegramHapticNotification("error");
    } finally {
      setLoading(false);
    }
  };

  const confirmCustom = () => {
    const value = Number(customDraft);
    if (!/^\d+$/.test(customDraft) || !Number.isSafeInteger(value) || value < MIN_STARS || value > MAX_STARS) {
      setError("Введите целое число от 1 до 100 000 Stars.");
      return;
    }
    setSelected(value);
    setCustomAmount(String(value));
    setCustomOpen(false);
    setError("");
    setMessage("");
  };

  return (
    <main id="main-content" className="yubera-with-bottom-nav min-h-[calc(100dvh-72px)] px-3 pb-8 pt-3 sm:px-4">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <button type="button" onClick={onBack} className="mb-0 inline-flex min-h-9 w-fit items-center gap-2 rounded-full px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>

        <section className="relative isolate min-h-[166px] overflow-hidden rounded-[22px] border border-[#3a3b43] bg-[#171820]">
          <img src="/images/yubera-stars-donation-bg.webp" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[65%_38%]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101116]/95 via-[#101116]/78 to-[#101116]/10" />
          <div className="relative z-10 max-w-[64%] px-4 py-5 sm:px-6 sm:py-6">
            <span className="inline-flex rounded-full bg-[#652d2b]/75 px-3 py-1 text-[11px] font-semibold text-white">Поддержка проекта</span>
            <h1 className="mt-2 text-[25px] font-extrabold leading-tight text-white sm:text-[30px]">Поддержи YUBERA</h1>
            <p className="mt-2 max-w-[340px] text-[13px] leading-[1.45] text-white/75 sm:text-sm">Помоги проекту развиваться, добавлять новые функции и сохранять стабильную работу.</p>
          </div>
        </section>

        <section className="rounded-[20px] border border-[#383941] bg-[#191a21] p-3.5 sm:p-5">
          <h2 className="flex items-center gap-2.5 text-[18px] font-bold text-white"><span className="h-7 w-1.5 rounded-full bg-[#ff6245]" />Выбери сумму поддержки</h2>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {PRESETS.map(value => {
              const active = !customAmount && selected === value;
              return <button key={value} type="button" aria-pressed={active} onClick={() => { telegramHapticImpact("light"); setSelected(value); setCustomAmount(""); setError(""); setMessage(""); }} className={`flex min-h-[46px] items-center justify-center gap-2 rounded-[15px] border px-2 text-[15px] font-bold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6245] ${active ? "border-[#ff6245] bg-[#51271f] shadow-[0_0_0_1px_rgba(255,98,69,.18)]" : "border-[#363740] bg-[#23242c] hover:border-[#6b6c75]"}`}>
                <Star className="h-5 w-5 fill-[#ffc044] text-[#ffc044]" />{value}
              </button>;
            })}
            <button type="button" onClick={() => { setCustomDraft(customAmount || ""); setCustomOpen(true); setError(""); }} className="flex min-h-[46px] flex-col items-center justify-center rounded-[15px] border border-[#363740] bg-[#23242c] px-2 text-[12px] font-medium text-white hover:border-[#6b6c75] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6245]">
              <span className="text-base leading-4">•••</span>Другая сумма
            </button>
          </div>
          <button type="button" onClick={submit} disabled={loading || !valid} className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[15px] bg-[#ff583b] px-3 text-[16px] font-bold text-white transition hover:bg-[#ff694f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffb09e] disabled:cursor-not-allowed disabled:opacity-60">
            <Send className="h-5 w-5" />{loading ? "Создаём счёт…" : `Отправить ${amount} звёзд`}
          </button>
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
          {message && <p role={status === "paid" || status === "pending" ? "status" : "alert"} className={`mt-3 rounded-xl border px-3 py-2 text-sm ${status === "paid" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-white/75"}`}>{message}</p>}
        </section>

        <section className="rounded-[20px] border border-[#383941] bg-[#191a21] p-3.5 sm:p-5">
          <h2 className="flex items-center gap-2.5 text-[18px] font-bold text-white"><span className="h-7 w-1.5 rounded-full bg-[#ff6245]" />На что идут пожертвования?</h2>
          <div className="mt-3 divide-y divide-white/10">
            <div className="flex items-center gap-3 py-2.5"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-[17px] bg-[#38221f] text-[#ff754f]"><Rocket className="h-7 w-7" /></span><span><strong className="block text-[15px] text-white">Развитие функционала</strong><span className="mt-0.5 block text-[13px] text-white/65">Новые возможности, разделы и улучшения</span></span></div>
            <div className="flex items-center gap-3 py-2.5"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-[17px] bg-[#38221f] text-[#ff754f]"><Server className="h-7 w-7" /></span><span><strong className="block text-[15px] text-white">Стабильная работа</strong><span className="mt-0.5 block text-[13px] text-white/65">Оплата серверов и инфраструктуры</span></span></div>
            <div className="flex items-center gap-3 py-2.5"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-[17px] bg-[#38221f] text-[#ff754f]"><Pencil className="h-7 w-7" /></span><span><strong className="block text-[15px] text-white">Улучшение контента</strong><span className="mt-0.5 block text-[13px] text-white/65">Качество, удобство и актуальные подборки</span></span></div>
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-[18px] border border-[#383941] bg-[#191a21] px-3.5 py-3">
          <Info className="h-6 w-6 shrink-0 text-white/65" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-white/65">Пожертвования проходят через Telegram Stars. Оплата осуществляется внутри Telegram. Ты поддерживаешь проект напрямую.</p>
          <StarsMark compact />
        </section>
      </div>

      {customOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCustomOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="support-custom-title" className="w-full max-w-sm rounded-[22px] border border-[#44454d] bg-[#1b1c23] p-5 shadow-2xl">
          <h2 id="support-custom-title" className="text-lg font-bold text-white">Введите сумму поддержки</h2>
          <label className="mt-4 block text-sm text-white/70" htmlFor="support-custom-amount">Количество Telegram Stars</label>
          <input id="support-custom-amount" type="text" inputMode="numeric" pattern="[0-9]*" value={customDraft} onChange={event => setCustomDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} className="mt-2 h-12 w-full rounded-xl border border-[#4a4b54] bg-[#111218] px-3 text-base text-white outline-none focus:border-[#ff6245]" autoFocus />
          <p className="mt-2 text-xs text-white/50">От 1 до 100 000 Stars</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCustomOpen(false)} className="min-h-10 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white">Отмена</button><button type="button" onClick={confirmCustom} className="min-h-10 rounded-xl bg-[#ff583b] px-4 text-sm font-bold text-white">Подтвердить</button></div>
        </section>
      </div>}
    </main>
  );
}
