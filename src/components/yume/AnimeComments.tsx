import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Send,
  ThumbsUp,
  Trash2,
} from "lucide-react";

type Language = "ru" | "en";
type Viewer = { id: string; name: string; username: string | null; avatarUrl: string | null } | null;
type Comment = {
  id: string;
  animeId: string;
  parentId: string | null;
  threadRootId: string;
  replyToUserId: string | null;
  replyToName: string | null;
  body: string;
  likeCount: number;
  createdAt: string;
  deleted: boolean;
  authorId: string | null;
  authorName: string;
  avatarUrl: string | null;
  liked: boolean;
};
type ThreadComment = Comment & {
  replies: Comment[];
  replyCount: number;
  hasMoreReplies: boolean;
  replyCursor: string | null;
};
type PageResponse = {
  comments: ThreadComment[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  viewer: Viewer;
};
type ReplyPageResponse = {
  replies: Comment[];
  nextCursor: string | null;
  hasMore: boolean;
};
type MutationResponse = {
  error?: string;
  comment?: Comment;
  totalCount?: number;
  created?: boolean;
  commentId?: string;
  liked?: boolean;
  likeCount?: number;
  tombstoned?: boolean;
};

type Props = {
  animeId: string;
  language: Language;
  onAuthRequired: () => void;
};

const COPY = {
  ru: {
    title: "Комментарии",
    composer: "Написать комментарий…",
    replyComposer: "Написать ответ…",
    send: "Отправить",
    reply: "Ответить",
    like: "Нравится",
    unlike: "Убрать отметку «Нравится»",
    more: "Показать ещё комментарии",
    collapse: "Свернуть комментарии",
    moreReplies: "Показать ещё ответы",
    emptyTitle: "Пока здесь нет комментариев",
    emptyBody: "Стань первым, кто поделится своим мнением об этом аниме!",
    deleted: "Комментарий удалён",
    delete: "Удалить",
    confirmDelete: "Удалить этот комментарий? Это действие нельзя отменить.",
    loading: "Загружаем комментарии…",
    loadError: "Не удалось загрузить комментарии. Попробуй ещё раз.",
    sendError: "Не удалось отправить сообщение. Попробуй ещё раз.",
    sent: "Комментарий опубликован.",
    deletedSuccess: "Комментарий удалён.",
    login: "Войди через Telegram, чтобы участвовать в обсуждении.",
    justNow: "Только что",
    minutes: "мин. назад",
    hours: "ч. назад",
    days: "д. назад",
    replyTo: "Ответ для",
    loadMoreError: "Не удалось загрузить следующие комментарии.",
  },
  en: {
    title: "Comments",
    composer: "Write a comment…",
    replyComposer: "Write a reply…",
    send: "Send",
    reply: "Reply",
    like: "Like",
    unlike: "Unlike",
    more: "Show more comments",
    collapse: "Collapse comments",
    moreReplies: "Show more replies",
    emptyTitle: "No comments yet",
    emptyBody: "Be the first to share your thoughts about this anime!",
    deleted: "Comment deleted",
    delete: "Delete",
    confirmDelete: "Delete this comment? This action cannot be undone.",
    loading: "Loading comments…",
    loadError: "Could not load comments. Please try again.",
    sendError: "Could not publish the comment. Please try again.",
    sent: "Comment published.",
    deletedSuccess: "Comment deleted.",
    login: "Sign in with Telegram to join the discussion.",
    justNow: "Just now",
    minutes: "m ago",
    hours: "h ago",
    days: "d ago",
    replyTo: "Replying to",
    loadMoreError: "Could not load more comments.",
  },
} as const;

function initials(name: string): string {
  const value = name.trim();
  if (!value) return "Y";
  return value.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase();
}

function relativeTime(value: string, language: Language): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const copy = COPY[language];
  if (seconds < 60) return copy.justNow;
  if (seconds < 3600) return Math.floor(seconds / 60) + " " + copy.minutes;
  if (seconds < 86400) return Math.floor(seconds / 3600) + " " + copy.hours;
  return Math.floor(seconds / 86400) + " " + copy.days;
}

