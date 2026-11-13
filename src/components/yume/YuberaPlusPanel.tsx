import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Crown, Headphones, Image, Layers3, LoaderCircle, Sparkles, Star } from "lucide-react";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";

type Sub = { active: boolean; expiresAt: number; autoRenew: boolean; isRecurring: boolean; renewalFailedAt?: string | null };
type Status = {
  price: number;
  threeMonthPrice: number;
  threeMonthDiscountPercent: number;
  periodDays: number;
  isPlus: boolean;
  renewalFailedAt?: string | null;
  subscription: Sub | null;
};
type PlanMonths = 1 | 3;

const formatDate = (value: number) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));

const benefits = [
  { title: "AI-помощник", description: "Рекомендации, создание подборок и помощь в поиске аниме", icon: Headphones, soon: true },
  { title: "Расширенные подборки", description: "Больше лимитов и гибкие настройки", icon: Layers3 },
  { title: "Эксклюзивные рамки аватара", description: "Специальные рамки только для подписчиков Plus", icon: Image },
  { title: "Эксклюзивный статус", description: "Особый статус YUBERA Plus в профиле", icon: BadgeCheck },
];

export function YuberaPlusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [months, setMonths] = useState<PlanMonths>(1);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/yubera/plus", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as Status & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить подписку.");
    setStatus(data);
  }, []);

  useEffect(() => {
    void load().catch(cause => setError(cause instanceof Error ? cause.message : "Ошибка загрузки."));
  }, [load]);

  const waitForPayment = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 1000));
      try {
        await load();
        const response = await fetch("/api/yubera/plus", { credentials: "same-origin", cache: "no-store" });
        const data = await response.json() as Status;
        if (response.ok && data.isPlus) {
          setMessage("Оплата подтверждена. YUBERA Plus активирован.");
          return;
        }
      } catch {
        // Telegram webhook may still be processing.
      }
    }
    setMessage("Платёж отправлен. Telegram ещё подтверждает его — обнови статус через несколько секунд.");
  };

  const createInvoice = async () => {
    if (!status || (months === 1 ? status.price : status.threeMonthPrice) < 1) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/yubera/plus", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-invoice", months, autoRenewConsent: months === 1 && consent }),
      });
      const data = await response.json().catch(() => ({})) as { invoiceUrl?: string; error?: string };
      if (!response.ok || !data.invoiceUrl) throw new Error(data.error ?? "Не удалось создать счёт.");
      const app = getTelegramWebApp();
      if (!app?.openInvoice) {
        window.location.assign(data.invoiceUrl);
        return;
      }
      app.openInvoice(data.invoiceUrl, result => {
        if (result === "paid") void waitForPayment();
        else if (result === "failed") setError("Telegram не смог завершить оплату.");
        else setMessage("Оплата отменена. Подписка не оформлена.");
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка оплаты.");
    } finally {
      setBusy(false);
    }
  };

  const renewal = async (action: "cancel-auto-renew" | "enable-auto-renew") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/yubera/plus", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось изменить автопродление.");
      await load();
      setMessage(action === "cancel-auto-renew"
        ? "Автопродление отключено. Доступ сохранится до конца оплаченного периода."
        : "Автопродление включено через Telegram.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка изменения подписки.");
    } finally {
      setBusy(false);
    }
  };

  const selectedPrice = months === 1 ? status?.price ?? 0 : status?.threeMonthPrice ?? 0;
  const canPurchase = Boolean(status && status.price > 0 && selectedPrice > 0 && !status.subscription);

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[22px] border border-[#8f3c38]/70 bg-[#19131b] p-3.5 shadow-[0_0_28px_rgba(255,76,58,.12)] sm:p-4">
        <div className="relative isolate mb-4 flex min-h-[96px] items-center gap-3 overflow-hidden rounded-[18px] border border-[#c64c45]/70 bg-gradient-to-br from-[#6b242d] via-[#9a3038] to-[#3d1b39] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_0_22px_rgba(255,76,58,.25)]">
          <span className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_50%,rgba(255,181,75,.34),transparent_35%),radial-gradient(circle_at_90%_20%,rgba(255,91,102,.38),transparent_42%)]" />
          <img src="/images/yubera/YUBERA_Plus_Crown_Simple.webp" alt="" className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(255,190,76,.45)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[21px] font-extrabold leading-tight text-white sm:text-2xl">YUBERA Plus</h2>
            <p className="mt-1 text-xs leading-snug text-white/85 sm:text-sm">Подписка для ещё большего комфорта на YUBERA.</p>
          </div>
          <img src="/images/yubera/YUBERA_Plus_Crown_Simple.webp" alt="" className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_0_14px_rgba(255,190,76,.55)]" />
        </div>

        <h3 className="mb-2 flex items-center gap-2 text-[17px] font-extrabold text-white">
          <span className="h-6 w-1.5 rounded-full bg-[#ff6046]" />
          Преимущества подписки
        </h3>
        <div className="space-y-1">
          {benefits.map(({ title, description, icon: Icon, soon }) => (
            <div key={title} className="flex items-center gap-3 rounded-[15px] border border-white/[0.08] bg-gradient-to-r from-[#211b24] to-[#17171e] px-3 py-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border border-[#8b453d]/25 bg-gradient-to-br from-[#542c2b] to-[#29202a] text-[#ff956d]">
                <Icon className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold leading-tight text-white">
                  {title}
                  {soon && <span className="rounded-full bg-[#a99aff]/20 px-2 py-0.5 text-[10px] font-semibold text-[#c8bbff]">Скоро</span>}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/65">{description}</span>
              </span>
            </div>
          ))}
        </div>

        <h3 className="mb-3 mt-4 flex items-center gap-2 text-[17px] font-extrabold text-white">
          <span className="h-6 w-1.5 rounded-full bg-[#ff6046]" />
          Выбери подписку
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            aria-pressed={months === 1}
            onClick={() => setMonths(1)}
            className={"relative flex min-h-[112px] flex-col items-center justify-center rounded-[17px] border px-2 py-3 text-center transition " + (months === 1
              ? "border-[#ff704d] bg-gradient-to-b from-[#67332c] via-[#48252a] to-[#2c1d27] shadow-[0_0_0_1px_rgba(255,112,77,.35),0_0_20px_rgba(255,94,62,.32)]"
              : "border-white/15 bg-gradient-to-b from-[#202027] to-[#15151b] hover:border-white/30")}
          >
            <span className="text-[13px] font-semibold text-white">1 месяц</span>
            <span className="mt-1 flex items-center gap-1.5 text-[24px] font-extrabold leading-none text-white">
              <Star className="h-5 w-5 fill-[#ffc044] text-[#ffc044]" />
              {status?.price ? status.price.toLocaleString("ru-RU") : "—"}
            </span>
            <span className="mt-1 text-[11px] text-white/65">30 дней</span>
          </button>
          <button
            type="button"
            aria-pressed={months === 3}
            onClick={() => { setMonths(3); setConsent(false); }}
            className={"relative flex min-h-[112px] flex-col items-center justify-center rounded-[17px] border px-2 py-3 text-center transition " + (months === 3
              ? "border-[#ff704d] bg-gradient-to-b from-[#67332c] via-[#48252a] to-[#2c1d27] shadow-[0_0_0_1px_rgba(255,112,77,.35),0_0_20px_rgba(255,94,62,.32)]"
              : "border-white/15 bg-gradient-to-b from-[#202027] to-[#15151b] hover:border-white/30")}
          >
            <span className="absolute -right-1.5 -top-2 rounded-full border border-[#ff684a] bg-gradient-to-r from-[#ff4c35] to-[#ff7a48] px-2.5 py-1 text-[10px] font-extrabold text-white shadow-[0_0_12px_rgba(255,85,54,.4)]">-{status?.threeMonthDiscountPercent ?? 17}%</span>
            <span className="text-[13px] font-semibold text-white">3 месяца</span>
            <span className="mt-1 flex items-center gap-1.5 text-[24px] font-extrabold leading-none text-white">
              <Star className="h-5 w-5 fill-[#ffc044] text-[#ffc044]" />
              {status?.threeMonthPrice ? status.threeMonthPrice.toLocaleString("ru-RU") : "—"}
            </span>
            <span className="mt-1 text-[11px] text-white/65">90 дней</span>
          </button>
        </div>

        {months === 3 && status?.price && status.threeMonthPrice > 0 && (
          <p className="mt-2 text-center text-[11px] text-[#ffc47a]">
            Экономия {Math.max(0, status.price * 3 - status.threeMonthPrice).toLocaleString("ru-RU")} ⭐ за 3 месяца
          </p>
        )}

        {months === 1 && !status?.subscription && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left text-xs text-white/75">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff704d]" />
            <span>
              <b className="block text-[12px] text-white">Автоматическое продление</b>
              <span className="mt-0.5 block leading-snug text-white/55">Telegram будет списывать стоимость одного месяца каждые 30 дней. Продление можно отменить в любой момент.</span>
            </span>
          </label>
        )}
        {months === 3 && <p className="mt-3 text-center text-[11px] text-white/50">Разовая оплата за 90 дней. Автоматических списаний не будет.</p>}

        {status && status.price < 1 && <p className="mt-3 text-center text-xs text-amber-200">Цена подписки ещё не настроена.</p>}
        {status && months === 3 && status.price > 0 && status.threeMonthPrice < 1 && <p className="mt-3 text-center text-xs text-amber-200">Трёхмесячный тариф недоступен при текущей цене.</p>}

        {status?.renewalFailedAt && (
          <p role="alert" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {status.subscription
              ? "Telegram не смог выполнить автопродление. Пополни баланс Stars и включи продление снова. Доступ сохранится до " + formatDate(status.subscription.expiresAt) + "."
              : "Telegram не смог продлить YUBERA Plus. Пополни баланс Stars и оформи подписку снова."}
          </p>
        )}

        {status?.subscription && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left">
            <p className="font-semibold text-emerald-300">Подписка активна</p>
            <p className="mt-1 text-sm text-white/70">Доступ до {formatDate(status.subscription.expiresAt)}.</p>
            <p className="mt-1 text-sm text-white/70">{status.subscription.autoRenew ? "Автопродление включено." : "Автопродление отключено."}</p>
            {status.subscription.isRecurring && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void renewal(status.subscription!.autoRenew ? "cancel-auto-renew" : "enable-auto-renew")}
                className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Обновляем…" : status.subscription.autoRenew ? "Отключить автопродление" : "Включить автопродление"}
              </button>
            )}
          </div>
        )}

        {!status?.subscription && (
          <button
            type="button"
            disabled={!canPurchase || busy}
            onClick={() => void createInvoice()}
            className="mt-3 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff4f36] via-[#ff623f] to-[#ff784a] px-4 py-3 text-[15px] font-extrabold text-white shadow-[0_7px_20px_rgba(255,82,55,.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Crown className="h-5 w-5" />}
            {busy ? "Создаём счёт…" : "Оформить YUBERA Plus"}
          </button>
        )}

        {months === 1 && !consent && !status?.subscription && <p className="mt-2 text-center text-[10px] leading-snug text-white/45">Разовая оплата на 30 дней. Повторных списаний не будет.</p>}
        {message && <p role="status" className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-white/80">{message}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      </section>
    </div>
  );
}
