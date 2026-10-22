import { useState, type FormEvent } from "react";
import { CalendarDays, LogIn, ShieldCheck, UserRound } from "lucide-react";

type AuthMode = "login" | "register";
type Props = {
  mode: AuthMode;
  language: "ru" | "en";
  onModeChange: (mode: AuthMode) => void;
  onPrivacy: () => void;
};

export function AuthPage({ mode, language, onModeChange, onPrivacy }: Props) {
  const isRu = language === "ru";
  const currentYear = new Date().getFullYear();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  // Real OAuth is intentionally not connected yet. This stays false until a provider callback is verified server-side.
  const [providerConnected] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");

  const copy = isRu
    ? {
        loginTitle: "Вход в аккаунт",
        loginSubtitle: "Рады видеть тебя снова в YUME",
        registerTitle: "Регистрация",
        registerSubtitle: "Создай аккаунт, чтобы продолжить в YUME",
        vk: "Продолжить через VK ID",
        yandex: "Продолжить через Яндекс ID",
        soon: "Скоро",
        or: "или",
        noAccount: "Нет аккаунта?",
        register: "Зарегистрироваться",
        hasAccount: "Уже есть аккаунт?",
        signIn: "Войти",
        birthday: "Дата рождения",
        birthdayHint: "Укажи дату рождения. Её можно будет изменить в профиле.",
        day: "День",
        month: "Месяц",
        year: "Год",
        consentPrefix: "Я согласен с ",
        consentSuffix: " на обработку моих персональных данных.",
        privacy: "Политикой конфиденциальности",
        registerUnavailable: "Регистрация пока недоступна. Подключение VK ID или Яндекс ID будет выполнено позже.",
        cookieNotice: "Нажимая «Зарегистрироваться», вы соглашаетесь с Пользовательским соглашением и использованием необходимых файлов cookie для работы сайта.",
        loginPolicy: "Политика конфиденциальности",
      }
    : {
        loginTitle: "Sign in",
        loginSubtitle: "Welcome back to YUME",
        registerTitle: "Create an account",
        registerSubtitle: "Create an account to continue with YUME",
        vk: "Continue with VK ID",
        yandex: "Continue with Yandex ID",
        soon: "Soon",
        or: "or",
        noAccount: "Don't have an account?",
        register: "Sign up",
        hasAccount: "Already have an account?",
        signIn: "Sign in",
        birthday: "Date of birth",
        birthdayHint: "Enter your date of birth. You can change it later in your profile.",
        day: "Day",
        month: "Month",
        year: "Year",
        consentPrefix: "I agree to the ",
        consentSuffix: " for the processing of my personal data.",
        privacy: "Privacy Policy",
        registerUnavailable: "Registration is not available yet. VK ID or Yandex ID sign-in will be connected later.",
        cookieNotice: "By clicking “Create an account”, you agree to the User Agreement and the use of essential cookies needed for the site to work.",
        loginPolicy: "Privacy Policy",
      };

  const months = isRu
    ? ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);
  const daysInMonth = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const birthday = day && month && year ? new Date(Number(year), Number(month) - 1, Number(day)) : null;
  const validBirthday = Boolean(
    birthday &&
      birthday.getFullYear() === Number(year) &&
      birthday.getMonth() === Number(month) - 1 &&
      birthday.getDate() === Number(day) &&
      birthday.getTime() <= Date.now() &&
      Number(year) >= 1900,
  );

  const submitRegistration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validBirthday || !consentAccepted || !providerConnected) return;
    setRegistrationMessage(copy.registerUnavailable);
  };

  const providerButton = (label: string, brand: "vk" | "yandex") => (
    <button key={brand} type="button" disabled aria-disabled="true" className="flex min-h-12 w-full cursor-not-allowed items-center gap-3 rounded-xl border border-border bg-secondary/60 px-4 text-left text-sm font-semibold text-foreground/70 opacity-80">
      <span className={brand === "vk" ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0077FF]/15 text-xs font-extrabold text-[#4C9AFF]" : "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FC3F1D]/15 text-sm font-extrabold text-[#FC5A3D]"}>
        {brand === "vk" ? "VK" : "Я"}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{copy.soon}</span>
    </button>
  );

  return (
    <main id="main-content" className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 pb-10 pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-[100px]" />
      <div className="w-full max-w-md">
        <section className="rounded-3xl border border-border bg-card/95 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_32px_rgba(155,92,255,0.16)]">
              {mode === "login" ? <LogIn className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">YUME</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{mode === "login" ? copy.loginTitle : copy.registerTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode === "login" ? copy.loginSubtitle : copy.registerSubtitle}</p>
          </div>

          <div className="grid gap-3">
            {providerButton(copy.vk, "vk")}
            {providerButton(copy.yandex, "yandex")}
          </div>

          {mode === "login" ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /><span>{copy.or}</span><span className="h-px flex-1 bg-border" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {copy.noAccount}{" "}
                <button type="button" onClick={() => onModeChange("register")} className="font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition hover:text-foreground">{copy.register}</button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={submitRegistration} className="space-y-5">
                <fieldset>
                  <legend className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-primary" />{copy.birthday} <span className="text-destructive">*</span>
                  </legend>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{copy.birthdayHint}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <select required aria-label={copy.day} value={day} onChange={(event) => { setDay(event.target.value); setRegistrationMessage(""); }} className="h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary">
                      <option value="">{copy.day}</option>
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select required aria-label={copy.month} value={month} onChange={(event) => {
                        const nextMonth = event.target.value;
                        const maxDay = nextMonth && year ? new Date(Number(year), Number(nextMonth), 0).getDate() : 31;
                        if (day && Number(day) > maxDay) setDay("");
                        setMonth(nextMonth);
                        setRegistrationMessage("");
                      }} className="h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary">
                      <option value="">{copy.month}</option>
                      {months.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}
                    </select>
                    <select required aria-label={copy.year} value={year} onChange={(event) => {
                        const nextYear = event.target.value;
                        const maxDay = month && nextYear ? new Date(Number(nextYear), Number(month), 0).getDate() : 31;
                        if (day && Number(day) > maxDay) setDay("");
                        setYear(nextYear);
                        setRegistrationMessage("");
                      }} className="h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary">
                      <option value="">{copy.year}</option>
                      {years.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                </fieldset>

                <div className="flex items-start gap-3">
                  <input id="yume-privacy-consent" type="checkbox" required checked={consentAccepted} onChange={(event) => { setConsentAccepted(event.target.checked); setRegistrationMessage(""); }} aria-label={copy.consentPrefix + copy.privacy + copy.consentSuffix} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    <label htmlFor="yume-privacy-consent">{copy.consentPrefix}</label>
                    <button type="button" onClick={onPrivacy} className="font-semibold text-primary underline decoration-primary/70 underline-offset-2 transition hover:text-foreground">{copy.privacy}</button>
                    <label htmlFor="yume-privacy-consent">{copy.consentSuffix}</label>
                  </div>
                </div>

                <div>
                  <button type="submit" disabled={!validBirthday || !consentAccepted || !providerConnected} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_8px_26px_rgba(155,92,255,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
                    {copy.register}
                  </button>
                  <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">{copy.cookieNotice}</p>
                  {!providerConnected && mode === "register" && <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">{isRu ? "Чтобы зарегистрироваться, потребуется подтвердить аккаунт через VK ID или Яндекс ID. Подключение пока недоступно." : "To register, you will need to verify your account through VK ID or Yandex ID. Provider sign-in is not available yet."}</p>}
                </div>

                {registrationMessage && <p role="status" className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{registrationMessage}</p>}
              </form>

              <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /><span>{copy.or}</span><span className="h-px flex-1 bg-border" />
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {copy.hasAccount}{" "}
                <button type="button" onClick={() => onModeChange("login")} className="font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition hover:text-foreground">{copy.signIn}</button>
              </p>
            </>
          )}
        </section>

        {mode === "login" && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={onPrivacy} className="inline-flex items-center gap-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition hover:text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />{copy.loginPolicy}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
