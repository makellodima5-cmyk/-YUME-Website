import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, Search, UserPlus, Users, UserCheck } from "lucide-react";

type CommunityPerson = {
  id: string;
  telegram_first_name: string;
  telegram_last_name?: string | null;
  telegram_username?: string | null;
  telegram_photo_url?: string | null;
  bio?: string | null;
  avatar_frame?: string | null;
  is_following?: number;
  created_at?: string;
};

type PeopleResponse = { users?: CommunityPerson[]; total?: number; hasMore?: boolean; error?: string };

type Props = {
  onOpenProfile: (id: string) => void;
  onFollowChange?: () => void | Promise<void>;
};

function displayName(person: CommunityPerson): string {
  return [person.telegram_first_name, person.telegram_last_name].filter(Boolean).join(" ").trim() || person.telegram_username || "Пользователь";
}

function PersonAvatar({ person }: { person: CommunityPerson }) {
  return (
    <span className="relative block h-14 w-14 shrink-0 rounded-full border border-white/15 bg-[#252630] p-1">
      {person.telegram_photo_url
        ? <img src={person.telegram_photo_url} alt="" className="h-full w-full rounded-full object-cover" />
        : <span className="grid h-full w-full place-items-center rounded-full bg-white/5 text-lg font-semibold text-white/55">{displayName(person).slice(0, 1).toUpperCase()}</span>}
      {person.avatar_frame && <img src={`/images/yubera/${person.avatar_frame}`} alt="" className="pointer-events-none absolute -inset-1.5 h-[68px] w-[68px] max-w-none object-contain" />}
    </span>
  );
}

