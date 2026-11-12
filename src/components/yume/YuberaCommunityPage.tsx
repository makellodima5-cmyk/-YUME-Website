import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bookmark, Check, ChevronRight, Heart, Plus,
  Search, Shield, Star, Users, UserRound, X,
} from "lucide-react";
import type { Anime } from "@/data/anime";
import { getTelegramWebApp, telegramHapticNotification } from "@/lib/telegram-mini-app";

type Screen = "overview" | "edit-profile" | "friends" | "public-profile" |
  "collections" | "collection" | "create-collection" | "level" |
  "support-status" | "support-plus" | "plus-admin";
type Level = { level: number; name: string; art: string; min?: number; max?: number | null };
type Status = { level: number; name: string; art: string | null };
type Collection = {
  id: string; title: string; description: string; cover_key: string | null;
  visibility: "public" | "private"; isPinned?: boolean; itemCount: number;
  coverUrl: string | null; created_at?: string; updated_at?: string; own?: boolean;
  likeCount?: number; liked?: boolean;
};
type UserRow = {
  id: string; telegram_first_name?: string; telegram_last_name?: string | null;
  telegram_username?: string | null; telegram_photo_url?: string | null; bio?: string;
};
type ProfileData = {
  id: string; firstName: string; lastName: string | null; username: string | null;
  photoUrl: string | null; bio: string; visibility: "public" | "private";
  selectedFrame: string; frameUrl: string | null; level: Level; supportStatus: Status;
  plusActive: boolean; xp?: number; xpToNext?: number; xpProgress?: number;
  nextLevel?: Level | null; supportTotalStars?: number;
  supportProgressToNext?: { current: number; required: number } | null;
  plus?: { active: boolean; expiresAt: number; startedAt: number; autoRenew: boolean; priceStars: number } | null;
  stats?: { favorites: number; watchlist: number; history: number };
  collections?: Collection[]; followerCount: number; followingCount: number;
  unlockedFrames?: string[];
};
type Props = {
  animeList: Anime[]; initialScreen?: Screen; isAdmin?: boolean; onBack: () => void;
  onSelectAnime: (anime: Anime) => void; onOpenLogin: () => void;
};

const LEVELS = [
  ["Начинающий зритель", 0, 49, "YUBERA_Level_01_Option_A.webp"],
  ["Любитель аниме", 50, 149, "YUBERA_Level_02.webp"],
  ["Искатель историй", 150, 299, "YUBERA_Level_03.webp"],
  ["Исследователь миров", 300, 499, "YUBERA_Level_04.webp"],
  ["Коллекционер", 500, 749, "YUBERA_Level_05_Transparent.webp"],
  ["Знаток аниме", 750, 999, "YUBERA_Level_06.webp"],
  ["Хранитель историй", 1000, 1499, "YUBERA_Level_07_Transparent.webp"],
  ["Мастер YUBERA", 1500, 2199, "YUBERA_Level_08_Transparent.webp"],
  ["Архивариус YUBERA", 2200, 3199, "YUBERA_Level_09_Transparent.webp"],
  ["Легенда YUBERA", 3200, null, "YUBERA_Level_10_New_Design.webp"],
] as const;
const SUPPORTS = [
  ["Союзник", 50, "YUBERA_Support_Status_Level_01_Soyuznik.webp"],
  ["Сторонник", 1000, "YUBERA_Support_Status_Level_02_Storonnik.webp"],
  ["Преданный участник", 2500, "YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp"],
  ["Почётный покровитель", 5000, "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp"],
  ["Легенда YUBERA", 10000, "YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp"],
] as const;
const COVERS = [
  ["Action", "Экшен", "YUBERA_Collection_Cover_Action.webp"],
  ["Adventure_Fantasy", "Приключения и фэнтези", "YUBERA_Collection_Cover_Adventure_Fantasy.webp"],
  ["Romance", "Романтика", "YUBERA_Collection_Cover_Romance.webp"],
  ["Slice_of_Life", "Повседневность", "YUBERA_Collection_Cover_Slice_of_Life.webp"],
  ["Thriller_Mystery", "Триллер и тайна", "YUBERA_Collection_Cover_Thriller_Mystery.webp"],
] as const;
const SUPPORT_FRAMES = [
  ["support_1", "Союзник", "YUBERA_Contribution_Avatar_Frame_01_Soyuznik.webp.webp"],
  ["support_2", "Сторонник", "YUBERA_Contribution_Avatar_Frame_02_Storonnik.webp.webp"],
  ["support_3", "Преданный участник", "YUBERA_Contribution_Avatar_Frame_03_Predanniy_Uchastnik.webp.webp"],
  ["support_4", "Почётный покровитель", "YUBERA_Contribution_Avatar_Frame_04_Pochetnyy_Pokrovitel.webp.webp"],
  ["support_5", "Легенда YUBERA", "YUBERA_Contribution_Avatar_Frame_05_Legenda_YUBERA.webp"],
] as const;
const PLUS_FRAMES = [
  ["plus_1", "Sakura Gold", "YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp"],
  ["plus_2", "Mystic Kitsune", "YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp"],
  ["plus_3", "Samurai Steel", "YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp"],
  ["plus_4", "Celestial Archive", "YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp"],
  ["plus_5", "Cyberpunk Neon", "YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp"],
] as const;
const asset = (name: string) => "/images/yubera/" + name;
const displayName = (user: UserRow | ProfileData): string => {
  const first = "firstName" in user ? user.firstName : user.telegram_first_name ?? "";
  const last = "lastName" in user ? user.lastName : user.telegram_last_name ?? "";
  const username = "username" in user ? user.username : user.telegram_username;
  return [first, last].filter(Boolean).join(" ") || (username ? "@" + username : "Пользователь");
};

