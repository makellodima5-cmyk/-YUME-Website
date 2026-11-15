import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, LoaderCircle, Play, Send, Sparkles, SquarePen } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
import { YUBERA_AI_DAILY_QUESTION_LIMIT, type YuberaAiConversation, type YuberaAiMessage } from "@/data/yubera-ai.shared";

const QUICK_QUESTIONS = [
  { text: "Расскажи о проекте YUBERA", icon: "brand" },
  { text: "Порекомендуй мне аниме", icon: "play" },
  { text: "Что посмотреть сегодня?", icon: "calendar" },
  { text: "Расскажи интересный факт об аниме", icon: "book" },
] as const;
const MASCOT = "/images/yubera/YUBERA_AI_Mascot_Transparent.webp";

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}
function RecommendationCard({ item }: { item: YuberaAiMessage["recommendations"][number] }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate({ to: "/anime/$animeId", params: { animeId: item.id } })}
      className="group flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-2.5 text-left transition hover:border-[#FF5A3C]/50 hover:bg-white/[.04]">
      {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-24 w-16 shrink-0 rounded-xl bg-white/5" />}
      <span className="min-w-0 flex-1">
        <strong className="block text-sm text-white">{item.title}</strong>
        <span className="mt-1 block text-xs text-white/55">{[item.year, item.ageRating, item.rating !== null ? item.rating.toFixed(1) : null].filter(Boolean).join(" · ")}</span>
        {item.genres.length > 0 && <span className="mt-1 block text-xs text-white/65">{item.genres.slice(0, 3).join(" · ")}</span>}
        {item.reason && <span className="mt-2 block text-xs leading-relaxed text-white/70">{item.reason}</span>}
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/45 group-hover:text-[#FF6548]" />
    </button>
  );
}
function MessageBubble({ message }: { message: YuberaAiMessage }) {
  const user = message.role === "user";
  return (
    <div className={user ? "flex justify-end" : "flex justify-start"}>
      <div className={user ? "max-w-[88%] rounded-[22px] rounded-br-md border border-[#FF6548]/25 bg-[#FF5738]/15 px-4 py-3 text-sm leading-relaxed text-white" : "max-w-[94%] rounded-[22px] rounded-bl-md border border-white/10 bg-[#191a22] px-4 py-3 text-sm leading-relaxed text-white/90"}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {!user && message.recommendations.length > 0 && <div className="mt-3 grid gap-2">{message.recommendations.map(item => <RecommendationCard key={item.id} item={item} />)}</div>}
        <time className="mt-2 block text-right text-[10px] text-white/35">{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time>
      </div>
    </div>
  );
}
function BrandIcon() { return <img src="/images/yubera/yubera_logo.webp" alt="" className="h-7 w-7 object-contain" />; }
function QuickIcon({ icon }: { icon: string }) {
  if (icon === "play") return <Play className="h-6 w-6" />;
  if (icon === "calendar") return <CalendarDays className="h-6 w-6" />;
  if (icon === "book") return <BookOpen className="h-6 w-6" />;
  return <BrandIcon />;
}
export function YuberaAiChat() {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<YuberaAiMessage[]>([]);
  const [usage, setUsage] = useState({ used: 0, limit: YUBERA_AI_DAILY_QUESTION_LIMIT, remaining: YUBERA_AI_DAILY_QUESTION_LIMIT });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  const updateVisualViewport = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    const viewport = window.visualViewport;
    page.style.setProperty("--yubera-ai-viewport-top", `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
    page.style.setProperty("--yubera-ai-viewport-height", `${Math.max(1, viewport?.height ?? window.innerHeight)}px`);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    updateVisualViewport();
    window.addEventListener("resize", updateVisualViewport);
    viewport?.addEventListener("resize", updateVisualViewport);
    viewport?.addEventListener("scroll", updateVisualViewport);
    return () => {
      window.removeEventListener("resize", updateVisualViewport);
      viewport?.removeEventListener("resize", updateVisualViewport);
      viewport?.removeEventListener("scroll", updateVisualViewport);
    };
  }, [updateVisualViewport]);

  const load = useCallback(async () => {
    setBooting(true);
    try {
      const response = await fetch("/api/yubera/ai", { credentials: "same-origin", cache: "no-store" });
      const data = await json(response);
      if (!response.ok) {
        if (response.status === 401) void navigate({ to: "/", search: { section: "login" } });
        else if (response.status === 403) setNotice(ru ? "YUBERA AI доступен подписчикам Plus." : "YUBERA AI is available to Plus subscribers.");
        else setNotice(ru ? "Не удалось загрузить чат." : "Could not load chat.");
        return;
      }
      const rows = Array.isArray(data.conversations) ? data.conversations as YuberaAiConversation[] : [];
      setUsage({ used: Number(data.used ?? 0), limit: Number(data.limit ?? 20), remaining: Number(data.remaining ?? 20) });
      if (rows.length > 0) {
        setActiveId(rows[0]!.id);
        setMessages(rows[0]!.messages ?? []);
      } else {
        setActiveId(null);
        setMessages([]);
      }
      if (data.configured === false) setNotice(ru ? "AI пока не настроен. Подключение появится после добавления серверного ключа." : "AI is not configured yet.");
    } catch {
      setNotice(ru ? "Нет соединения с сервером." : "Could not reach the server.");
    } finally {
      setBooting(false);
    }
  }, [navigate, ru]);

  useEffect(() => {
    void load();
    return () => abort.current?.abort();
  }, [load]);
  useEffect(() => {
    if (messages.length > 0 || loading) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading || usage.remaining <= 0) return;
    setNotice("");
    setLoading(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/yubera/ai", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId: activeId }),
        signal: controller.signal,
      });
      const data = await json(response);
      if (response.status === 422) {
        setNotice(String(data.message ?? (ru ? "Я отвечаю только на темы аниме и YUBERA." : "I only answer anime and YUBERA questions.")));
        return;
      }
      if (response.status === 429) {
        if (data.error === "rate_limited") {
          setNotice(ru ? "Слишком много запросов подряд. Попробуй через минуту." : "Too many requests in a short period. Try again in a minute.");
          return;
        }
        const used = Number(data.used ?? data.limit ?? usage.limit);
        setUsage(current => ({ ...current, remaining: 0, used: Math.min(current.limit, used || current.limit) }));
        setNotice(ru ? "Дневной лимит из 20 вопросов исчерпан." : "The daily limit of 20 questions has been reached.");
        return;
      }
      if (response.status === 401) { void navigate({ to: "/", search: { section: "login" } }); return; }
      if (response.status === 403) { setNotice(ru ? "Для YUBERA AI нужна подписка Plus." : "YUBERA AI requires Plus."); return; }
      if (!response.ok) {
        if (data.questionCharged === true) {
          setUsage(current => ({ ...current, used: Math.min(current.limit, current.used + 1), remaining: Math.max(0, current.remaining - 1) }));
        }
        setNotice(ru ? "AI временно недоступен. Попробуй ещё раз позже. Вопрос не списан." : "AI is temporarily unavailable. This question was not counted.");
        return;
      }
      const userMessage = data.userMessage as YuberaAiMessage;
      const assistantMessage = data.assistantMessage as YuberaAiMessage;
      setMessages(current => [...current, userMessage, assistantMessage]);
      const conversationId = String(data.conversationId);
      setActiveId(conversationId);
      const used = Number(data.used ?? usage.used + 1);
      setUsage(current => ({ ...current, used, remaining: Math.max(0, current.limit - used) }));
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "24px";
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setNotice(ru ? "Ошибка соединения с AI. Вопрос не списан." : "AI connection error. This question was not counted.");
      }
    } finally {
      setLoading(false);
      abort.current = null;
    }
  }, [activeId, loading, usage.remaining, usage.limit, usage.used, ru, navigate]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setNotice("");
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "24px";
    inputRef.current?.focus();
  };
  const changeInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    setInput(element.value);
    element.style.height = "24px";
    element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
  };

  return (
    <div className="yubera-ai-page" ref={pageRef}>
      <main className="yubera-ai-main" ref={scroller}>
        {booting ? <div className="flex flex-1 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-[#FF6548]" /></div> : <>
          <div className="yubera-ai-welcome">
            <img src={MASCOT} alt="" className="yubera-ai-mascot" />
            <h1>YUBERA <span>AI</span></h1>
            <div className="yubera-ai-tag"><Sparkles /><span>{ru ? "Твой аниме помощник" : "Your anime assistant"}</span></div>
            <p className="yubera-ai-intro">{ru ? "Задавай вопросы, ищи аниме, получай рекомендации и узнавай новое из мира аниме." : "Ask questions, discover anime, get recommendations and learn new things about anime."}</p>
            <div className="yubera-ai-quick">{QUICK_QUESTIONS.map(question => <button key={question.text} type="button" disabled={loading || usage.remaining <= 0} onClick={() => void send(question.text)}><span className="yubera-ai-quick-icon"><QuickIcon icon={question.icon} /></span><span>{ru ? question.text : ({ "Расскажи о проекте YUBERA": "Tell me about YUBERA", "Порекомендуй мне аниме": "Recommend an anime", "Что посмотреть сегодня?": "What should I watch today?", "Расскажи интересный факт об аниме": "Tell me an interesting anime fact" } as Record<string, string>)[question.text]}</span><ArrowRight className="h-4 w-4 text-white/50" /></button>)}</div>
          </div>
          {(messages.length > 0 || loading) && <div className="yubera-ai-messages">{messages.map(message => <MessageBubble key={message.id} message={message} />)}{loading && <div className="flex items-center gap-2 text-xs text-white/60"><span className="h-2 w-2 animate-pulse rounded-full bg-[#FF6548]" />YUBERA AI…</div>}</div>}
        </>}
        {notice && <div role="status" className="mx-2 mb-3 rounded-xl border border-[#FF6548]/25 bg-[#FF5738]/10 px-3 py-2 text-xs text-white/80">{notice}</div>}
      </main>
      <div className="yubera-ai-composer-wrap">
        <div className="yubera-ai-composer-meta">
          <span>YUBERA AI</span>
          <button type="button" onClick={newChat} disabled={booting || loading} aria-label={ru ? "Новый диалог" : "New chat"}><SquarePen className="h-3.5 w-3.5" /><span>{ru ? "Новый диалог" : "New chat"}</span></button>
          <span>{usage.used}/{usage.limit} {ru ? "вопросов сегодня" : "questions today"}</span>
        </div>
        <form onSubmit={submit} className="yubera-ai-composer">
          <textarea ref={inputRef} value={input} onChange={changeInput} onKeyDown={keyDown} maxLength={1200} rows={1} placeholder={ru ? "Напишите сообщение…" : "Write a message…"} disabled={loading || booting || usage.remaining <= 0} />
          <button type="submit" disabled={!input.trim() || loading || booting || usage.remaining <= 0} aria-label={ru ? "Отправить" : "Send"}><Send /></button>
        </form>
      </div>
    </div>
  );
}
