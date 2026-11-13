import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Check, ChevronRight, Crown, Eye, FileText, Globe2, Heart, Image as ImageIcon, Info, Layers3, LifeBuoy, LockKeyhole, LogOut, Pencil, Pin, Plus, Search, Settings, Shield, ShieldCheck, Sparkles, Star, Trash2, Type, Users, X } from "lucide-react";
import { TelegramStarsDonation } from "./TelegramStarsDonation";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";
import { YuberaPlusPanel } from "./YuberaPlusPanel";
import { YuberaFriendsPanel } from "./YuberaFriendsPanel";
import type { Anime } from "@/data/anime";
import { YUBERA_SUPPORT_LEVELS, YUBERA_XP_LEVELS, YUBERA_XP_REWARDS, YUBERA_XP_RULES } from "@/data/yubera-config";

type Screen = "home" | "edit" | "collections" | "collection-detail" | "create" | "edit-collection" | "friends" | "level" | "support-status" | "plus" | "public-profile" | "public-collections";
type ProfileData = {
  id: string; displayName: string; username: string | null; photoUrl: string | null; bio: string;
  avatarFrame: string | null; availableSupportFrames?: string[]; visibility: "public" | "private"; isPlus: boolean; isFollowing?: boolean;
  followers: number; following: number; publicCollections: number; publicTitles: number; collectionLikes: number;
  xp: { total?: number; level: number; title: string; nextLevel?: number | null; nextTitle?: string | null; nextThreshold?: number | null; progress?: number; remaining?: number };
  support: { level: number; title: string; asset: string | null; total?: number; nextThreshold?: number | null; progress?: number; remaining?: number };
  stats?: { favorites: number; watchlist: number; history: number } | null;
};
type Collection = { id: string; title: string; description: string; cover_key: string | null; is_public: number; is_pinned: number; title_count: number; like_count: number; liked: number };
type CollectionFormSnapshot = { title: string; description: string; cover: string | null; isPublic: boolean; editingCollectionId: string | null };
type ProfileFormSnapshot = { bio: string; visibility: "public" | "private"; frame: string | null };
type Props = { animeList: Anime[]; onSelect: (anime: Anime) => void; onBack: () => void; isAdmin?: boolean; onSettings?: () => void; settingsExpanded?: boolean; onLegal?: () => void; onAbout?: () => void; onAdmin?: () => void; onSupport?: () => void; onAccount?: () => void; onScreenChange?: (screen: Screen) => void };

const covers = [
  "YUBERA_Collection_Cover_Action.webp",
  "YUBERA_Collection_Cover_Adventure_Fantasy.webp",
  "YUBERA_Collection_Cover_Romance.webp",
  "YUBERA_Collection_Cover_Slice_of_Life.webp",
  "YUBERA_Collection_Cover_Thriller_Mystery.webp",
];
const levelAssets = ["YUBERA_Level_01_Option_A.webp","YUBERA_Level_02.webp","YUBERA_Level_03.webp","YUBERA_Level_04.webp","YUBERA_Level_05_Transparent.webp","YUBERA_Level_06.webp","YUBERA_Level_07_Transparent.webp","YUBERA_Level_08_Transparent.webp","YUBERA_Level_09_Transparent.webp","YUBERA_Level_10_New_Design.webp"];
const levels = YUBERA_XP_LEVELS.map(({ title, min, max }) => [
  title,
  max === null ? `${min.toLocaleString("ru-RU")}+ XP` : `${min.toLocaleString("ru-RU")}–${max.toLocaleString("ru-RU")} XP`,
] as const);
const supportFrameOptions = [
  ["YUBERA_Contribution_Avatar_Frame_01_Soyuznik.webp.webp", "Союзник"],
  ["YUBERA_Contribution_Avatar_Frame_02_Storonnik.webp.webp", "Сторонник"],
  ["YUBERA_Contribution_Avatar_Frame_03_Predanniy_Uchastnik.webp.webp", "Преданный участник"],
  ["YUBERA_Contribution_Avatar_Frame_04_Pochetnyy_Pokrovitel.webp", "Почётный покровитель"],
  ["YUBERA_Contribution_Avatar_Frame_05_Legenda_YUBERA.webp", "Легенда YUBERA"],
];
const plusFrameOptions = [
  ["YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp", "Sakura Gold"],
  ["YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp", "Mystic Kitsune"],
  ["YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp", "Samurai Steel"],
  ["YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp", "Celestial Archive"],
  ["YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp", "Cyberpunk Neon"],
];
const supportLevels = YUBERA_SUPPORT_LEVELS.filter((item) => item.level > 0).map(({ title, min, asset }) => [
  title,
  `${min.toLocaleString("ru-RU")} ⭐`,
  asset ?? "",
] as const);
function formatCollectionTitleCount(value: number): string {
  const remainder100 = value % 100;
  const remainder10 = value % 10;
  const word = remainder100 >= 11 && remainder100 <= 14 ? "тайтлов"
    : remainder10 === 1 ? "тайтл"
    : remainder10 >= 2 && remainder10 <= 4 ? "тайтла"
    : "тайтлов";
  return `${value} ${word}`;
}

