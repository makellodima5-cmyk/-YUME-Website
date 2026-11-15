import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, LoaderCircle, MessageCircle, Paperclip, Play, Send, Sparkles } from "lucide-react";
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
function BrandIcon() { return <img src="/images/yubera/yubera_logo.webp" alt="" className="h-9 w-9 object-contain" />; }
function QuickIcon({ icon }: { icon: string }) {
  if (icon === "play") return <Play className="h-7 w-7" />;
  if (icon === "calendar") return <CalendarDays className="h-7 w-7" />;
  if (icon === "book") return <BookOpen className="h-7 w-7" />;
  return <BrandIcon />;
}
export function YuberaAiChat() {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<YuberaAiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<YuberaAiMessage[]>([]);
  const [usage, setUsage] = useState({ used: 0, limit: YUBERA_AI_DAILY_QUESTION_LIMIT, remaining: YUBERA_AI_DAILY_QUESTION_LIMIT });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

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
      setConversations(rows);
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
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading || usage.remaining <= 0) return;
    setInput("");
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
        const used = Number(data.limit ?? usage.limit);
        setUsage(current => ({ ...current, remaining: 0, used: used || current.limit }));
        setNotice(ru ? "Дневной лимит из 20 вопросов исчерпан." : "The daily limit of 20 questions has been reached.");
        return;
      }
      if (response.status === 401) { void navigate({ to: "/", search: { section: "login" } }); return; }
      if (response.status === 403) { setNotice(ru ? "Для YUBERA AI нужна подписка Plus." : "YUBERA AI requires Plus."); return; }
      if (!response.ok) {
        if (data.questionCharged === true) setUsage(current => ({ ...current, used: Math.min(current.limit, current.used + 1), remaining: Math.max(0, current.remaining - 1) }));
        setNotice(ru ? "AI временно недоступен. Попробуй ещё раз позже." : "AI is temporarily unavailable. Try again later.");
        return;
      }
      const userMessage = data.userMessage as YuberaAiMessage;
      const assistantMessage = data.assistantMessage as YuberaAiMessage;
      setMessages(current => [...current, userMessage, assistantMessage]);
      const conversationId = String(data.conversationId);
      setActiveId(conversationId);
      const used = Number(data.used ?? usage.used + 1);
      setUsage(current => ({ ...current, used, remaining: Math.max(0, current.limit - used) }));
      setConversations(current => [
        { id: conversationId, title: current.find(item => item.id === conversationId)?.title ?? content.slice(0, 90), updatedAt: new Date().toISOString(), messages: [...messages, userMessage, assistantMessage] },
        ...current.filter(item => item.id !== conversationId),
      ].slice(0, 30));
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setNotice(ru ? "Ошибка соединения с AI." : "AI connection error.");
    } finally {
      setLoading(false);
      abort.current = null;
    }
  }, [activeId, loading, usage.remaining, usage.limit, usage.used, ru, navigate, messages]);

  const newChat = () => { setActiveId(null); setMessages([]); setNotice(""); setInput(""); inputRef.current?.focus(); };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
  };

  return (
    <div className="yubera-ai-page">
      <header className="yubera-ai-header">
        <button type="button" onClick={() => void navigate({ to: "/" })} aria-label={ru ? "Назад" : "Back"}><ArrowLeft /></button>
        <div className="flex items-center gap-2"><span className="font-display text-lg font-extrabold tracking-tight">YUBERA <span className="text-[#FF5B3D]">AI</span></span></div>
        <button type="button" onClick={newChat} aria-label={ru ? "Новый диалог" : "New chat"}><Sparkles /></button>
      </header>
      {conversations.length > 0 && <div className="yubera-ai-history flex gap-2 overflow-x-auto px-4 py-2">{conversations.map(item => <button key={item.id} type="button" onClick={() => { setActiveId(item.id); setMessages(item.messages); setNotice(""); }} className={"max-w-48 shrink-0 truncate rounded-full border px-3 py-1.5 text-xs " + (activeId === item.id ? "border-[#FF6548] bg-[#FF5738]/10" : "border-white/10 bg-white/[.03]")}>{item.title}</button>)}</div>}
      <main className="yubera-ai-main" ref={scroller}>
        {booting ? <div className="flex flex-1 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-[#FF6548]" /></div> :
          messages.length === 0 ? <div className="yubera-ai-welcome">
            <img src={MASCOT} alt="" className="yubera-ai-mascot" />
            <h1>YUBERA <span>AI</span></h1>
            <div className="yubera-ai-tag"><Sparkles /><span>{ru ? "Твой аниме помощник" : "Your anime assistant"}</span></div>
            <p className="yubera-ai-intro">{ru ? "Задавай вопросы, ищи аниме, получай рекомендации и узнавай новое из мира аниме." : "Ask questions, discover anime, get recommendations and learn new things about anime."}</p>
            <div className="yubera-ai-quick">{QUICK_QUESTIONS.map(question => <button key={question.text} type="button" onClick={() => void send(question.text)}><span className="yubera-ai-quick-icon"><QuickIcon icon={question.icon} /></span><span>{ru ? question.text : ({ "Расскажи о проекте YUBERA": "Tell me about YUBERA", "Порекомендуй мне аниме": "Recommend an anime", "Что посмотреть сегодня?": "What should I watch today?", "Расскажи интересный факт об аниме": "Tell me an interesting anime fact" } as Record<string, string>)[question.text]}</span><ArrowRight className="h-5 w-5 text-white/50" /></button>)}</div>
          </div> :
          <div className="yubera-ai-messages">{messages.map(message => <MessageBubble key={message.id} message={message} />)}{loading && <div className="flex items-center gap-2 text-xs text-white/60"><span className="h-2 w-2 animate-pulse rounded-full bg-[#FF6548]" />YUBERA AI…</div>}</div>}
        {notice && <div role="status" className="mx-4 mb-2 rounded-xl border border-[#FF6548]/25 bg-[#FF5738]/10 px-3 py-2 text-xs text-white/80">{notice}</div>}
      </main>
      <div className="yubera-ai-composer-wrap">
        <div className="mb-2 flex justify-between text-[11px] text-white/45"><span>YUBERA AI</span><span>{usage.used}/{usage.limit} {ru ? "вопросов сегодня" : "questions today"}</span></div>
        <form onSubmit={submit} className="yubera-ai-composer">
          <button type="button" aria-label={ru ? "Прикрепление пока недоступно" : "Attachments are not available yet"} disabled title={ru ? "Прикрепление файлов пока не поддерживается" : "Attachments are not supported yet"}><Paperclip /></button>
          <textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={keyDown} maxLength={1200} rows={1} placeholder={ru ? "Напишите сообщение…" : "Write a message…"} disabled={loading || booting || usage.remaining <= 0} />
          <button type="submit" disabled={!input.trim() || loading || booting || usage.remaining <= 0} aria-label={ru ? "Отправить" : "Send"}><Send /></button>
        </form>
      </div>
    </div>
  );
}