export function YuberaFriendsPanel({ onOpenProfile, onFollowChange }: Props) {
  const [following, setFollowing] = useState<CommunityPerson[]>([]);
  const [followingTotal, setFollowingTotal] = useState(0);
  const [followingPage, setFollowingPage] = useState(0);
  const [followingHasMore, setFollowingHasMore] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<CommunityPerson[]>([]);
  const [recommendationPage, setRecommendationPage] = useState(0);
  const [recommendationSeed] = useState(() => Math.floor(Math.random() * 2147483646) + 1);
  const [recommendationsHasMore, setRecommendationsHasMore] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CommunityPerson[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [followingError, setFollowingError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const searchRequestId = useRef(0);
  const recommendationRequestId = useRef(0);

  const loadFollowing = useCallback(async (page = 0, append = false) => {
    setFollowingLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/yubera/community?action=friends&page=${page}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json() as PeopleResponse;
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить подписки");
      const incoming = Array.isArray(data.users) ? data.users : [];
      setFollowing((current) => {
        const combined = append ? [...current, ...incoming] : incoming;
        return combined.filter((person, index) => combined.findIndex((candidate) => candidate.id === person.id) === index);
      });
      setFollowingTotal(Number(data.total ?? 0));
      setFollowingPage(page);
      setFollowingHasMore(Boolean(data.hasMore));
    } catch (cause) {
      setFollowingError(cause instanceof Error ? cause.message : "Не удалось загрузить подписки");
    } finally {
      setFollowingLoading(false);
    }
  }, []);

  const loadRecommendations = useCallback(async (page: number, append: boolean) => {
    const requestId = ++recommendationRequestId.current;
    setRecommendationsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/yubera/community?action=recommendations&page=${page}&seed=${recommendationSeed}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json() as PeopleResponse;
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить рекомендации");
      if (requestId !== recommendationRequestId.current) return;
      const incoming = Array.isArray(data.users) ? data.users : [];
      setRecommendations((current) => {
        const combined = append ? [...current, ...incoming] : incoming;
        return combined.filter((person, index) => combined.findIndex((candidate) => candidate.id === person.id) === index);
      });
      setRecommendationPage(page);
      setRecommendationsHasMore(Boolean(data.hasMore));
    } catch (cause) {
      if (requestId === recommendationRequestId.current) setRecommendationError(cause instanceof Error ? cause.message : "Не удалось загрузить рекомендации");
    } finally {
      if (requestId === recommendationRequestId.current) setRecommendationsLoading(false);
    }
  }, [recommendationSeed]);

  useEffect(() => {
    void loadFollowing();
    void loadRecommendations(0, false);
  }, [loadFollowing, loadRecommendations]);

  useEffect(() => {
    const query = search.trim();
    const requestId = ++searchRequestId.current;
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    setSearchResults([]);
    setSearchError("");
    setSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/yubera/community?action=friends&q=${encodeURIComponent(query)}&page=0`, { credentials: "same-origin", cache: "no-store" });
        const data = await response.json() as PeopleResponse;
        if (!response.ok) throw new Error(data.error || "Не удалось выполнить поиск");
        if (requestId === searchRequestId.current) setSearchResults(Array.isArray(data.users) ? data.users : []);
      } catch (cause) {
        if (requestId === searchRequestId.current) setSearchError(cause instanceof Error ? cause.message : "Не удалось выполнить поиск");
      } finally {
        if (requestId === searchRequestId.current) setSearchLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      searchRequestId.current += 1;
    };
  }, [search]);

  const follow = async (person: CommunityPerson) => {
    if (busyUserId) return;
    setBusyUserId(person.id);
    setActionError("");
    try {
      const response = await fetch("/api/yubera/community", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow", userId: person.id, following: true }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось подписаться на пользователя");
      setRecommendations((current) => current.filter((item) => item.id !== person.id));
      setSearchResults((current) => current.map((item) => item.id === person.id ? { ...item, is_following: 1 } : item));
      await loadFollowing(0, false);
      await loadRecommendations(0, false);
      await onFollowChange?.();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Не удалось подписаться на пользователя");
    } finally {
      setBusyUserId(null);
    }
  };

  const personCard = (person: CommunityPerson, mode: "following" | "discover" | "search") => (
    <div key={person.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1d1e25] p-3">
      <button type="button" onClick={() => onOpenProfile(person.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <PersonAvatar person={person} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{displayName(person)}</span>
          <span className="block truncate text-xs text-white/50">{person.telegram_username ? `@${person.telegram_username}` : ""}</span>
          {person.bio && <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-white/45">{person.bio}</span>}
        </span>
        {mode === "following" && <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />}
      </button>
      {mode !== "following" && (
        person.is_following
          ? <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 px-2.5 py-2 text-[11px] text-white/55"><UserCheck className="h-3.5 w-3.5" />Вы подписаны</span>
          : <button type="button" disabled={busyUserId !== null} onClick={() => void follow(person)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-[#ff7658]/45 bg-[#ff7658]/10 px-3 text-xs font-semibold text-[#ff9a7f] transition hover:bg-[#ff7658]/15 disabled:opacity-50">
              {busyUserId === person.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span>Подписаться</span>
            </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#17181e] px-4 py-5">
        <img src="/images/yubera/yubera_banner.webp" alt="" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#17181e] via-[#17181e]/90 to-[#17181e]/45" />
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#ff7658]/10 text-[#ff815f]"><Users className="h-6 w-6" /></span>
          <span><h2 className="text-xl font-bold text-white">Друзья</h2><p className="text-sm text-white/55">Пользователи, на которых вы подписаны</p></span>
        </div>
      </div>

      <label className="flex h-12 items-center gap-3 rounded-full border border-white/10 bg-[#17181e] px-4 transition focus-within:border-[#ff7658]/60">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" placeholder="Поиск по нику или @username" aria-label="Поиск пользователей" />
        {searchLoading && <LoaderCircle className="h-4 w-4 animate-spin text-[#ff8a69]" />}
        {search && <button type="button" onClick={() => setSearch("")} className="text-xs text-white/50">Очистить</button>}
      </label>

      <section className="rounded-2xl border border-white/10 bg-[#17181e] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-white"><Users className="h-4 w-4 text-[#ff7658]" />Мои подписки <span className="text-xs font-normal text-white/45">{followingTotal}</span></h3>
          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/15 px-2.5 py-1.5 text-[11px] text-white/55">По дате подписки <ChevronDown className="h-3 w-3" /></span>
        </div>
        {followingLoading && !following.length ? <div className="space-y-2" aria-label="Загрузка подписок">{[0,1,2].map((item) => <div key={item} className="h-[82px] animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
          : followingError && !following.length ? <div className="py-5 text-center"><p className="text-sm text-red-200">{followingError}</p><button type="button" onClick={() => void loadFollowing()} className="mt-3 text-sm text-[#ff9a7f]">Повторить</button></div>
          : following.length ? <><div className="space-y-2">{following.map((person) => personCard(person, "following"))}</div>{followingHasMore && <button type="button" disabled={followingLoading} onClick={() => void loadFollowing(followingPage + 1, true)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-xs text-white/65 disabled:opacity-50">{followingLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Загрузить ещё подписки"}</button>}</>
          : <div className="py-5 text-center"><Users className="mx-auto mb-2 h-7 w-7 text-white/25" /><p className="text-sm font-medium text-white/75">Вы пока ни на кого не подписаны</p><p className="mt-1 text-xs text-white/45">Найдите пользователей YUBERA и подпишитесь на интересные профили</p></div>}
      </section>

      {search.trim() ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><Search className="h-4 w-4 text-[#ff7658]" />Результаты поиска</h3>
          {searchLoading ? <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
            : searchError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{searchError}<button type="button" onClick={() => setSearch((value) => value + " ")} className="ml-2 underline">Повторить</button></div>
            : searchResults.length ? <div className="space-y-2">{searchResults.map((person) => personCard(person, "search"))}</div>
            : <div className="rounded-2xl border border-white/10 bg-[#17181e] px-4 py-6 text-center"><Search className="mx-auto mb-2 h-7 w-7 text-white/25" /><p className="text-sm text-white/75">Пользователи не найдены</p><p className="mt-1 text-xs text-white/45">Попробуйте изменить имя или username</p></div>}
        </section>
      ) : (
        <section>
          <div className="mb-3 flex items-center gap-2"><Search className="h-5 w-5 text-[#ff7658]" /><span><h3 className="font-semibold text-white">Найти друзей</h3><p className="text-xs text-white/50">Ищите других пользователей YUBERA</p></span></div>
          {recommendationError && !recommendations.length ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-200">{recommendationError}<button type="button" onClick={() => void loadRecommendations(0, false)} className="ml-2 underline">Повторить</button></div>
            : recommendations.length ? <div className="space-y-2">{recommendations.map((person) => personCard(person, "discover"))}</div>
            : !recommendationsLoading && <p className="rounded-2xl border border-white/10 bg-[#17181e] p-5 text-center text-sm text-white/50">Пока нет пользователей для рекомендации</p>}
          {recommendationsHasMore && <button type="button" disabled={recommendationsLoading} onClick={() => void loadRecommendations(recommendationPage + 1, true)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#17181e] text-sm text-white/75 disabled:opacity-50">
            {recommendationsLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <>Показать ещё <ChevronDown className="h-4 w-4" /></>}
          </button>}
          {!recommendationsHasMore && recommendations.length > 0 && !recommendationsLoading && <p className="pt-2 text-center text-xs text-white/35">Больше пользователей пока нет</p>}
        </section>
      )}
      {actionError && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">{actionError}</p>}
      {followingError && following.length > 0 && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">{followingError}</p>}
    </div>
  );
}
