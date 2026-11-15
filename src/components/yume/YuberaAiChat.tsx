import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, BookmarkPlus, CalendarDays, LoaderCircle, Play, Plus, Send, Sparkles, SquarePen, X } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
import { YUBERA_AI_DAILY_QUESTION_LIMIT, type YuberaAiConversation, type YuberaAiMessage } from "@/data/yubera-ai.shared";

const QUICK_QUESTIONS = [
  { text: "Расскажи о проекте YUBERA", icon: "brand" },
  { text: "Порекомендуй мне аниме", icon: "play" },
  { text: "Что посмотреть сегодня?", icon: "calendar" },
  { text: "Расскажи интересный факт об аниме", icon: "book" },
] as const;
const MASCOT = "/images/yubera/YUBERA_AI_Mascot_Transparent.webp";
type UserCollection = { id: string; title: string; title_count: number; is_public: number };

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}
function RecommendationCard({ item, onAdd }: { item: YuberaAiMessage["recommendations"][number]; onAdd: (item: YuberaAiMessage["recommendations"][number]) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/25 p-2.5">
      <button type="button" onClick={() => void navigate({ to: "/anime/$animeId", params: { animeId: item.id } })}
        className="group flex min-w-0 flex-1 items-start gap-3 text-left">
        {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-24 w-16 shrink-0 rounded-xl bg-white/5" />}
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-white">{item.title}</strong>
          <span className="mt-1 block text-xs text-white/55">{[item.year, item.ageRating, item.rating !== null ? item.rating.toFixed(1) : null].filter(Boolean).join(" · ")}</span>
          {item.genres.length > 0 && <span className="mt-1 block text-xs text-white/65">{item.genres.slice(0, 3).join(" · ")}</span>}
          {item.reason && <span className="mt-2 block text-xs leading-relaxed text-white/70">{item.reason}</span>}
        </span>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/45 group-hover:text-[#FF6548]" />
      </button>
      <button type="button" onClick={() => onAdd(item)} aria-label="Добавить в подборку" title="Добавить в подборку"
        className="flex shrink-0 flex-col items-center justify-center gap-1 self-center rounded-xl border border-[#ff6548]/25 bg-[#ff5738]/10 px-2 py-2 text-[10px] font-semibold text-[#ff947f] hover:bg-[#ff5738]/20">
        <BookmarkPlus className="h-5 w-5" />
        <span>В подборку</span>
      </button>
    </div>
  );
}
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g);
  return parts.map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={keyPrefix + index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={keyPrefix + index} className="rounded bg-black/25 px-1 py-0.5 text-[.92em] text-[#ffb19f]">{part.slice(1, -1)}</code>;
    }
    return <span key={keyPrefix + index}>{part.replace(/\\\\([*_])/g, "$1")}</span>;
  });
}
function AssistantText({ content }: { content: string }) {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/^\s*[-*]\s+/gm, "• ");
  const blocks = normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  return <div className="yubera-ai-rich-text">{blocks.map((block, index) => {
    const lines = block.split("\n");
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? "");
    if (heading) return <h3 key={index}>{renderInline(heading[2]!, "h" + index)}</h3>;
    if (lines.every(line => line.startsWith("• "))) {
      return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line.slice(2), "l" + index + "-" + lineIndex)}</li>)}</ul>;
    }
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{renderInline(line.replace(/^\*\*(.+)\*\*$/, "$1"), "p" + index + "-" + lineIndex)}</span>)}</p>;
  })}</div>;
}
function MessageBubble({ message, onAddToCollection }: { message: YuberaAiMessage; onAddToCollection: (item: YuberaAiMessage["recommendations"][number]) => void }) {
  const user = message.role === "user";
  return (
    <div className={user ? "flex justify-end" : "flex justify-start"}>
      <div className={user ? "max-w-[88%] rounded-[22px] rounded-br-md border border-[#FF6548]/25 bg-[#FF5738]/15 px-4 py-3 text-sm leading-relaxed text-white" : "max-w-[94%] rounded-[22px] rounded-bl-md border border-white/10 bg-[#191a22] px-4 py-3 text-sm leading-relaxed text-white/90"}>
        {user ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : <AssistantText content={message.content} />}
        {!user && message.recommendations.length > 0 && <div className="mt-3 grid gap-2">{message.recommendations.map(item => <RecommendationCard key={item.id} item={item} onAdd={onAddToCollection} />)}</div>}
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
  const [collectionTarget, setCollectionTarget] = useState<YuberaAiMessage["recommendations"][number] | null>(null);
  const [userCollections, setUserCollections] = useState<UserCollection[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
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
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: YuberaAiMessage = { id: optimisticId, role: "user", content, recommendations: [], createdAt: new Date().toISOString() };
    setMessages(current => [...current, optimisticMessage]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "24px";
    const controller = new AbortController();
    abort.current = controller;
    let persisted = false;
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
      setMessages(current => [...current.filter(message => message.id !== optimisticId), userMessage, assistantMessage]);
      persisted = true;
      const conversationId = String(data.conversationId);
      setActiveId(conversationId);
      const used = Number(data.used ?? usage.used + 1);
      setUsage(current => ({ ...current, used, remaining: Math.max(0, current.limit - used) }));
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setNotice(ru ? "Ошибка соединения с AI. Вопрос не списан." : "AI connection error. This question was not counted.");
      }
    } finally {
      if (!persisted) setMessages(current => current.filter(message => message.id !== optimisticId));
      setLoading(false);
      abort.current = null;
    }
  }, [activeId, loading, usage.remaining, usage.limit, usage.used, ru, navigate]);

  const openCollectionPicker = async (item: YuberaAiMessage["recommendations"][number]) => {
    setCollectionTarget(item);
    setCollectionError("");
    setNewCollectionTitle("");
    setCollectionLoading(true);
    try {
      const response = await fetch("/api/yubera/community?action=me", { credentials: "same-origin", cache: "no-store" });
      const data = await json(response);
      if (!response.ok) throw new Error(response.status === 401 ? "Войди в аккаунт, чтобы пользоваться подборками." : "Не удалось загрузить подборки.");
      setUserCollections(Array.isArray(data.collections) ? data.collections as UserCollection[] : []);
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Не удалось загрузить подборки.");
    } finally {
      setCollectionLoading(false);
    }
  };
  const addToCollection = async (collectionId: string) => {
    if (!collectionTarget || collectionBusy) return;
    setCollectionBusy(true);
    setCollectionError("");
    try {
      const response = await fetch("/api/yubera/community", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collection.item.add", id: collectionId, animeId: collectionTarget.id }),
      });
      const data = await json(response);
      if (!response.ok) {
        const errors: Record<string,string> = { collection_title_limit_reached: "В этой подборке достигнут лимит тайтлов.", not_found: "Подборка не найдена.", anime_not_found: "Тайтл больше не найден в каталоге.", catalog_unavailable: "Каталог временно недоступен." };
        throw new Error(errors[String(data.error)] ?? "Не удалось добавить аниме в подборку.");
      }
      const title = userCollections.find(item => item.id === collectionId)?.title ?? "подборку";
      setCollectionTarget(null);
      setNotice(`«${collectionTarget.title}» добавлено в подборку «${title}».`);
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Не удалось добавить аниме.");
    } finally {
      setCollectionBusy(false);
    }
  };
  const createCollectionAndAdd = async () => {
    const title = newCollectionTitle.trim();
    if (!title || !collectionTarget || collectionBusy) return;
    setCollectionBusy(true);
    setCollectionError("");
    try {
      const created = await fetch("/api/yubera/community", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collection.create", title, description: "", coverKey: null, isPublic: false }),
      });
      const createdData = await json(created);
      if (!created.ok || typeof createdData.id !== "string") {
        const errors: Record<string,string> = { collection_limit_reached: "Достигнут лимит подборок для вашего тарифа." };
        throw new Error(errors[String(createdData.error)] ?? "Не удалось создать подборку.");
      }
      const id = createdData.id;
      const added = await fetch("/api/yubera/community", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collection.item.add", id, animeId: collectionTarget.id }),
      });
      const addedData = await json(added);
      if (!added.ok) throw new Error(addedData.error === "collection_title_limit_reached" ? "Подборка создана, но добавить тайтл не удалось из-за лимита." : "Подборка создана, но добавить тайтл не удалось.");
      setCollectionTarget(null);
      setNotice(`«${collectionTarget.title}» добавлено в новую подборку «${title}».`);
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Не удалось создать подборку.");
    } finally {
      setCollectionBusy(false);
    }
  };

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
          {(messages.length > 0 || loading) && <div className="yubera-ai-messages">{messages.map(message => <MessageBubble key={message.id} message={message} onAddToCollection={openCollectionPicker} />)}{loading && <div className="flex items-center gap-2 text-xs text-white/60"><span className="h-2 w-2 animate-pulse rounded-full bg-[#FF6548]" />YUBERA AI…</div>}</div>}
        </>}
        {notice && <div role="status" className="mx-2 mb-3 rounded-xl border border-[#FF6548]/25 bg-[#FF5738]/10 px-3 py-2 text-xs text-white/80">{notice}</div>}
      </main>
      {collectionTarget && <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !collectionBusy) setCollectionTarget(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="yubera-ai-collection-title" className="max-h-[min(78vh,640px)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-[#191a22] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><h2 id="yubera-ai-collection-title" className="text-base font-bold text-white">Добавить в подборку</h2><p className="mt-1 truncate text-xs text-white/55">{collectionTarget.title}</p></div>
            <button type="button" disabled={collectionBusy} onClick={() => setCollectionTarget(null)} aria-label="Закрыть" className="rounded-full p-2 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          {collectionLoading ? <div className="flex justify-center py-8"><LoaderCircle className="h-6 w-6 animate-spin text-[#ff6548]" /></div> : <>
            {userCollections.length > 0 && <div className="mb-4 max-h-52 space-y-2 overflow-y-auto">{userCollections.map(collection => <button key={collection.id} type="button" disabled={collectionBusy} onClick={() => void addToCollection(collection.id)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left hover:border-[#ff6548]/40 disabled:opacity-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff5738]/10 text-[#ff765c]"><BookmarkPlus className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{collection.title}</b><span className="text-xs text-white/45">{collection.title_count} тайтлов · {collection.is_public ? "Публичная" : "Приватная"}</span></span><Plus className="h-4 w-4 text-white/45" /></button>)}</div>}
            {userCollections.length === 0 && <p className="mb-3 rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-sm text-white/55">У тебя пока нет подборок. Создай первую прямо здесь.</p>}
            <form onSubmit={event => { event.preventDefault(); void createCollectionAndAdd(); }} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <label htmlFor="yubera-ai-new-collection" className="mb-2 block text-xs font-semibold text-white/70">Новая подборка</label>
              <div className="flex gap-2"><input id="yubera-ai-new-collection" value={newCollectionTitle} onChange={event => setNewCollectionTitle(event.target.value)} maxLength={50} placeholder="Название подборки" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101116] px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff6548]/60" /><button type="submit" disabled={!newCollectionTitle.trim() || collectionBusy} className="shrink-0 rounded-lg bg-[#ff5738]/20 px-3 py-2 text-xs font-bold text-[#ff947f] disabled:opacity-40">{collectionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Создать и добавить"}</button></div>
            </form>
          </>}
          {collectionError && <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">{collectionError}</p>}
        </section>
      </div>}
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