function Avatar({ name, url, size = "h-10 w-10" }: { name: string; url: string | null; size?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={"flex " + size + " shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-secondary text-xs font-semibold text-foreground"}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : initials(name)}
    </span>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  loading,
  placeholder,
  sendLabel,
  onAuthRequired,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  loading: boolean;
  placeholder: string;
  sendLabel: string;
  onAuthRequired: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (disabled) onAuthRequired();
      else onSubmit();
    }
  };
  return (
    <div className="flex min-w-0 items-end gap-2 rounded-full border border-white/20 bg-white/[0.055] px-3 py-2 shadow-inner focus-within:border-primary/70">
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (disabled) onAuthRequired(); }}
        readOnly={disabled}
        rows={1}
        maxLength={1000}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-28 min-h-7 min-w-0 flex-1 resize-y bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => disabled ? onAuthRequired() : onSubmit()}
        disabled={!disabled && (loading || !value.trim())}
        aria-label={sendLabel}
        title={sendLabel}
        className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AnimeComments({ animeId, language, onAuthRequired }: Props) {
  const copy = COPY[language];
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);
  const [replyPosting, setReplyPosting] = useState(false);
  const [busyLikes, setBusyLikes] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const requestLock = useRef(false);
  const pageLock = useRef(false);
  const busyLikeIds = useRef(new Set<string>());

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/anime-comments?animeId=" + encodeURIComponent(animeId), {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as Partial<PageResponse>;
      if (!response.ok || !Array.isArray(payload.comments)) throw new Error("comments_load_failed");
      setComments(payload.comments);
      setCount(Math.max(0, Number(payload.totalCount) || 0));
      setViewer(payload.viewer ?? null);
      setHasMore(payload.hasMore === true);
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [animeId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || pageLock.current) return;
    pageLock.current = true;
    setLoadingMore(true);
    try {
      const url = "/api/anime-comments?animeId=" + encodeURIComponent(animeId) + "&cursor=" + encodeURIComponent(nextCursor);
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as Partial<PageResponse>;
      if (!response.ok || !Array.isArray(payload.comments)) throw new Error("comments_page_failed");
      setComments(current => {
        const known = new Set(current.map(comment => comment.id));
        return [...current, ...payload.comments!.filter(comment => !known.has(comment.id))];
      });
      setNextCursor(payload.nextCursor ?? null);
      setHasMore(payload.hasMore === true);
      setCount(Math.max(0, Number(payload.totalCount) || 0));
    } catch {
      setStatus(copy.loadMoreError);
    } finally {
      pageLock.current = false;
      setLoadingMore(false);
    }
  }, [animeId, copy.loadMoreError, nextCursor]);

  const loadMoreReplies = useCallback(async (rootId: string) => {
    const root = comments.find(comment => comment.id === rootId);
    if (!root?.replyCursor || pageLock.current) return;
    pageLock.current = true;
    setLoadingMore(true);
    try {
      const url = "/api/anime-comments?animeId=" + encodeURIComponent(animeId) +
        "&threadId=" + encodeURIComponent(rootId) + "&cursor=" + encodeURIComponent(root.replyCursor);
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as Partial<ReplyPageResponse>;
      if (!response.ok || !Array.isArray(payload.replies)) throw new Error("replies_page_failed");
      setComments(current => current.map(item => {
        if (item.id !== rootId) return item;
        const known = new Set(item.replies.map(reply => reply.id));
        return {
          ...item,
          replies: [...item.replies, ...payload.replies!.filter(reply => !known.has(reply.id))],
          replyCursor: payload.nextCursor ?? null,
          hasMoreReplies: payload.hasMore === true,
        };
      }));
    } catch {
      setStatus(copy.loadMoreError);
    } finally {
      pageLock.current = false;
      setLoadingMore(false);
    }
  }, [animeId, comments, copy.loadMoreError]);

  const post = useCallback(async (text: string, parent: Comment | null) => {
    if (!viewer) {
      onAuthRequired();
      return;
    }
    if (requestLock.current || !text.trim()) return;
    requestLock.current = true;
    if (parent) setReplyPosting(true);
    else setPosting(true);
    setStatus("");
    try {
      const response = await fetch("/api/anime-comments", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: parent ? "reply" : "create",
          animeId,
          text,
          ...(parent ? { parentId: parent.id } : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as MutationResponse;
      if (!response.ok || !payload.comment) throw new Error(payload.error ?? "comment_post_failed");
      const saved = payload.comment;
      if (parent) {
        setComments(current => current.map(root => root.id === parent.threadRootId
          ? {
              ...root,
              replies: [...root.replies.filter(reply => reply.id !== saved.id), saved].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
              replyCount: root.replyCount + (payload.created === false ? 0 : 1),
              hasMoreReplies: root.hasMoreReplies,
            }
          : root));
        setReplyDraft("");
        setReplyTarget(null);
      } else {
        setComments(current => [ { ...saved, replies: [], replyCount: 0, hasMoreReplies: false, replyCursor: null }, ...current.filter(item => item.id !== saved.id) ]);
        setDraft("");
        setExpanded(true);
      }
      setCount(Math.max(0, Number(payload.totalCount) || 0));
      setStatus(copy.sent);
    } catch {
      setStatus(copy.sendError);
    } finally {
      requestLock.current = false;
      setPosting(false);
      setReplyPosting(false);
    }
  }, [animeId, copy.sendError, copy.sent, onAuthRequired, viewer]);

  const toggleLike = useCallback(async (comment: Comment) => {
    if (!viewer) {
      onAuthRequired();
      return;
    }
    if (comment.deleted || busyLikeIds.current.has(comment.id)) return;
    busyLikeIds.current.add(comment.id);
    setBusyLikes(current => new Set(current).add(comment.id));
    try {
      const response = await fetch("/api/anime-comments", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "like", animeId, commentId: comment.id, liked: !comment.liked }),
      });
      const payload = await response.json().catch(() => ({})) as MutationResponse;
      if (!response.ok || typeof payload.likeCount !== "number") throw new Error(payload.error ?? "like_failed");
      const update = (item: Comment): Comment => item.id === comment.id
        ? { ...item, liked: payload.liked === true, likeCount: Math.max(0, payload.likeCount ?? 0) }
        : item;
      setComments(current => current.map(root => ({
        ...update(root),
        replies: root.replies.map(update),
      })));
    } catch {
      setStatus(language === "en" ? "Could not update the like." : "Не удалось обновить отметку «Нравится».");
    } finally {
      busyLikeIds.current.delete(comment.id);
      setBusyLikes(current => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  }, [animeId, language, onAuthRequired, viewer]);

  const removeComment = useCallback(async (comment: Comment) => {
    if (!viewer) {
      onAuthRequired();
      return;
    }
    if (!window.confirm(copy.confirmDelete)) return;
    try {
      const response = await fetch("/api/anime-comments", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ animeId, commentId: comment.id }),
      });
      const payload = await response.json().catch(() => ({})) as MutationResponse;
      if (!response.ok || payload.deleted !== true) throw new Error(payload.error ?? "delete_failed");
      if (payload.tombstoned) {
        const tombstone = (item: Comment): Comment => item.id === comment.id
          ? { ...item, deleted: true, body: "", authorId: null, authorName: "", avatarUrl: null, likeCount: 0, liked: false }
          : item;
        setComments(current => current.map(root => ({ ...tombstone(root), replies: root.replies.map(tombstone) })));
      } else {
        setComments(current => current
          .filter(root => root.id !== comment.id)
          .map(root => ({ ...root, replies: root.replies.filter(reply => reply.id !== comment.id) })));
      }
      setCount(Math.max(0, Number(payload.totalCount) || 0));
      setOpenMenu(null);
      setStatus(copy.deletedSuccess);
    } catch {
      setStatus(language === "en" ? "Could not delete the comment." : "Не удалось удалить комментарий.");
    }
  }, [animeId, copy.confirmDelete, copy.deletedSuccess, language, onAuthRequired, viewer]);

  const beginReply = (comment: Comment) => {
    if (!viewer) {
      onAuthRequired();
      return;
    }
    setReplyTarget(comment);
    setReplyDraft("");
  };

  const number = new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU").format(count);
  const canExpand = hasMore || expanded;

  return (
    <section id="anime-comments" className="mt-8 scroll-mt-24 border-t border-white/10 pt-6 md:mt-10" aria-labelledby="anime-comments-title">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 id="anime-comments-title" className="text-xl font-bold md:text-2xl">{copy.title}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">{number}</span>
      </div>

      <div className="mb-4 flex min-w-0 items-center gap-3">
        <Avatar name={viewer?.name ?? "Yubera"} url={viewer?.avatarUrl ?? null} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void post(draft, null)}
            disabled={!viewer}
            loading={posting}
            placeholder={copy.composer}
            sendLabel={copy.send}
            onAuthRequired={onAuthRequired}
          />
        </div>
      </div>

      {status && <p role="status" className="mb-3 px-1 text-xs text-muted-foreground">{status}</p>}
      {!viewer && <p className="mb-3 px-1 text-xs text-muted-foreground">{copy.login}</p>}

      {loading ? (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />{copy.loading}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground" role="alert">
          <p>{copy.loadError}</p>
          <button type="button" onClick={() => void loadInitial()} className="mt-2 font-semibold text-primary">{language === "en" ? "Retry" : "Повторить"}</button>
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-7 text-center">
          <MessageCircle className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="font-semibold">{copy.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.emptyBody}</p>
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {comments.map(root => (
            <article key={root.id} className="min-w-0 py-4 first:pt-1">
              <CommentRow
                comment={root}
                viewerId={viewer?.id ?? null}
                language={language}
                copy={copy}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                busyLike={busyLikes.has(root.id)}
                onLike={() => void toggleLike(root)}
                onReply={() => beginReply(root)}
                onDelete={() => void removeComment(root)}
              />

              {root.replies.length > 0 && (
                <div className="ml-4 mt-3 space-y-3 border-l border-white/20 pl-3 sm:ml-7 sm:pl-4">
                  {root.replies.map(reply => (
                    <div key={reply.id} className="min-w-0">
                      <CommentRow
                        comment={reply}
                        viewerId={viewer?.id ?? null}
                        language={language}
                        copy={copy}
                        openMenu={openMenu}
                        setOpenMenu={setOpenMenu}
                        busyLike={busyLikes.has(reply.id)}
                        onLike={() => void toggleLike(reply)}
                        onReply={() => beginReply(reply)}
                        onDelete={() => void removeComment(reply)}
                        compact
                      />
                    </div>
                  ))}
                </div>
              )}

              {root.hasMoreReplies && (
                <button type="button" onClick={() => void loadMoreReplies(root.id)} disabled={loadingMore} className="ml-16 mt-2 text-xs font-semibold text-primary disabled:opacity-50">
                  {loadingMore ? (language === "en" ? "Loading…" : "Загрузка…") : copy.moreReplies}
                </button>
              )}

              {replyTarget && replyTarget.threadRootId === root.id && (
                <div className="ml-14 mt-3 min-w-0">
                  <p className="mb-2 text-xs text-muted-foreground">{copy.replyTo} <span className="font-semibold text-foreground">{replyTarget.authorName || copy.deleted}</span></p>
                  <Composer
                    value={replyDraft}
                    onChange={setReplyDraft}
                    onSubmit={() => void post(replyDraft, replyTarget)}
                    disabled={!viewer}
                    loading={replyPosting}
                    placeholder={copy.replyComposer}
                    sendLabel={copy.send}
                    onAuthRequired={onAuthRequired}
                  />
                  <button type="button" onClick={() => { setReplyTarget(null); setReplyDraft(""); }} className="mt-1 px-1 text-xs text-muted-foreground hover:text-foreground">
                    {language === "en" ? "Cancel" : "Отмена"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {canExpand && !loading && !loadError && comments.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (!expanded) {
              setExpanded(true);
              if (hasMore) void loadMore();
            } else if (hasMore) {
              void loadMore();
            } else {
              setExpanded(false);
            }
          }}
          disabled={loadingMore}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/[0.035] px-4 py-2 text-sm font-medium transition hover:border-primary/60 hover:bg-white/[0.07] disabled:opacity-50"
        >
          {loadingMore ? (language === "en" ? "Loading…" : "Загрузка…") : expanded && !hasMore ? copy.collapse : copy.more}
          {expanded && !hasMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  viewerId,
  language,
  copy,
  openMenu,
  setOpenMenu,
  busyLike,
  onLike,
  onReply,
  onDelete,
  compact = false,
}: {
  comment: Comment;
  viewerId: string | null;
  language: Language;
  copy: typeof COPY.ru | typeof COPY.en;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  busyLike: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const own = Boolean(viewerId && comment.authorId === viewerId && !comment.deleted);
  const date = new Date(comment.createdAt);
  const fullDate = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : comment.createdAt;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar name={comment.authorName} url={comment.avatarUrl} size={compact ? "h-9 w-9" : "h-10 w-10"} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">{comment.deleted ? copy.deleted : comment.authorName}</span>
          <time dateTime={comment.createdAt} title={fullDate} className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(comment.createdAt, language)}</time>
          <span className="flex-1" />
          {own && (
            <div className="relative shrink-0">
              <button type="button" aria-label={language === "en" ? "Comment options" : "Действия с комментарием"} aria-expanded={openMenu === comment.id} onClick={() => setOpenMenu(openMenu === comment.id ? null : comment.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {openMenu === comment.id && (
                <div className="absolute right-0 top-8 z-20 min-w-32 rounded-xl border border-white/15 bg-[#1b1b21] p-1 shadow-xl">
                  <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-400 hover:bg-white/10">
                    <Trash2 className="h-4 w-4" />{copy.delete}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {comment.deleted ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{copy.deleted}</p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {comment.replyToName && <span className="mr-1 font-semibold text-primary">@{comment.replyToName}</span>}
            {comment.body}
          </p>
        )}

        {!comment.deleted && (
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={onLike} aria-label={comment.liked ? copy.unlike : copy.like} aria-pressed={comment.liked} disabled={busyLike} className={"inline-flex min-h-7 items-center gap-1.5 transition hover:text-primary disabled:opacity-50 " + (comment.liked ? "font-semibold text-primary" : "")}>
              <ThumbsUp className={"h-4 w-4 " + (comment.liked ? "fill-primary/20" : "")} />
              <span className="tabular-nums">{new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU").format(comment.likeCount)}</span>
            </button>
            <button type="button" onClick={onReply} className="inline-flex min-h-7 items-center gap-1.5 transition hover:text-primary">
              <MessageCircle className="h-4 w-4" />{copy.reply}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