export function YuberaCommunityPage({ animeList, initialScreen = "overview", isAdmin = false, onBack, onSelectAnime, onOpenLogin }: Props) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [target, setTarget] = useState<ProfileData | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [friendsTab, setFriendsTab] = useState<"search" | "recommendations" | "followers" | "following">("search");
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<Anime[]>([]);
  const [draft, setDraft] = useState({ title: "", description: "", coverKey: "", visibility: "public" as "public" | "private" });
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [selectedFrame, setSelectedFrame] = useState("none");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [collectionMenu, setCollectionMenu] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [animePickerOpen, setAnimePickerOpen] = useState(false);
  const [animeQuery, setAnimeQuery] = useState("");
  const [usersOffset, setUsersOffset] = useState(0);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [supportAmount, setSupportAmount] = useState(100);
  const [customStars, setCustomStars] = useState("");
  const [supportNotice, setSupportNotice] = useState("");
  const [supportError, setSupportError] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [plusPrice, setPlusPrice] = useState<number | null>(null);
  const [plusPriceDraft, setPlusPriceDraft] = useState("");
  const [plusState, setPlusState] = useState<{ active: boolean; expiresAt: number; autoRenew: boolean; priceStars: number } | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [plusBusy, setPlusBusy] = useState(false);
  const [pollingInvoice, setPollingInvoice] = useState(false);

  const communityUrl = (action: string, params: Record<string, string> = {}) => {
    const url = new URL("/api/yubera/community", window.location.origin);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  };
  const api = async (body: Record<string, unknown> | null, action = "me", params: Record<string, string> = {}) => {
    const response = await fetch(communityUrl(action, params), {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({})) as Record<string, any>;
    if (response.status === 401) {
      onOpenLogin();
      throw new Error("authentication_required");
    }
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "request_failed");
    return data;
  };
  const loadMe = async () => {
    setLoading(true);
    try {
      const result = await api(null, "me");
      const data = result.profile as ProfileData;
      setProfile(data);
      setBio(data.bio ?? "");
      setVisibility(data.visibility ?? "private");
      setSelectedFrame(data.selectedFrame ?? "none");
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить профиль.");
      return null;
    } finally { setLoading(false); }
  };
  const loadPlus = async () => {
    try {
      const response = await fetch("/api/yubera/plus", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) { onOpenLogin(); return; }
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (response.ok) {
        setPlusPrice(typeof data.priceStars === "number" ? data.priceStars : null);
        setPlusPriceDraft(typeof data.priceStars === "number" ? String(data.priceStars) : "");
        setPlusState(data.subscription ?? null);
      }
    } catch { /* Price is optional until Telegram Stars is configured. */ }
  };
  useEffect(() => { void loadMe(); void loadPlus(); }, []);
  useEffect(() => { setScreen(initialScreen); }, [initialScreen]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [screen]);

  const openUsers = async (tab: typeof friendsTab, query: string, offset: number) => {
    try {
      if (tab === "search") {
        if (query.trim().length < 2) { setUsers([]); setHasMoreUsers(false); return; }
        const data = await api(null, "search", { q: query.trim() });
        setUsers(data.users ?? []);
        setHasMoreUsers(false);
        return;
      }
      if (tab === "recommendations") {
        const data = await api(null, "recommendations");
        setUsers(data.users ?? []);
        setHasMoreUsers(false);
        return;
      }
      const data = await api(null, tab, { limit: "20", offset: String(offset) });
      setUsers(data.users ?? []);
      setHasMoreUsers(data.hasMore === true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить пользователей."); }
  };
  useEffect(() => {
    if (screen !== "friends") return;
    const timer = window.setTimeout(() => { void openUsers(friendsTab, search, usersOffset); }, 200);
    return () => window.clearTimeout(timer);
  }, [screen, friendsTab, search, usersOffset]);

  const openPublic = async (userId: string) => {
    setBusy(true);
    try {
      const data = await api(null, "public", { id: userId });
      setTarget(data.profile as ProfileData);
      setIsFollowing(data.following === true);
      setScreen("public-profile");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Профиль не найден."); }
    finally { setBusy(false); }
  };
  const openCollection = async (collectionId: string) => {
    setBusy(true);
    try {
      const data = await api(null, "collection", { id: collectionId });
      const record = data.collection as Collection;
      setCollection({ ...record, own: data.own === true });
      setCollectionItems(data.items ?? []);
      setLikeCount(Number(data.likeCount ?? 0));
      setLiked(data.liked === true);
      setScreen("collection");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Подборка не найдена."); }
    finally { setBusy(false); }
  };
  const mutate = async (body: Record<string, unknown>, reload = true) => {
    setBusy(true); setMessage("");
    try {
      await api(body);
      if (reload) await loadMe();
      telegramHapticNotification("success");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить изменения."); }
    finally { setBusy(false); }
  };
  const follow = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api({ action: isFollowing ? "unfollow" : "follow", userId: target.id });
      setIsFollowing(!isFollowing);
      await loadMe();
      setTarget({ ...target, followerCount: Math.max(0, target.followerCount + (isFollowing ? -1 : 1)) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить подписку."); }
    finally { setBusy(false); }
  };
  const startCollection = (existing?: Collection) => {
    setEditingCollectionId(existing?.id ?? null);
    setDraft(existing ? {
      title: existing.title, description: existing.description,
      coverKey: existing.cover_key ?? "", visibility: existing.visibility,
    } : { title: "", description: "", coverKey: "", visibility: "public" });
    setScreen("create-collection");
  };
  const saveCollection = async () => {
    if (!draft.title.trim() || draft.title.trim().length > 50 || draft.description.length > 250) return;
    const body = {
      action: editingCollectionId ? "collection.update" : "collection.create",
      ...(editingCollectionId ? { collectionId: editingCollectionId } : {}),
      ...draft, coverKey: draft.coverKey || null,
    };
    await mutate(body, true);
    setScreen("collections");
  };
  const deleteCollection = async (collectionId: string) => {
    await mutate({ action: "collection.delete", collectionId }, true);
    setDeleteConfirm(null);
    setCollectionMenu(null);
  };
  const pinCollection = async (collectionId: string, pinned: boolean) => {
    await mutate({ action: "collection.pin", collectionId, pinned }, true);
    setCollectionMenu(null);
  };
  const addAnime = async (anime: Anime) => {
    if (!collection) return;
    await mutate({ action: "collection.addAnime", collectionId: collection.id, animeId: anime.id }, false);
    await openCollection(collection.id);
    await loadMe();
    setAnimePickerOpen(false);
  };
  const removeAnime = async (animeId: string) => {
    if (!collection) return;
    await mutate({ action: "collection.removeAnime", collectionId: collection.id, animeId }, false);
    await openCollection(collection.id);
    await loadMe();
  };
  const toggleLike = async () => {
    if (!collection) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(value => Math.max(0, value + (next ? 1 : -1)));
    try {
      await api({ action: next ? "collection.like" : "collection.unlike", collectionId: collection.id });
    } catch (error) {
      setLiked(!next);
      setLikeCount(value => Math.max(0, value + (next ? -1 : 1)));
      setMessage(error instanceof Error ? error.message : "Не удалось поставить отметку.");
    }
  };
  const saveProfile = async () => {
    await mutate({ action: "profile.update", bio, visibility, selectedFrame });
    setScreen("overview");
  };
  const createPlusInvoice = async () => {
    setPlusBusy(true); setMessage("");
    try {
      const response = await fetch("/api/yubera/plus", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createInvoice", autoRenew }),
      });
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (response.status === 401) { onOpenLogin(); return; }
      if (!response.ok || typeof data.invoiceUrl !== "string") throw new Error(data.error ?? "invoice_creation_failed");
      const webApp = getTelegramWebApp();
      if (webApp?.openTelegramLink) webApp.openTelegramLink(data.invoiceUrl);
      else window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось создать счёт YUBERA Plus."); }
    finally { setPlusBusy(false); }
  };
  const changeRenewal = async (resume: boolean) => {
    setPlusBusy(true);
    try {
      const response = await fetch("/api/yubera/plus", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: resume ? "resumeRenewal" : "cancelRenewal" }),
      });
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok) throw new Error(data.error ?? "renewal_update_failed");
      await loadPlus();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить автопродление."); }
    finally { setPlusBusy(false); }
  };
  const savePrice = async () => {
    const value = Number(plusPriceDraft);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000) {
      setMessage("Укажи целое число от 1 до 10 000.");
      return;
    }
    setPlusBusy(true);
    try {
      const response = await fetch("/api/yubera/plus", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPrice", priceStars: value }),
      });
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok) throw new Error(data.error ?? "price_update_failed");
      setPlusPrice(value);
      setMessage("Цена YUBERA Plus сохранена.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить цену."); }
    finally { setPlusBusy(false); }
  };
  const checkSupportPayment = async (payload: string, initData: string) => {
    setPollingInvoice(true);
    setSupportNotice("Проверяем подтверждение платежа Telegram…");
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch("/api/telegram/stars-status?payload=" + encodeURIComponent(payload), {
          credentials: "same-origin", cache: "no-store",
          headers: { "X-Telegram-Init-Data": initData },
        });
        if (!response.ok) throw new Error("Не удалось проверить статус платежа.");
        const data = await response.json() as { status?: string };
        if (data.status === "paid") {
          setSupportNotice("Спасибо за поддержку YUBERA!");
          telegramHapticNotification("success");
          return;
        }
        if (data.status === "failed") throw new Error("Платёж не завершён. Попробуй ещё раз.");
        await new Promise(resolve => window.setTimeout(resolve, 1200));
      }
      setSupportNotice("Подтверждение ещё не получено. Проверь статус позже.");
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Не удалось проверить платёж.");
    } finally {
      setPollingInvoice(false);
    }
  };
  const createSupportInvoice = async () => {
    const amount = customStars ? Number(customStars) : supportAmount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
      setSupportError("Укажи сумму от 1 до 100 000 Stars.");
      return;
    }
    const initData = getTelegramWebApp()?.initData ?? "";
    if (!initData) {
      setSupportError("Оплата поддержки доступна при открытии YUME в Telegram.");
      return;
    }
    setSupportBusy(true); setSupportError(""); setSupportNotice("");
    try {
      const response = await fetch("/api/telegram/stars-invoice", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, initData }),
      });
      const data = await response.json().catch(() => ({})) as { invoiceUrl?: string; payload?: string; error?: string };
      if (!response.ok || !data.invoiceUrl || !data.payload) throw new Error(data.error ?? "invoice_creation_failed");
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(data.invoiceUrl, status => {
          if (status === "paid" || status === "pending") void checkSupportPayment(data.payload!, initData);
          if (status === "failed") setSupportError("Платёж не прошёл. Попробуй ещё раз.");
          if (status === "cancelled") setSupportNotice("Оплата отменена. Счёт не оплачен.");
        });
      } else {
        webApp?.openTelegramLink?.(data.invoiceUrl);
        setSupportNotice("Счёт открыт в Telegram.");
      }
    } catch (error) { setSupportError(error instanceof Error ? error.message : "Не удалось создать счёт."); }
    finally { setSupportBusy(false); }
  };
  const resetSupportPage = () => { setSupportError(""); setSupportNotice(""); };
  const filteredAnime = useMemo(() => {
    const term = animeQuery.trim().toLocaleLowerCase("ru");
    if (term.length < 2) return [];
    return animeList.filter(item =>
      (item.title + " " + (item.englishTitle ?? "") + " " + (item.originalTitle ?? "")).toLocaleLowerCase("ru").includes(term),
    ).slice(0, 40);
  }, [animeList, animeQuery]);
  const card = "rounded-2xl border border-border bg-card/80 p-4 sm:p-5";
  const button = (label: string, action: () => void, disabled = false, secondary = false) => (
    <button type="button" onClick={action} disabled={disabled}
      className={"inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-45 " +
        (secondary ? "border border-border bg-card hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
      {label}
    </button>
  );
  const heading = (title: string, subtitle?: string) => (
    <div className="mb-4"><h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}</div>
  );
  const renderUser = (user: UserRow) => (
    <button key={user.id} type="button" onClick={() => void openPublic(user.id)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/50">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
        {user.telegram_photo_url ? <img src={user.telegram_photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{displayName(user)}</span>
        {user.telegram_username && <span className="block truncate text-xs text-muted-foreground">@{user.telegram_username}</span>}
        {user.bio && <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">{user.bio}</span>}
      </span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
  const renderCollectionCard = (item: Collection) => (
    <article key={item.id} className={card + " relative overflow-hidden"}>
      <button type="button" onClick={() => void openCollection(item.id)} className="w-full text-left">
        {item.coverUrl ? <img src={item.coverUrl} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" /> :
          <div className="mb-3 grid h-32 place-items-center rounded-xl bg-secondary"><Bookmark className="h-8 w-8 text-primary" /></div>}
        <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate">{item.title}</b>{item.isPinned && <span className="text-xs text-primary">Закреплена</span>}</span>
        <span className="mt-1 block line-clamp-2 min-h-8 text-xs text-muted-foreground">{item.description}</span>
        <span className="mt-2 block text-xs text-muted-foreground">{item.itemCount} / {profile?.plusActive ? 300 : 50} аниме · {item.visibility === "public" ? "Публичная" : "Приватная"}</span>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {button("Открыть", () => void openCollection(item.id), false, true)}
        {button("•••", () => setCollectionMenu(collectionMenu === item.id ? null : item.id), false, true)}
      </div>
      {collectionMenu === item.id && <div className="mt-2 flex flex-wrap gap-2 rounded-xl bg-secondary/80 p-2">
        {button(item.isPinned ? "Открепить" : "Закрепить", () => void pinCollection(item.id, !item.isPinned), false, true)}
        {button("Редактировать", () => startCollection(item), false, true)}
        {button("Удалить", () => setDeleteConfirm(item.id), false, true)}
      </div>}
      {deleteConfirm === item.id && <div className="mt-3 rounded-xl border border-destructive/40 p-3">
        <p className="text-sm">Удалить подборку «{item.title}»?</p>
        <div className="mt-2 flex gap-2">{button("Отмена", () => setDeleteConfirm(null), false, true)}{button("Подтвердить", () => void deleteCollection(item.id), busy)}</div>
      </div>}
    </article>
  );

  const screenTitle: Record<Screen, string> = {
    overview: "Профиль YUBERA", "edit-profile": "Редактировать профиль", friends: "Друзья и подписки",
    "public-profile": "Публичный профиль", collections: "Мои подборки", collection: "Подборка",
    "create-collection": editingCollectionId ? "Редактировать подборку" : "Создать подборку",
    level: "Уровень пользователя", "support-status": "Статус поддержки",
    "support-plus": "Поддержка и YUBERA Plus", "plus-admin": "Управление YUBERA Plus",
  };
  const goBack = () => {
    if (screen === "overview") { onBack(); return; }
    if (screen === "public-profile") setScreen("friends");
    else if (screen === "collection" || screen === "create-collection") setScreen("collections");
    else if (screen === "plus-admin") setScreen("support-plus");
    else setScreen("overview");
  };
  const supportOpen = () => setScreen("support-plus");

  return (
    <main id="main-content" className="yubera-with-bottom-nav mx-auto w-full max-w-[1200px] px-3 pb-28 pt-[78px] sm:px-5 lg:px-8">
      <div className="mb-5 flex items-center gap-3">
        <button type="button" onClick={goBack} aria-label="Назад" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">YUBERA COMMUNITY</p><h1 className="truncate text-xl font-bold sm:text-2xl">{screenTitle[screen]}</h1></div>
        {screen === "overview" && profile?.plusActive && <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">PLUS</span>}
      </div>
      {message && <p role="status" className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm">{message}</p>}
      {loading && screen === "overview" ? <div className={card + " animate-pulse text-sm text-muted-foreground"}>Загружаем профиль…</div> : null}

      {screen === "overview" && profile && (
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-3xl border border-border bg-[#15161d]">
            <img src={asset("yubera_banner.webp")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-[#11121a]/40 to-[#11121a]" />
            <div className="relative px-4 pb-5 pt-24 sm:px-6">
              <div className="flex items-end gap-4">
                <span className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full border-2 border-primary bg-secondary">
                  {profile.photoUrl ? <img src={profile.photoUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <UserRound className="h-10 w-10" />}
                  {profile.frameUrl && <img src={profile.frameUrl} alt="" className="pointer-events-none absolute -inset-3 h-[calc(100%+24px)] w-[calc(100%+24px)] object-contain" />}
                </span>
                <div className="min-w-0 flex-1 text-white"><h2 className="break-words text-xl font-bold">{displayName(profile)}</h2>
                  {profile.username && <p className="mt-1 text-sm text-white/70">@{profile.username}</p>}
                  <p className="mt-2 line-clamp-3 text-sm text-white/80">{profile.bio || "Расскажи о себе и любимых историях."}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Подписчики", profile.followerCount], ["Подписки", profile.followingCount],
                  ["Избранное", profile.stats?.favorites ?? 0], ["История", profile.stats?.history ?? 0]].map(([label, value]) =>
                  <div key={String(label)} className="rounded-xl border border-white/10 bg-black/30 p-3 text-center text-white">
                    <b className="block text-lg">{value}</b><span className="text-xs text-white/65">{label}</span>
                  </div>)}
              </div>
            </div>
          </section>
          <section className={card + " flex items-center gap-3"}>
            <img src={asset(profile.level.art)} alt="" className="h-16 w-16 object-contain" />
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Уровень {profile.level.level}</p>
              <h3 className="font-bold">{profile.level.name}</h3><p className="text-xs text-muted-foreground">{profile.xp ?? 0} XP · {profile.xpToNext ?? 0} до следующего</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: (profile.xpProgress ?? 0) + "%" }} /></div>
            </div>
            <button type="button" onClick={() => setScreen("level")} className="text-xs font-semibold text-primary">Подробнее</button>
          </section>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setScreen("support-status")} className={card + " flex items-center gap-3 text-left"}>
              <img src={asset(profile.supportStatus.art ?? SUPPORTS[0][2])} alt="" className="h-14 w-14 object-contain" />
              <span className="min-w-0 flex-1"><b className="block">Статус поддержки</b><span className="text-xs text-muted-foreground">{profile.supportStatus.name}</span></span><ChevronRight />
            </button>
            <button type="button" onClick={supportOpen} className={card + " flex items-center gap-3 text-left"}>
              <img src={asset("YUBERA_Plus_Crown_Simple.webp")} alt="" className="h-14 w-14 object-contain" />
              <span className="min-w-0 flex-1"><b className="block">Поддержка и YUBERA Plus</b><span className="text-xs text-muted-foreground">{profile.plusActive ? "Подписка активна" : "Донаты и подписка"}</span></span><ChevronRight />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setScreen("friends")} className={card + " flex items-center gap-3 text-left"}><Users className="h-5 w-5 text-primary" /><span className="flex-1 text-sm font-semibold">Друзья и подписки</span><ChevronRight /></button>
            <button type="button" onClick={() => setScreen("collections")} className={card + " flex items-center gap-3 text-left"}><Bookmark className="h-5 w-5 text-primary" /><span className="flex-1 text-sm font-semibold">Мои подборки</span><ChevronRight /></button>
            <button type="button" onClick={() => setScreen("edit-profile")} className={card + " flex items-center gap-3 text-left"}><UserRound className="h-5 w-5 text-primary" /><span className="flex-1 text-sm font-semibold">Редактировать профиль</span><ChevronRight /></button>
          </div>
          {(profile.collections?.length ?? 0) > 0 && <section><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Мои подборки</h3><button type="button" onClick={() => setScreen("collections")} className="text-xs text-primary">Все подборки</button></div>
            <div className="grid gap-3 sm:grid-cols-2">{profile.collections?.slice(0, 2).map(renderCollectionCard)}</div></section>}
          {isAdmin && <button type="button" onClick={() => setScreen("plus-admin")} className={card + " w-full text-left"}><span className="flex items-center gap-3"><Shield className="text-primary" /><span className="flex-1 font-semibold">Управление YUBERA Plus</span><ChevronRight /></span></button>}
        </div>
      )}

      {screen === "edit-profile" && profile && (
        <div className="space-y-4">
          {heading("Редактировать профиль", "Имя, фотография и username синхронизируются из Telegram.")}
          <section className={card}><label htmlFor="yubera-bio" className="block text-sm font-semibold">О себе</label>
            <textarea id="yubera-bio" value={bio} maxLength={250} onChange={event => setBio(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/250</p>
          </section>
          <section className={card}><h3 className="font-semibold">Видимость профиля</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setVisibility("public")} aria-pressed={visibility === "public"} className={"rounded-xl border p-3 text-left " + (visibility === "public" ? "border-primary bg-primary/10" : "border-border")}><b>Публичный</b><p className="mt-1 text-xs text-muted-foreground">Можно найти в поиске и открыть.</p></button>
              <button type="button" onClick={() => setVisibility("private")} aria-pressed={visibility === "private"} className={"rounded-xl border p-3 text-left " + (visibility === "private" ? "border-primary bg-primary/10" : "border-border")}><b>Приватный</b><p className="mt-1 text-xs text-muted-foreground">Недоступен другим пользователям.</p></button>
            </div>
          </section>
          <section className={card}><h3 className="font-semibold">Рамка аватара</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => setSelectedFrame("none")} aria-pressed={selectedFrame === "none"} className="rounded-xl border border-border p-3"><UserRound className="mx-auto h-10 w-10" /><span className="mt-2 block text-xs">Без рамки</span></button>
            {SUPPORT_FRAMES.map(([key, name, file], index) => {
              const open = profile.supportStatus.level >= index + 1;
              return <button key={key} type="button" disabled={!open} onClick={() => setSelectedFrame(key)} aria-pressed={selectedFrame === key} className={"rounded-xl border p-3 disabled:opacity-40 " + (selectedFrame === key ? "border-primary" : "border-border")}><img src={asset(file)} alt="" className="mx-auto h-14 w-14 object-contain" /><span className="mt-2 block text-xs">{name}</span>{!open && <span className="text-[10px] text-muted-foreground">Закрыто</span>}</button>;
            })}
            {PLUS_FRAMES.map(([key, name, file]) => <button key={key} type="button" disabled={!profile.plusActive} onClick={() => setSelectedFrame(key)} aria-pressed={selectedFrame === key} className={"rounded-xl border p-3 disabled:opacity-40 " + (selectedFrame === key ? "border-primary" : "border-border")}><img src={asset(file)} alt="" className="mx-auto h-14 w-14 object-contain" /><span className="mt-2 block text-xs">{name}</span>{!profile.plusActive && <span className="text-[10px] text-muted-foreground">Нужен Plus</span>}</button>)}
          </div></section>
          <div className="flex flex-wrap gap-2">{button("Сохранить", () => void saveProfile(), busy)}{button("Отмена", () => setScreen("overview"), false, true)}</div>
        </div>
      )}

      {screen === "friends" && (
        <div className="space-y-4">
          {heading("Друзья и подписки", "Односторонние подписки — без заявок в друзья.")}
          <div className="flex flex-wrap gap-2">
            {(["search", "recommendations", "followers", "following"] as const).map(tab => <button key={tab} type="button" onClick={() => { setFriendsTab(tab); setUsersOffset(0); setUsers([]); }} className={"rounded-full border px-3 py-2 text-xs font-semibold " + (friendsTab === tab ? "border-primary bg-primary/10" : "border-border")}>{({ search: "Поиск", recommendations: "Рекомендации", followers: "Подписчики", following: "Подписки" })[tab]}</button>)}
          </div>
          {friendsTab === "search" && <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Имя или @username (от 2 символов)" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>}
          {users.length === 0 ? <p className={card + " text-sm text-muted-foreground"}>{friendsTab === "search" && search.length < 2 ? "Введи минимум 2 символа для поиска." : "Пока здесь никого нет."}</p> :
            <div className="space-y-2">{users.map(renderUser)}</div>}
          {hasMoreUsers && button("Загрузить ещё", () => setUsersOffset(value => value + 20), busy, true)}
        </div>
      )}

      {screen === "public-profile" && target && (
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-3xl border border-border bg-[#15161d]">
            <img src={asset("yubera_banner.webp")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-[#11121a]" />
            <div className="relative p-5 pt-20 text-white">
              <div className="flex items-end gap-4"><span className="relative grid h-20 w-20 place-items-center rounded-full border-2 border-primary bg-secondary">{target.photoUrl ? <img src={target.photoUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <UserRound />}{target.frameUrl && <img src={target.frameUrl} alt="" className="absolute -inset-3 h-[calc(100%+24px)] w-[calc(100%+24px)] object-contain" />}</span>
                <div><h2 className="text-xl font-bold">{displayName(target)}</h2>{target.username && <p className="text-sm text-white/60">@{target.username}</p>}</div></div>
              <p className="mt-4 text-sm text-white/80">{target.bio}</p>
              <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-black/30 px-3 py-1.5 text-xs">{target.level.name}</span><span className="rounded-full bg-black/30 px-3 py-1.5 text-xs">{target.supportStatus.name}</span>{target.plusActive && <span className="rounded-full bg-amber-300/20 px-3 py-1.5 text-xs text-amber-100">YUBERA Plus</span>}</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">{button(isFollowing ? "Отписаться" : "Подписаться", () => void follow(), busy)}<span className="text-xs text-white/70">{target.followerCount} подписчиков · {target.followingCount} подписок</span></div>
            </div>
          </section>
          {(target.collections?.length ?? 0) > 0 && <section><h3 className="mb-3 font-bold">Публичные подборки</h3><div className="grid gap-3 sm:grid-cols-2">{target.collections?.map(item => <button type="button" key={item.id} onClick={() => void openCollection(item.id)} className={card + " text-left"}>{item.coverUrl && <img src={item.coverUrl} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />}<b>{item.title}</b><p className="mt-1 text-xs text-muted-foreground">{item.itemCount} аниме</p></button>)}</div></section>}
        </div>
      )}

      {screen === "collections" && profile && (
        <div className="space-y-4">
          {heading("Мои подборки", "Создавай тематические списки — пустую подборку тоже можно сохранить.")}
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{profile.collections?.length ?? 0} / {profile.plusActive ? 30 : 5}</p>{button("Создать подборку", () => startCollection(), (profile.collections?.length ?? 0) >= (profile.plusActive ? 30 : 5))}</div>
          {(profile.collections?.length ?? 0) === 0 ? <div className={card + " text-center"}><Bookmark className="mx-auto h-9 w-9 text-primary" /><h3 className="mt-3 font-semibold">Пока нет подборок</h3><p className="mt-1 text-sm text-muted-foreground">Создай первую подборку и наполни её позже.</p></div> :
            <div className="grid gap-3 sm:grid-cols-2">{profile.collections?.map(renderCollectionCard)}</div>}
        </div>
      )}

      {screen === "create-collection" && (
        <div className="space-y-4">
          {heading(screenTitle[screen], "Название обязательно; подборку можно создать пустой.")}
          <section className={card}><label className="block text-sm font-semibold">Название</label><input maxLength={50} value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><p className="mt-1 text-right text-xs text-muted-foreground">{draft.title.length}/50</p>
            <label className="mt-4 block text-sm font-semibold">Описание</label><textarea maxLength={250} rows={3} value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" /><p className="mt-1 text-right text-xs text-muted-foreground">{draft.description.length}/250</p></section>
          <section className={card}><h3 className="font-semibold">Обложка</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{COVERS.map(([key, label, file]) => <button key={key} type="button" onClick={() => setDraft(value => ({ ...value, coverKey: value.coverKey === key ? "" : key }))} aria-pressed={draft.coverKey === key} className={"rounded-xl border p-2 text-left " + (draft.coverKey === key ? "border-primary bg-primary/10" : "border-border")}><img src={asset(file)} alt="" className="h-20 w-full rounded-lg object-cover" /><span className="mt-2 block text-xs">{label}</span></button>)}</div></section>
          <section className={card}><h3 className="font-semibold">Видимость</h3><div className="mt-3 flex gap-2">{(["public", "private"] as const).map(value => <button key={value} type="button" onClick={() => setDraft(current => ({ ...current, visibility: value }))} className={"flex-1 rounded-xl border p-3 text-sm " + (draft.visibility === value ? "border-primary bg-primary/10" : "border-border")}>{value === "public" ? "Публичная" : "Приватная"}</button>)}</div></section>
          <div className="flex gap-2">{button("Сохранить подборку", () => void saveCollection(), busy || !draft.title.trim())}{button("Отмена", () => setScreen("collections"), false, true)}</div>
        </div>
      )}

      {screen === "collection" && collection && (
        <div className="space-y-4">
          {collection.coverUrl && <img src={collection.coverUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />}
          {heading(collection.title, collection.description)}
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{collectionItems.length} / {profile?.plusActive ? 300 : 50} аниме</span>
            {collection.own && button("Добавить аниме", () => setAnimePickerOpen(true), collectionItems.length >= (profile?.plusActive ? 300 : 50))}
            <button type="button" onClick={() => void toggleLike()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm" aria-pressed={liked}><Heart className={"h-4 w-4 " + (liked ? "fill-rose-500 text-rose-500" : "")} />{likeCount}</button>
          </div>
          {collectionItems.length === 0 ? <div className={card + " text-center text-sm text-muted-foreground"}>Подборка пока пуста.</div> :
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{collectionItems.map(anime => <article key={anime.id} className={card + " p-2"}>
              <button type="button" onClick={() => onSelectAnime(anime)} className="w-full text-left"><img src={anime.posterUrl ?? ""} alt="" className="aspect-[2/3] w-full rounded-lg object-cover" /><span className="mt-2 line-clamp-2 text-xs font-semibold">{anime.title}</span></button>
              {collection.own && <button type="button" onClick={() => void removeAnime(anime.id)} className="mt-2 text-xs text-destructive">Убрать</button>}
            </article>)}</div>}
          {animePickerOpen && <section className={card}><div className="flex items-center justify-between"><h3 className="font-semibold">Добавить аниме</h3><button type="button" onClick={() => setAnimePickerOpen(false)} aria-label="Закрыть"><X className="h-5 w-5" /></button></div>
            <input value={animeQuery} onChange={event => setAnimeQuery(event.target.value)} placeholder="Найти аниме в каталоге" className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{filteredAnime.map(anime => <button key={anime.id} type="button" onClick={() => void addAnime(anime)} className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left"><img src={anime.posterUrl ?? ""} alt="" className="h-14 w-10 rounded object-cover" /><span className="min-w-0 flex-1 text-sm font-medium">{anime.title}</span><Plus className="h-4 w-4" /></button>)}</div>
          </section>}
        </div>
      )}

      {screen === "level" && profile && (
        <div className="space-y-4">
          <section className={card + " flex items-center gap-4"}><img src={asset(profile.level.art)} alt="" className="h-24 w-24 object-contain" /><div><p className="text-xs text-muted-foreground">Уровень {profile.level.level}</p><h2 className="text-xl font-bold">{profile.level.name}</h2><p className="mt-1 text-sm">{profile.xp ?? 0} XP</p><p className="text-xs text-muted-foreground">До следующего уровня: {profile.xpToNext ?? 0} XP</p><div className="mt-2 h-2 w-48 max-w-full rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: (profile.xpProgress ?? 0) + "%" }} /></div></div></section>
          <section className={card}><h3 className="font-semibold">Все уровни YUBERA</h3><div className="mt-3 space-y-2">{LEVELS.map(([name, min, max, file], index) => <div key={name} className={"flex items-center gap-3 rounded-xl border p-3 " + (profile.level.level === index + 1 ? "border-primary bg-primary/10" : "border-border")}><img src={asset(file)} alt="" className="h-12 w-12 object-contain" /><span className="min-w-0 flex-1"><b className="block text-sm">{name}</b><span className="text-xs text-muted-foreground">{min}–{max ?? "∞"} XP</span></span>{profile.level.level >= index + 1 && <Check className="h-4 w-4 text-primary" />}</div>)}</div>
            <p className="mt-4 text-sm text-muted-foreground">XP начисляется за первое уникальное оценивание (+10), добавление уникального аниме в подборку (+2), три тайтла в подборке (+15) и просмотр не менее 90% серии (+5). Донаты и Plus XP не дают.</p></section>
        </div>
      )}

      {screen === "support-status" && profile && (
        <div className="space-y-4">
          <section className={card + " flex items-center gap-4"}><img src={asset(profile.supportStatus.art ?? SUPPORTS[0][2])} alt="" className="h-20 w-20 object-contain" /><div><p className="text-xs text-muted-foreground">Текущий статус</p><h2 className="text-xl font-bold">{profile.supportStatus.name}</h2><p className="text-xs text-muted-foreground">Уровень {profile.supportStatus.level}</p></div></section>
          <section className={card}><h3 className="font-semibold">Статусы поддержки</h3><div className="mt-3 space-y-3">{SUPPORTS.map(([name, threshold, file], index) => <div key={name} className="flex items-center gap-3 rounded-xl border border-border p-3"><img src={asset(file)} alt="" className="h-14 w-14 object-contain" /><span className="min-w-0 flex-1"><b className="block text-sm">{name}</b><span className="text-xs text-muted-foreground">От {threshold.toLocaleString("ru-RU")} ⭐</span></span>{profile.supportStatus.level >= index + 1 && <Check className="h-4 w-4 text-primary" />}</div>)}</div>
            <p className="mt-4 text-xs text-muted-foreground">Учитываются подтверждённые пожертвования Telegram Stars за вычетом возвратов. Оплата Plus не увеличивает статус поддержки.</p></section>
          {button("Перейти к поддержке", supportOpen, false, true)}
        </div>
      )}

      {screen === "support-plus" && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-border bg-[#171820]"><img src={asset("yubera_banner.webp")} alt="" className="h-32 w-full object-cover" /><div className="p-4"><h2 className="text-xl font-bold">Поддержка YUBERA</h2><p className="mt-1 text-sm text-muted-foreground">Поддержи развитие проекта и открой возможности YUBERA Plus.</p></div></section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card}><div className="flex items-center gap-3"><Star className="h-8 w-8 fill-[#FFC044] text-[#FFC044]" /><div><h3 className="font-bold">Поддержать проект</h3><p className="text-xs text-muted-foreground">Разовое пожертвование Telegram Stars</p></div></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{[50, 100, 250, 500, 1000].map(value => <button key={value} type="button" onClick={() => { setSupportAmount(value); setCustomStars(""); resetSupportPage(); }} aria-pressed={!customStars && supportAmount === value} className={"rounded-xl border p-2 text-sm font-semibold " + (!customStars && supportAmount === value ? "border-primary bg-primary/10" : "border-border")}>{value} ⭐</button>)}</div>
              <label className="mt-3 block text-xs font-medium">Другая сумма (1–100 000 ⭐)<input value={customStars} onChange={event => setCustomStars(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>
              {supportError && <p role="alert" className="mt-2 text-xs text-destructive">{supportError}</p>}{supportNotice && <p role="status" className="mt-2 text-xs text-emerald-400">{supportNotice}</p>}
              {button(supportBusy ? "Создаём счёт…" : "Поддержать в Telegram Stars", () => void createSupportInvoice(), supportBusy || pollingInvoice)}
              {!getTelegramWebApp()?.initData && <p className="mt-2 text-xs text-muted-foreground">Для оплаты открой YUME как Mini App в Telegram.</p>}
            </section>
            <section className={card}><div className="flex items-center gap-3"><img src={asset("YUBERA_Plus_Crown_Simple.webp")} alt="" className="h-12 w-12 object-contain" /><div><h3 className="font-bold">YUBERA Plus</h3><p className="text-xs text-muted-foreground">30 дней · Telegram Stars</p></div></div>
              <div className="mt-4 space-y-3">{[
                ["AI-помощник", "Скоро", false], ["Расширенные подборки", "До 30 подборок и 300 аниме в каждой", true],
                ["Эксклюзивные рамки аватара", "Пять тематических рамок при активной подписке", true],
                ["Статус YUBERA Plus", "Отметка в профиле на период подписки", true],
              ].map(([title, description, active]) => <div key={String(title)} className="flex items-start gap-2"><Check className={"mt-0.5 h-4 w-4 " + (active ? "text-primary" : "text-muted-foreground")} /><span><b className="block text-sm">{title}</b><span className="text-xs text-muted-foreground">{description}</span></span></div>)}</div>
              {plusState?.active ? <div className="mt-4 rounded-xl border border-emerald-500/25 p-3"><b className="text-sm">Подписка активна</b><p className="mt-1 text-xs text-muted-foreground">До {new Date(plusState.expiresAt * 1000).toLocaleDateString("ru-RU")}</p><p className="mt-1 text-xs text-muted-foreground">{plusState.autoRenew ? "Автопродление включено" : "Без автопродления"}</p>{button(plusState.autoRenew ? "Отменить автопродление" : "Включить автопродление", () => void changeRenewal(!plusState.autoRenew), plusBusy, true)}</div> :
                <div className="mt-4"><p className="text-xl font-bold">{plusPrice === null ? "Цена ещё не установлена" : plusPrice.toLocaleString("ru-RU") + " ⭐ / 30 дней"}</p><label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={autoRenew} onChange={event => setAutoRenew(event.target.checked)} className="mt-0.5" />Согласен на автоматическое продление каждые 30 дней. Выключено по умолчанию.</label>{button(plusBusy ? "Создаём счёт…" : "Оформить YUBERA Plus", () => void createPlusInvoice(), plusBusy || plusPrice === null || plusPrice < 1)}</div>}
            </section>
          </div>
          {isAdmin && button("Настроить стоимость YUBERA Plus", () => setScreen("plus-admin"), false, true)}
        </div>
      )}

      {screen === "plus-admin" && isAdmin && (
        <div className="space-y-4">
          {heading("Управление YUBERA Plus", "Цена действует для новых покупок; текущие периоды не меняются.")}
          <section className={card}><label className="block text-sm font-semibold">Цена на 30 дней (Telegram Stars)</label><input value={plusPriceDraft} onChange={event => setPlusPriceDraft(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" /><p className="mt-2 text-xs text-muted-foreground">Допустимо от 1 до 10 000 ⭐. Сейчас: {plusPrice ?? "не задана"}.</p>{button("Сохранить цену", () => void savePrice(), plusBusy || !plusPriceDraft)}</section>
        </div>
      )}
    </main>
  );
}