export function YuberaProfileHub({ animeList, onSelect, onBack, isAdmin = false, onSettings, settingsExpanded = false, onLegal, onAbout, onAdmin, onSupport, onAccount, onScreenChange }: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bio, setBio] = useState("");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [frame, setFrame] = useState<string | null>(null);
  const [frameCategory, setFrameCategory] = useState<"support" | "plus">("support");
  const [profileFormInitial, setProfileFormInitial] = useState<ProfileFormSnapshot>({ bio: "", visibility: "private", frame: null });
  const [discardProfileOpen, setDiscardProfileOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [collectionFormInitial, setCollectionFormInitial] = useState<CollectionFormSnapshot>({ title: "", description: "", cover: null, isPublic: true, editingCollectionId: null });
  const [collectionFormReturnScreen, setCollectionFormReturnScreen] = useState<Screen>("home");
  const [discardCollectionOpen, setDiscardCollectionOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [activeCollectionIsOwner, setActiveCollectionIsOwner] = useState(true);
  const [activeCollectionItems, setActiveCollectionItems] = useState<string[]>([]);
  const [collectionReturnScreen, setCollectionReturnScreen] = useState<Screen>("home");
  const [publicProfileReturnScreen, setPublicProfileReturnScreen] = useState<Screen>("home");
  const [publicBioExpanded, setPublicBioExpanded] = useState(false);
  const [animeSearch, setAnimeSearch] = useState("");

  const [publicProfile, setPublicProfile] = useState<ProfileData | null>(null);
  const [publicCollections, setPublicCollections] = useState<Collection[]>([]);
  const [donationOpen, setDonationOpen] = useState(false);

  useEffect(() => {
    const resetToProfileHome = () => {
      setMenuId(null);
      setScreen("home");
      onScreenChange?.("home");
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("yume-reset-current-tab", resetToProfileHome);
    return () => window.removeEventListener("yume-reset-current-tab", resetToProfileHome);
  }, [onScreenChange]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/yubera/community?action=me", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить профиль");
      setProfile(data.profile);
      setCollections(Array.isArray(data.collections) ? data.collections : []);
      setBio(data.profile.bio || "");
      setVisibility(data.profile.visibility || "private");
      setFrame(data.profile.avatarFrame || null);
      setProfileFormInitial({ bio: data.profile.bio || "", visibility: data.profile.visibility || "private", frame: data.profile.avatarFrame || null });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const request = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/yubera/community", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      const messages: Record<string, string> = {
        invalid_collection: "Проверьте название и описание подборки.",
        collection_limit_reached: "Достигнут лимит подборок для вашего тарифа.",
        collection_title_limit_reached: "Достигнут лимит тайтлов в этой подборке.",
        not_found: "Подборка не найдена или у вас нет доступа.",
        catalog_unavailable: "Каталог временно недоступен. Попробуйте позже.",
        anime_not_found: "Не удалось найти выбранное аниме в каталоге.",
      };
      if (!response.ok) throw new Error(messages[String(data.error)] || "Не удалось выполнить действие. Попробуйте ещё раз.");
      return data;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка запроса"); return null; }
    finally { setBusy(false); }
  };
  const changeScreen = (next: Screen) => { setMenuId(null); setError(""); setScreen(next); onScreenChange?.(next); window.scrollTo({ top: 0, behavior: "auto" }); };
  const orderedCollections = useMemo(() => [...collections].sort((a,b) => Number(b.is_pinned)-Number(a.is_pinned)), [collections]);
  const pinned = orderedCollections.filter(item => item.is_pinned);
  const rest = orderedCollections.filter(item => !item.is_pinned);

  const viewPublicProfile = async (id: string) => {
    try {
      const response = await fetch(`/api/yubera/community?action=profile&userId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Профиль недоступен");
      if (id === profile?.id) { changeScreen("home"); return; }
      setPublicProfileReturnScreen(screen);
      setPublicBioExpanded(false);
      setPublicProfile(data.profile); setPublicCollections(Array.isArray(data.collections) ? data.collections : []); changeScreen("public-profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Профиль недоступен"); }
  };
  const follow = async (id: string, following: boolean) => {
    const result = await request({ action: "follow", userId: id, following });
    if (result) {
      await load();
      if (publicProfile?.id === id) setPublicProfile((current) => current ? { ...current, isFollowing: following } : current);
    }
  };
  const togglePublicCollectionLike = async (item: Collection) => {
    const result = await request({ action: "collection.like", id: item.id, liked: !item.liked });
    if (!result || !publicProfile) return;
    try {
      const response = await fetch("/api/yubera/community?action=profile&userId=" + encodeURIComponent(publicProfile.id), { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось обновить профиль");
      setPublicProfile(data.profile);
      setPublicCollections(Array.isArray(data.collections) ? data.collections : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обновить профиль");
    }
  };
  const publicCollectionRow = (item: Collection) => (
    <div key={item.id} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0">
      <button type="button" onClick={() => void openCollection(item, false)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {item.cover_key ? <img src={"/images/yubera/" + item.cover_key} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-white/25"><Layers3 className="h-6 w-6" /></span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
          <span className="block text-xs text-white/45">{formatCollectionTitleCount(item.title_count)}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
      </button>
      <button type="button" disabled={busy} onClick={() => void togglePublicCollectionLike(item)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs text-[#FF5738] disabled:opacity-50" aria-label={item.liked ? "Убрать лайк" : "Поставить лайк"}>
        <Heart className="h-4 w-4" fill={item.liked ? "currentColor" : "none"} />
        <span>{item.like_count}</span>
      </button>
    </div>
  );

  const saveProfile = async () => {
    const result = await request({ action: "profile.update", bio, visibility, avatarFrame: frame });
    if (result) { await load(); changeScreen("home"); }
  };
  const createCollection = async () => {
    if (!title.trim()) { setError("Укажите название подборки."); return; }
    const result = await request({ action: editingCollectionId ? "collection.update" : "collection.create", ...(editingCollectionId ? { id: editingCollectionId } : {}), title: title.trim(), description: description.trim(), coverKey: cover, isPublic });
    if (result) {
      setTitle(""); setDescription(""); setCover(null); setIsPublic(true); setEditingCollectionId(null);
      setCollectionFormInitial({ title: "", description: "", cover: null, isPublic: true, editingCollectionId: null });
      await load(); changeScreen("collections");
    }
  };
  const collectionAction = async (body: Record<string, unknown>) => {
    const result = await request(body);
    if (result) { setMenuId(null); await load(); }
  };
  const startCreateCollection = () => {
    setCollectionFormReturnScreen(screen);
    const initial = { title: "", description: "", cover: null, isPublic: true, editingCollectionId: null };
    setTitle(initial.title);
    setDescription(initial.description);
    setCover(initial.cover);
    setIsPublic(initial.isPublic);
    setEditingCollectionId(initial.editingCollectionId);
    setCollectionFormInitial(initial);
    changeScreen("create");
  };
  const cancelCollectionForm = () => {
    const dirty = title !== collectionFormInitial.title
      || description !== collectionFormInitial.description
      || cover !== collectionFormInitial.cover
      || isPublic !== collectionFormInitial.isPublic
      || editingCollectionId !== collectionFormInitial.editingCollectionId;
    if (dirty) setDiscardCollectionOpen(true);
    else changeScreen(collectionFormReturnScreen);
  };
  const confirmDiscardCollectionForm = () => {
    setDiscardCollectionOpen(false);
    setTitle("");
    setDescription("");
    setCover(null);
    setIsPublic(true);
    setEditingCollectionId(null);
    setCollectionFormInitial({ title: "", description: "", cover: null, isPublic: true, editingCollectionId: null });
    changeScreen(collectionFormReturnScreen);
  };
  const cancelProfileEdit = () => {
    const dirty = bio !== profileFormInitial.bio || visibility !== profileFormInitial.visibility || frame !== profileFormInitial.frame;
    if (dirty) setDiscardProfileOpen(true);
    else changeScreen("home");
  };
  const confirmDiscardProfileEdit = () => {
    setDiscardProfileOpen(false);
    setBio(profileFormInitial.bio);
    setVisibility(profileFormInitial.visibility);
    setFrame(profileFormInitial.frame);
    changeScreen("home");
  };

  const goBack = () => {
    if (screen === "home") onBack();
    else if (screen === "public-collections") changeScreen("public-profile");
    else if (screen === "public-profile") changeScreen(publicProfileReturnScreen);
    else if (screen === "collection-detail" && !activeCollectionIsOwner) changeScreen(collectionReturnScreen);
    else if (screen === "edit") cancelProfileEdit();
    else if (screen === "create" || screen === "edit-collection") cancelCollectionForm();
    else changeScreen("home");
  };
  useEffect(() => {
    if (screen === "home" || !getTelegramWebApp()?.initData) return;
    const handleTelegramBack = (event: Event) => {
      event.preventDefault();
      goBack();
    };
    window.addEventListener("yume-telegram-back", handleTelegramBack);
    return () => window.removeEventListener("yume-telegram-back", handleTelegramBack);
  }, [screen]);

  const Header = ({ title: heading, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-3 flex items-center gap-3">
      {!getTelegramWebApp()?.initData && <button type="button" onClick={goBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white" aria-label="Назад"><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0"><h2 className="text-xl font-bold text-white">{heading}</h2>{subtitle && <p className="text-sm text-white/55">{subtitle}</p>}</div>
    </div>
  );
  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`rounded-[18px] border border-white/10 bg-[#17181e] p-3 ${className}`}>{children}</section>;
  const Action = ({ icon, label, onClick, detail, expanded, controls }: { icon: React.ReactNode; label: string; onClick: () => void; detail?: string; expanded?: boolean; controls?: string }) => (
    <button type="button" onClick={onClick} aria-expanded={expanded} aria-controls={controls} className={`flex min-h-[68px] w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition hover:border-white/20 ${label === "Панель администратора" ? "border-[#FF5738]/45 bg-[#FF5738]/[0.09]" : "border-white/10 bg-[#17181e]"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${label === "Панель администратора" ? "bg-[#FF5738]/25 text-[#FF704F]" : "bg-[#FF5738]/15 text-[#FF6847]"}`}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block whitespace-normal break-words text-[14px] font-semibold leading-tight text-white">{label}</span>{detail && <span className="mt-0.5 block whitespace-normal break-words text-[12px] leading-snug text-white/55">{detail}</span>}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/45" />
    </button>
  );
  const avatar = (p: ProfileData | null, size = "h-[76px] w-[76px]") => {
    const hasFrame = Boolean(p?.avatarFrame);
    return (
      <div className={`relative ${size} shrink-0 rounded-full ${hasFrame ? "bg-transparent" : "border-2 border-[#FF5738] bg-[#252630] p-1"}`}>
        {p?.photoUrl
          ? <img src={p.photoUrl} alt="" className={hasFrame ? "absolute inset-[14%] h-[72%] w-[72%] rounded-full object-cover" : "h-full w-full rounded-full object-cover"} />
          : hasFrame
            ? <div className="absolute inset-[14%] grid h-[72%] w-[72%] place-items-center rounded-full text-2xl text-white/50"><Users /></div>
            : <div className="grid h-full w-full place-items-center rounded-full text-2xl text-white/50"><Users /></div>}
        {p?.avatarFrame && <img src={`/images/yubera/${p.avatarFrame}`} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
      </div>
    );
  };
  const openCollection = async (item: Collection, isOwner = true) => {
    try {
      setCollectionReturnScreen(screen);
      const response = await fetch(`/api/yubera/community?action=collection&id=${encodeURIComponent(item.id)}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось открыть подборку");
      setActiveCollection(item);
      setActiveCollectionIsOwner(isOwner);
      setActiveCollectionItems(Array.isArray(data.items) ? data.items.map((entry: { anime_id: string }) => entry.anime_id) : []);
      setAnimeSearch("");
      changeScreen("collection-detail");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть подборку"); }
  };
  const collectionRow = (item: Collection) => (
    <div key={item.id} className="relative flex items-center gap-3 border-b border-white/5 py-3 last:border-0">
      <button type="button" onClick={() => void openCollection(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5">{item.cover_key && <img src={`/images/yubera/${item.cover_key}`} alt="" className="h-full w-full object-cover" />}{Boolean(item.is_pinned) && <span className="absolute left-1 top-1 rounded-full bg-[#FF5738] p-1 text-black"><Pin className="h-3 w-3" /></span>}</div>
        <span className="min-w-0"><span className="block truncate font-semibold text-white">{item.title}</span><span className="text-xs text-white/50">{formatCollectionTitleCount(item.title_count)} · {item.like_count} лайков</span></span>
      </button>
      <button type="button" onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-white/70" aria-label="Действия подборки">•••</button>
      {menuId === item.id && <>
        <button type="button" aria-label="Закрыть меню" onClick={() => setMenuId(null)} className="fixed inset-0 z-10 cursor-default" />
        <div className="absolute right-10 top-12 z-20 w-52 rounded-xl border border-white/15 bg-[#202127] p-1 shadow-2xl">
          <button onClick={() => void collectionAction({action:"collection.pin",id:item.id,pinned:!item.is_pinned})} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/5"><Pin className="h-4 w-4 text-white/55"/>{item.is_pinned ? "Открепить" : "Закрепить"}</button>
          <div className="mx-2 h-px bg-white/10" />
          <button onClick={() => {setCollectionFormReturnScreen("collections");setTitle(item.title);setDescription(item.description);setIsPublic(Boolean(item.is_public));setCover(item.cover_key);setEditingCollectionId(item.id);setCollectionFormInitial({title:item.title,description:item.description,cover:item.cover_key,isPublic:Boolean(item.is_public),editingCollectionId:item.id});setMenuId(null);changeScreen("edit-collection");}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/5"><Pencil className="h-4 w-4 text-white/55"/>Редактировать</button>
          <div className="mx-2 h-px bg-white/10" />
          <button onClick={() => {setDeleteTarget(item);setMenuId(null);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#FF5738] hover:bg-white/5"><Trash2 className="h-4 w-4"/>Удалить</button>
        </div>
      </>}
    </div>
  );

  if (!profile) return <div className="mx-auto max-w-3xl px-4 py-8 text-white"><Header title="YUBERA" />{error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <div className="animate-pulse space-y-3"><div className="h-28 rounded-2xl bg-white/5"/><div className="h-20 rounded-2xl bg-white/5"/></div>}</div>;

  const xpTotal = profile.xp.total ?? 0;
  const currentXpLevel = YUBERA_XP_LEVELS.find((item) => item.level === profile.xp.level);
  const nextXpLevel = YUBERA_XP_LEVELS.find((item) => item.level === profile.xp.level + 1);
  const nextXpThreshold = profile.xp.nextThreshold ?? nextXpLevel?.min ?? null;
  const xpProgress = nextXpThreshold !== null && typeof profile.xp.progress === "number"
    ? Math.max(0, Math.min(100, profile.xp.progress))
    : null;
  const levelTitle = profile.xp.title || currentXpLevel?.title || `Уровень ${profile.xp.level}`;
  const levelAsset = levelAssets[profile.xp.level - 1] || levelAssets[0];

  return <div className="mx-auto w-full max-w-none px-0 pb-3 pt-0 text-white">
    {screen === "home" && !getTelegramWebApp()?.initData && <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80" aria-label="Назад"><ArrowLeft className="h-4 w-4" />Назад</button>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
    {screen === "home" && <>
      <section aria-label="Профиль пользователя" className="overflow-hidden rounded-[28px] border border-white/10 bg-[#17181e] px-3 pb-2 pt-2">
        <div className="relative h-[clamp(170px,46vw,190px)] overflow-hidden rounded-[21px]">
          <img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover object-[center_38%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#17181e]/95 via-[#17181e]/20 to-transparent" />
          <div className="absolute inset-x-2 bottom-2 flex items-end gap-2">
            <div className="shrink-0">{avatar(profile, "h-[72px] w-[72px]")}</div>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-2">
              <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="min-w-0 whitespace-normal break-words text-[clamp(18px,4.6vw,22px)] font-bold leading-tight">{profile.displayName}</h2>
                {profile.isPlus && <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#ffc66d]/55 bg-[#ffc66d]/10 px-2.5 py-1 text-[11px] font-bold leading-none text-[#ffc66d]"><img src="/images/yubera/YUBERA_Plus_Crown_Simple.webp" alt="" className="h-3.5 w-3.5 object-contain" />Plus</span>}
              </div>
              <div className="min-w-0 self-start">
                {profile.username && <p className="whitespace-normal break-words text-[13px] leading-tight text-white/75">@{profile.username}</p>}
                {profile.bio.trim() && <button type="button" aria-expanded={bioExpanded} aria-label={bioExpanded ? "Свернуть описание профиля" : "Развернуть описание профиля"} onClick={() => setBioExpanded(value => !value)} className={`mt-1 block w-full text-left text-[11px] leading-snug text-white/80 ${bioExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-1"}`}>{profile.bio}</button>}
              </div>
              <button type="button" onClick={() => changeScreen("edit")} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-center whitespace-nowrap rounded-full bg-white/10 px-3 py-2 text-[12px] font-semibold leading-none text-white" aria-label="Редактировать профиль"><Pencil className="h-3.5 w-3.5 shrink-0" /><span>Редактировать</span></button>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[1.12fr_1fr] gap-2">
          <button type="button" onClick={() => changeScreen("level")} aria-label={`Уровень ${profile.xp.level}: ${levelTitle}`} className="flex min-h-[58px] min-w-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-[#202127] px-2 py-2 text-left">
            <img src={`/images/yubera/${levelAsset}`} alt="" className="h-9 w-9 shrink-0 object-contain" />
            <span className="min-w-0 flex-1">
              <b className="block whitespace-normal break-normal text-[12px] font-semibold leading-[1.15] text-white">{levelTitle}</b>
              <span className="mt-1 block whitespace-normal break-normal text-[10px] leading-tight text-white/65">
                Уровень {profile.xp.level} · {xpTotal.toLocaleString("ru-RU")}{nextXpThreshold !== null ? ` / ${nextXpThreshold.toLocaleString("ru-RU")} XP` : " XP"}
              </span>
              {xpProgress !== null && <span data-testid="profile-xp-progress" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#FF5738] to-[#FF6245]" style={{ width: `${xpProgress}%` }} /></span>}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/65" />
          </button>
          <button type="button" onClick={() => changeScreen("support-status")} aria-label={`Статус поддержки: ${profile.support.title}`} className="flex min-h-[58px] min-w-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-[#202127] px-2 py-2 text-left">
            {profile.support.asset
              ? <img src={`/images/yubera/${profile.support.asset}`} alt="" className="h-9 w-9 shrink-0 object-contain" />
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FF5738]/15 text-[#FF5738]"><Star className="h-5 w-5" /></span>}
            <span className="min-w-0 flex-1">
              <b className="block whitespace-normal break-normal text-[12px] font-semibold leading-[1.15] text-white">{profile.support.level > 0 ? profile.support.title : "Поддержка"}</b>
              <span className="mt-1 block whitespace-normal break-normal text-[10px] leading-tight text-white/65">Статус поддержки</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/65" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 divide-x divide-white/10 rounded-[20px] border border-white/10 bg-black/20 text-center">
          {[[ "В избранном", profile.stats?.favorites ], [ "В моём списке", profile.stats?.watchlist ], [ "В истории", profile.stats?.history ]].map(([label, value]) => <div key={String(label)} className="min-w-0 px-1 py-2"><b className="block text-[22px] font-bold leading-none">{typeof value === "number" ? value : "—"}</b><span className="mt-1.5 block whitespace-nowrap text-[clamp(10px,2.7vw,12px)] leading-tight text-white/65">{label}</span></div>)}
        </div>
      </section>
      <Card className="mt-2 p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-[#FF5738]" />Мои подборки</h3><button type="button" onClick={() => changeScreen("collections")} className="shrink-0 text-xs text-[#FF5738]">Все подборки <ChevronRight className="inline h-3 w-3" /></button></div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={startCreateCollection} className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-xl border border-dashed border-white/30 text-center text-xs text-white/75"><Plus className="h-6 w-6 text-[#FF5738]" /><span>Создать подборку</span></button>
          {orderedCollections.slice(0, 5).map(item => <button type="button" key={item.id} onClick={() => void openCollection(item)} className="relative h-[92px] w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 text-left">{item.cover_key ? <img src={`/images/yubera/${item.cover_key}`} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-white/5" />}<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" /><span className="absolute bottom-2 left-2 right-2"><b className="block truncate text-xs">{item.title}</b><span className="text-[10px] text-white/75">{item.title_count} тайтлов</span></span></button>)}
        </div>
      </Card>
      <div className="mt-2 space-y-2">
        <Action icon={<Users />} label="Друзья" detail="Пользователи, на которых вы подписаны" onClick={() => changeScreen("friends")} />
        <Action icon={<Settings />} label="Настройки приложения" detail="Тема, язык и другие параметры" onClick={() => onSettings?.()} expanded={settingsExpanded} controls="app-settings" />
        <Action icon={<ShieldCheck />} label="Правовая информация" detail="Политика конфиденциальности и правила сайта" onClick={() => onLegal?.()} />
        <Action icon={<Info />} label="О Yubera" detail="О проекте и версии сайта" onClick={() => onAbout?.()} />
        {isAdmin && <Action icon={<Shield />} label="Панель администратора" detail="Управление сайтом и каталогом" onClick={() => onAdmin?.()} />}
        <Action icon={<LifeBuoy />} label="Поддержка" detail="Помощь и сообщения о проблемах" onClick={() => onSupport?.()} />
      </div>
    </>}
    {screen === "edit" && <><Header title="Редактирование профиля" subtitle="Настройте описание, видимость и оформление профиля"/><Card>
      <div className="mb-4 flex items-center gap-3">{avatar(profile)}<div><b>{profile.displayName}</b><p className="text-sm text-white/50">@{profile.username || "username"}</p></div></div>
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-xs leading-relaxed text-white/55"><Info className="mt-0.5 h-4 w-4 shrink-0 text-white/45"/><span>Аватар и никнейм берутся из Telegram и не могут быть изменены на сайте</span></div>
      <section className="mb-4 rounded-2xl border border-white/10 bg-black/10 p-3">
        <div className="mb-1 flex items-center gap-2"><Eye className="h-4 w-4 text-[#FF5738]"/><h3 className="text-sm font-semibold">Видимость профиля</h3></div>
        <p className="mb-3 text-xs text-white/45">Определите, кто может находить и просматривать ваш профиль</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={visibility==="public"} onClick={()=>setVisibility("public")} className={"rounded-xl border p-3 text-left transition " + (visibility==="public"?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]")}>
            <Globe2 className={"mb-2 h-5 w-5 " + (visibility==="public"?"text-[#FF5738]":"text-white/45")}/>
            <b className="block text-sm">Публичный</b><span className="mt-1 block text-[11px] leading-snug text-white/45">Доступен в поиске и открыт для всех</span>
            <span className="mt-2 flex items-center gap-1 text-[10px] text-[#FF5738]">{visibility==="public"&&<Check className="h-3.5 w-3.5"/>}{visibility==="public"?"Выбран":" "}</span>
          </button>
          <button type="button" aria-pressed={visibility==="private"} onClick={()=>setVisibility("private")} className={"rounded-xl border p-3 text-left transition " + (visibility==="private"?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]")}>
            <LockKeyhole className={"mb-2 h-5 w-5 " + (visibility==="private"?"text-[#FF5738]":"text-white/45")}/>
            <b className="block text-sm">Закрытый</b><span className="mt-1 block text-[11px] leading-snug text-white/45">Не отображается в поиске и недоступен для общего доступа</span>
            <span className="mt-2 flex items-center gap-1 text-[10px] text-[#FF5738]">{visibility==="private"&&<Check className="h-3.5 w-3.5"/>}{visibility==="private"?"Выбран":" "}</span>
          </button>
        </div>
      </section>
      <label className="mb-2 mt-4 block text-sm font-semibold">Описание профиля</label>
      <textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={250} rows={4} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#FF5738]" placeholder="Расскажите о себе"/>
      <div className="mt-1 text-right text-xs text-white/40">{bio.length}/250</div>
      <div className="mb-3 mt-5"><h3 className="font-semibold">Рамка аватара</h3><p className="text-xs text-white/50">Выберите рамку для своего аватара</p></div>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
        <button type="button" onClick={()=>setFrameCategory("support")} className={`rounded-lg px-3 py-2 text-sm ${frameCategory==="support"?"border border-[#FF5738] bg-[#FF5738]/10 text-white":"text-white/55"}`}><Star className="mr-1 inline h-4 w-4"/>За поддержку</button>
        <button type="button" onClick={()=>setFrameCategory("plus")} className={`rounded-lg px-3 py-2 text-sm ${frameCategory==="plus"?"border border-[#FF5738] bg-[#FF5738]/10 text-white":"text-white/55"}`}><Crown className="mr-1 inline h-4 w-4"/>YUBERA Plus</button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={()=>setFrame(null)} className={`relative rounded-xl border p-2 ${frame===null?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]"}`}>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/5"><Users className="h-7 w-7 text-white/45"/></div><span className="mt-1 block text-[10px] text-white/65">Без рамки</span>{frame===null&&<Check className="absolute right-1 top-1 h-4 w-4 text-[#FF5738]"/>}
        </button>
        {(frameCategory==="support"?supportFrameOptions:plusFrameOptions).map(([asset,label])=>{
          const unlocked=frameCategory==="support"?(profile.availableSupportFrames??[]).includes(asset):profile.isPlus;
          return <button key={asset} type="button" disabled={!unlocked} onClick={()=>setFrame(asset)} className={`relative rounded-xl border p-2 ${frame===asset?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]"} disabled:cursor-not-allowed disabled:opacity-45`}>
            <div className="relative mx-auto h-16 w-16 rounded-full border border-white/15 bg-white/5"><div className="absolute inset-2 rounded-full bg-[#282a31]"/><img src={`/images/yubera/${asset}`} alt="" className="absolute -inset-1 h-[72px] w-[72px] max-w-none object-contain"/></div>
            <span className="mt-1 block min-h-7 text-[9px] leading-tight text-white/65">{label}</span>
            {!unlocked&&<LockKeyhole className="absolute right-1 top-1 h-3.5 w-3.5 text-white/65"/>}
            {frame===asset&&<Check className="absolute right-1 top-1 h-4 w-4 text-[#FF5738]"/>}
          </button>;
        })}
      </div>
      <p className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs text-white/50"><Sparkles className="mr-1 inline h-4 w-4"/> {frameCategory==="support"?"Рамки открываются по мере накопления подтверждённой поддержки проекта. Открытые рамки остаются у вас навсегда.":"Рамки YUBERA Plus доступны только при активной подписке. После её окончания такая рамка перестаёт отображаться."}</p>
      <button disabled={busy} onClick={()=>void saveProfile()} className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#FF5738] to-[#FF6245] py-3 font-semibold disabled:opacity-50">Сохранить изменения</button>
      <button type="button" disabled={busy} onClick={cancelProfileEdit} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 py-3 font-semibold">Отменить</button>
    </Card></>}
    {screen === "collection-detail" && activeCollection && <><Header title={activeCollection.title} subtitle={activeCollection.description || "Подборка аниме"}/><Card><div className="mb-3 flex items-center justify-between"><b>{activeCollectionItems.length} / {profile.isPlus ? 300 : 50} тайтлов</b><span className="text-xs text-white/45">{activeCollection.is_public ? "Публичная" : "Приватная"}</span></div>{activeCollectionItems.length ? activeCollectionItems.map(id=>{const anime=animeList.find(item=>item.id===id);return <div key={id} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0">{anime?.posterUrl ? <img src={anime.posterUrl} alt="" className="h-16 w-12 rounded-lg object-cover"/> : <div className="h-16 w-12 rounded-lg bg-white/5"/>}<button onClick={()=>anime&&onSelect(anime)} className="min-w-0 flex-1 text-left"><b className="block truncate">{anime?.title || `Аниме #${id}`}</b><span className="text-xs text-white/45">{anime?.original || ""}</span></button>{activeCollectionIsOwner && <button disabled={busy} onClick={async()=>{const result=await request({action:"collection.item.remove",id:activeCollection.id,animeId:id});if(result){setActiveCollectionItems(items=>items.filter(value=>value!==id));await load();}}} className="rounded-lg bg-white/5 p-2 text-white/55" aria-label="Убрать из подборки"><Trash2 className="h-4 w-4"/></button>}</div>}) : <p className="py-5 text-center text-sm text-white/45">В этой подборке пока нет аниме</p>}</Card>{activeCollectionIsOwner && <Card className="mt-3"><h3 className="mb-3 font-semibold">Добавить аниме</h3><input value={animeSearch} onChange={e=>setAnimeSearch(e.target.value)} placeholder="Найти аниме в каталоге" className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm"/><div className="max-h-80 space-y-1 overflow-y-auto">{animeList.filter(item=>!activeCollectionItems.includes(item.id)&&(!animeSearch.trim()||[item.title,item.englishTitle,item.original].filter(Boolean).some(value=>value!.toLocaleLowerCase().includes(animeSearch.toLocaleLowerCase())))).slice(0,30).map(anime=><div key={anime.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">{anime.posterUrl?<img src={anime.posterUrl} alt="" className="h-12 w-9 rounded object-cover"/>:<div className="h-12 w-9 rounded bg-white/5"/>}<span className="min-w-0 flex-1 truncate text-sm">{anime.title}</span><button disabled={busy||activeCollectionItems.length >= (profile.isPlus?300:50)} onClick={async()=>{const result=await request({action:"collection.item.add",id:activeCollection.id,animeId:anime.id});if(result){setActiveCollectionItems(items=>[...items,anime.id]);await load();}}} className="rounded-lg bg-[#FF5738]/15 px-3 py-2 text-xs font-semibold text-[#FF5738]">Добавить</button></div>)}</div></Card>}</>}{screen === "collections" && <><Header title="Мои подборки" subtitle="Ваши личные подборки аниме"/>{pinned.length>0 && <Card className="mb-3"><h3 className="mb-2 font-semibold"><Pin className="mr-2 inline h-4 w-4 text-[#FF5738]"/>Закреплённые подборки <span className="float-right rounded-full bg-white/10 px-2 text-xs">{pinned.length}</span></h3>{pinned.map(collectionRow)}</Card>}<Card className="mb-4"><h3 className="mb-2 font-semibold"><Layers3 className="mr-2 inline h-4 w-4 text-[#FF5738]"/>Остальные подборки <span className="float-right rounded-full bg-white/10 px-2 text-xs">{rest.length}</span></h3>{rest.length?rest.map(collectionRow):<p className="py-4 text-center text-sm text-white/45">Пока нет подборок</p>}</Card><button onClick={startCreateCollection} className="w-full rounded-2xl border border-dashed border-white/30 py-4 font-semibold"><Plus className="mr-2 inline h-5 w-5"/>Создать подборку</button></>}
    {(screen === "create" || screen === "edit-collection") && <>
      <Header title={screen === "edit-collection" ? "Редактировать подборку" : "Создать подборку"} subtitle="Соберите аниме в одном месте" />
      <div className="space-y-3">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <label htmlFor="yubera-collection-title" className="flex items-center gap-2 text-sm font-semibold"><Type className="h-4 w-4 text-[#FF5738]" />Название подборки</label>
            <span className="text-xs tabular-nums text-white/40">{title.length} / 50</span>
          </div>
          <input id="yubera-collection-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={50} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#FF5738]" placeholder="Введите название" aria-required="true" aria-invalid={!title.trim() && Boolean(error)} />
          {!title.trim() && error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </Card>
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-[#FF5738]" />
            <label htmlFor="yubera-collection-description" className="text-sm font-semibold">Описание</label>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/45">Необязательно</span>
            <span className="ml-auto text-xs tabular-nums text-white/40">{description.length} / 250</span>
          </div>
          <textarea id="yubera-collection-description" value={description} onChange={e=>setDescription(e.target.value)} maxLength={250} rows={4} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#FF5738]" placeholder="Расскажите о подборке" />
        </Card>
        <Card>
          <div className="mb-1 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-[#FF5738]" /><h3 className="text-sm font-semibold">Обложка подборки</h3></div>
          <p className="mb-3 text-xs text-white/45">Выберите изображение для подборки</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {covers.map(asset=><button key={asset} type="button" onClick={()=>setCover(current=>current===asset?null:asset)} aria-pressed={cover===asset} aria-label={cover===asset?"Снять выбор обложки":"Выбрать обложку"} className={"relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-white/5 transition " + (cover===asset?"border-[#FF5738] shadow-[0_0_0_2px_rgba(255,118,88,0.15)]":"border-white/10 hover:border-white/30")}>
              <img src={"/images/yubera/" + asset} alt="" className="h-full w-full object-cover" onError={event=>{event.currentTarget.style.display="none";}} />
              {cover===asset && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#FF5738] text-black"><Check className="h-3.5 w-3.5" /></span>}
            </button>)}
          </div>
          <p className="mt-1 text-[11px] text-white/35">Обложку можно не выбирать</p>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-[#FF5738]" /><h3 className="text-sm font-semibold">Видимость</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>setIsPublic(true)} aria-pressed={isPublic} className={"rounded-xl border p-3 text-left transition " + (isPublic?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]")}>
              <Globe2 className={"mb-2 h-5 w-5 " + (isPublic?"text-[#FF5738]":"text-white/45")} />
              <b className="block text-sm text-white">Публичная</b><span className="mt-1 block text-[11px] leading-snug text-white/45">Доступна всем пользователям</span>
            </button>
            <button type="button" onClick={()=>setIsPublic(false)} aria-pressed={!isPublic} className={"rounded-xl border p-3 text-left transition " + (!isPublic?"border-[#FF5738] bg-[#FF5738]/10":"border-white/10 bg-white/[0.02]")}>
              <LockKeyhole className={"mb-2 h-5 w-5 " + (!isPublic?"text-[#FF5738]":"text-white/45")} />
              <b className="block text-sm text-white">Приватная</b><span className="mt-1 block text-[11px] leading-snug text-white/45">Видна только вам</span>
            </button>
          </div>
        </Card>
        {error && title.trim() && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
        <button disabled={busy} onClick={()=>void createCollection()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF5738] to-[#FF6245] py-3 font-semibold text-white disabled:opacity-50">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Plus className="h-5 w-5" />}
          {screen === "edit-collection" ? "Сохранить изменения" : "Создать подборку"}
        </button>
        <button type="button" disabled={busy} onClick={cancelCollectionForm} className="min-h-12 w-full rounded-xl border border-white/15 bg-white/[0.02] py-3 font-semibold text-white/80 disabled:opacity-50">Отменить</button>
      </div>
    </>}
    {screen === "friends" && <><Header title="Друзья" subtitle="Подписки и поиск пользователей YUBERA"/><YuberaFriendsPanel onOpenProfile={(id) => void viewPublicProfile(id)} onFollowChange={load}/></>}
    {screen === "level" && <><Header title="Уровень пользователя" subtitle="Ваш прогресс и система опыта"/><Card className="text-center"><img src={`/images/yubera/${levelAssets[profile.xp.level - 1]}`} alt="" className="mx-auto h-36 w-36 object-contain"/><p className="text-sm text-white/50">Уровень {profile.xp.level}</p><h3 className="text-2xl font-bold">{profile.xp.title}</h3><p className="mt-2 text-lg font-semibold">{profile.xp.total??0} XP</p>{profile.xp.nextThreshold && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#FF5738] to-[#FF6245]" style={{width:`${profile.xp.progress??0}%`}}/></div><p className="mt-2 text-xs text-white/50">До уровня {profile.xp.nextLevel}: осталось {profile.xp.remaining} XP</p></>}</Card><Card className="mt-3"><h3 className="mb-3 font-semibold">Как получить опыт?</h3>{[["Первая оценка аниме",`+${YUBERA_XP_REWARDS.firstAnimeRating} XP`],["Добавление тайтла в подборку",`+${YUBERA_XP_REWARDS.collectionTitleAdded} XP`],[`Подборка из ${YUBERA_XP_RULES.collectionMilestoneTitleCount} тайтлов`,`+${YUBERA_XP_REWARDS.collectionThreeTitleMilestone} XP`],[`Просмотр ${Math.round(YUBERA_XP_RULES.episodeCompletionRatio*100)}% серии`,`+${YUBERA_XP_REWARDS.episodeNinetyPercent} XP`]].map(([label,xp])=><div key={label} className="flex justify-between border-b border-white/5 py-3 text-sm last:border-0"><span>{label}</span><b className="text-[#FF5738]">{xp}</b></div>)}</Card><Card className="mt-3"><h3 className="mb-3 font-semibold">Система уровней YUBERA</h3>{levels.map(([name,range],i)=><div key={name} className={`flex items-center justify-between border-b border-white/5 py-3 text-sm last:border-0 ${profile.xp.level===i+1?"text-[#FF5738]": "text-white/65"}`}><span>{i+1}. {name}</span><span>{range}</span></div>)}</Card></>}
    {screen === "support-status" && <><Header title="Статус поддержки" subtitle="Ваш вклад в развитие YUBERA"/><Card className="text-center">{profile.support.asset ? <img src={`/images/yubera/${profile.support.asset}`} alt="" className="mx-auto h-36 w-36 object-contain"/> : <div className="mx-auto grid h-36 w-36 place-items-center rounded-3xl bg-white/5 text-white/40"><Star className="h-16 w-16"/></div>}<h3 className="text-2xl font-bold">{profile.support.title}</h3><p className="mt-2 text-sm text-white/55">Статус присваивается за подтверждённую поддержку проекта в Telegram Stars.</p>{typeof profile.support.total === "number" && profile.support.nextThreshold && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#FF5738] to-[#FF6245]" style={{width:`${profile.support.progress ?? 0}%`}}/></div><p className="mt-2 text-xs text-white/50">До следующего статуса: {profile.support.remaining} ⭐</p></>}</Card><Card className="mt-3">{supportLevels.map(([name,threshold,asset],i)=><div key={name} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"><img src={`/images/yubera/${asset}`} alt="" className="h-14 w-14 object-contain"/><div className="flex-1"><b>{i+1}. {name}</b><p className="text-xs text-white/50">От {threshold}</p></div>{profile.support.level>=i+1&&<Check className="h-5 w-5 text-emerald-400"/>}</div>)}</Card></>}
    {screen === "plus" && <><Header title="YUBERA Plus" subtitle="Расширенные возможности личного пространства"/><YuberaPlusPanel /></>}
    {screen === "public-profile" && publicProfile && <>
      <Header title="Профиль пользователя" />
      <Card className="overflow-hidden p-0">
        <div className="relative h-[clamp(170px,46vw,190px)] overflow-hidden">
          <img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover object-[center_38%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#17181e] via-[#17181e]/20 to-transparent" />
          <div className="absolute inset-x-3 bottom-3 flex items-end gap-2.5">
            {avatar(publicProfile, "h-[72px] w-[72px]")}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="min-w-0 break-words text-[clamp(18px,4.5vw,22px)] font-bold leading-tight text-white">{publicProfile.displayName}</h3>
                {publicProfile.isPlus && <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#ffc66d]/55 bg-[#ffc66d]/10 px-2.5 py-1 text-[11px] font-bold leading-none text-[#ffc66d]"><img src="/images/yubera/YUBERA_Plus_Crown_Simple.webp" alt="" className="h-3.5 w-3.5 object-contain" />Plus</span>}
              </div>
              {publicProfile.username && <p className="mt-1 break-words text-[13px] leading-tight text-white/75">@{publicProfile.username}</p>}
              {publicProfile.bio && <div className="mt-1">
                <p className={publicBioExpanded ? "whitespace-pre-wrap break-words text-[11px] leading-snug text-white/80" : "line-clamp-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-white/80"}>{publicProfile.bio}</p>
                {publicProfile.bio.length > 110 && <button type="button" onClick={() => setPublicBioExpanded(value => !value)} className="mt-1 text-[10px] font-semibold text-[#ff8768]">{publicBioExpanded ? "Свернуть" : "Показать полностью"}</button>}
              </div>}
            </div>
            <button type="button" disabled={busy} onClick={() => void follow(publicProfile.id, !publicProfile.isFollowing)} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-[#FF5738]/65 bg-gradient-to-r from-[#7c2d26]/90 to-[#4a2026]/90 px-2.5 py-1.5 text-[10px] font-bold text-[#ff987d] shadow-[0_0_12px_rgba(255,87,56,.16)] disabled:opacity-50">
              <Users className="h-3.5 w-3.5" />
              {publicProfile.isFollowing ? "Вы подписаны" : "Подписаться"}
            </button>
          </div>
        </div>
        <div className="space-y-2.5 px-3 pb-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-[#202127] px-2.5 py-2.5">
              <img src={"/images/yubera/" + levelAssets[publicProfile.xp.level - 1]} alt="" className="h-10 w-10 shrink-0 object-contain" />
              <span className="min-w-0">
                <b className="block break-words text-[12px] font-bold leading-tight text-white">{publicProfile.xp.title}</b>
                <span className="mt-1 block text-[10px] leading-tight text-white/60">Уровень {publicProfile.xp.level}</span>
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-[#202127] px-2.5 py-2.5">
              {publicProfile.support.asset
                ? <img src={"/images/yubera/" + publicProfile.support.asset} alt="" className="h-10 w-10 shrink-0 object-contain" />
                : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FF5738]/15 text-[#FF704F]"><Star className="h-5 w-5" /></span>}
              <span className="min-w-0">
                <b className="block break-words text-[12px] font-bold leading-tight text-white">{publicProfile.support.title}</b>
                <span className="mt-1 block text-[10px] leading-tight text-white/60">Статус поддержки</span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 rounded-[18px] border border-white/10 bg-black/20 text-center">
            <div className="min-w-0 px-1 py-2"><b className="block text-xl leading-none text-white">{publicProfile.publicCollections}</b><span className="mt-1 block text-[10px] leading-tight text-white/60">Подборок</span></div>
            <div className="min-w-0 px-1 py-2"><b className="block text-xl leading-none text-white">{publicProfile.publicTitles}</b><span className="mt-1 block text-[10px] leading-tight text-white/60">Аниме в подборках</span></div>
            <div className="min-w-0 px-1 py-2"><b className="block text-xl leading-none text-white">{publicProfile.collectionLikes}</b><span className="mt-1 block text-[10px] leading-tight text-white/60">Лайков</span></div>
          </div>
        </div>
      </Card>
      <Card className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div><h4 className="font-semibold">Публичные подборки</h4><p className="text-xs text-white/45">Подборки, доступные всем пользователям</p></div>
          {publicCollections.length > 4 && <button type="button" onClick={() => changeScreen("public-collections")} className="shrink-0 text-xs text-[#FF5738]">Все подборки <ChevronRight className="inline h-3 w-3" /></button>}
        </div>
        {publicCollections.length ? publicCollections.slice(0, 4).map(publicCollectionRow) : <p className="py-4 text-center text-sm text-white/45">Публичных подборок пока нет</p>}
      </Card>
    </>}
    {screen === "public-collections" && publicProfile && <>
      <Header title="Публичные подборки" subtitle={"Подборки пользователя " + publicProfile.displayName} />
      <Card>{publicCollections.length ? publicCollections.map(publicCollectionRow) : <p className="py-4 text-center text-sm text-white/45">Публичных подборок пока нет</p>}</Card>
    </>}
    {discardProfileOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="discard-profile-title"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#202127] p-5"><h3 id="discard-profile-title" className="text-lg font-bold">Отменить изменения профиля?</h3><p className="mt-2 text-sm text-white/60">Описание, видимость и выбранная рамка не будут сохранены.</p><div className="mt-5 flex gap-2"><button type="button" onClick={()=>setDiscardProfileOpen(false)} className="flex-1 rounded-xl bg-white/10 py-3">Продолжить</button><button type="button" onClick={confirmDiscardProfileEdit} className="flex-1 rounded-xl bg-[#FF5738] py-3 font-semibold text-black">Отменить</button></div></div></div>}
    {discardCollectionOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="discard-collection-title"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#202127] p-5"><h3 id="discard-collection-title" className="text-lg font-bold">Отменить изменения?</h3><p className="mt-2 text-sm text-white/60">Введённые данные и выбранные параметры не сохранятся.</p><div className="mt-5 flex gap-2"><button type="button" onClick={()=>setDiscardCollectionOpen(false)} className="flex-1 rounded-xl bg-white/10 py-3">Продолжить</button><button type="button" onClick={confirmDiscardCollectionForm} className="flex-1 rounded-xl bg-[#FF5738] py-3 font-semibold text-black">Отменить</button></div></div></div>}
    {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#202127] p-5"><h3 className="text-lg font-bold">Удалить подборку?</h3><p className="mt-2 text-sm text-white/60">«{deleteTarget.title}» будет удалена. Тайтлы каталога и другие подборки не изменятся.</p><div className="mt-5 flex gap-2"><button onClick={()=>setDeleteTarget(null)} className="flex-1 rounded-xl bg-white/10 py-3">Отмена</button><button onClick={()=>{const target=deleteTarget;setDeleteTarget(null);void collectionAction({action:"collection.delete",id:target.id});}} className="flex-1 rounded-xl bg-red-500/90 py-3 font-semibold">Удалить</button></div></div></div>}
    <TelegramStarsDonation open={donationOpen} onClose={()=>setDonationOpen(false)}/>
  </div>;
}
