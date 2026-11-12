import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Check, ChevronRight, Crown, Heart, Layers3, LockKeyhole, Pencil, Pin, Plus, Search, ShieldCheck, Sparkles, Star, Trash2, Users, X } from "lucide-react";
import { TelegramStarsDonation } from "./TelegramStarsDonation";
import type { Anime } from "@/data/anime";

type Screen = "home" | "edit" | "collections" | "create" | "edit-collection" | "friends" | "level" | "support-status" | "plus" | "public-profile";
type ProfileData = {
  id: string; displayName: string; username: string | null; photoUrl: string | null; bio: string;
  avatarFrame: string | null; visibility: "public" | "private"; isPlus: boolean;
  followers: number; following: number; publicCollections: number; publicTitles: number; collectionLikes: number;
  xp: { total?: number; level: number; title: string; nextLevel?: number | null; nextTitle?: string | null; nextThreshold?: number | null; progress?: number; remaining?: number };
  support: { level: number; title: string; asset: string | null; total?: number; nextThreshold?: number | null; progress?: number; remaining?: number };
};
type Collection = { id: string; title: string; description: string; cover_key: string | null; is_public: number; is_pinned: number; title_count: number; like_count: number; liked: number };
type Props = { animeList: Anime[]; onSelect: (anime: Anime) => void; onBack: () => void };

const covers = [
  "YUBERA_Collection_Cover_Action.webp",
  "YUBERA_Collection_Cover_Adventure_Fantasy.webp",
  "YUBERA_Collection_Cover_Romance.webp",
  "YUBERA_Collection_Cover_Slice_of_Life.webp",
  "YUBERA_Collection_Cover_Thriller_Mystery.webp",
];
const levelAssets = ["YUBERA_Level_01_Option_A.webp","YUBERA_Level_02.webp","YUBERA_Level_03.webp","YUBERA_Level_04.webp","YUBERA_Level_05_Transparent.webp","YUBERA_Level_06.webp","YUBERA_Level_07_Transparent.webp","YUBERA_Level_08_Transparent.webp","YUBERA_Level_09_Transparent.webp","YUBERA_Level_10_New_Design.webp"];\nconst levels = [
  ["Начинающий зритель", "0–49 XP"], ["Любитель аниме", "50–149 XP"], ["Искатель историй", "150–299 XP"],
  ["Исследователь миров", "300–499 XP"], ["Коллекционер", "500–749 XP"], ["Знаток аниме", "750–999 XP"],
  ["Хранитель историй", "1 000–1 499 XP"], ["Мастер YUBERA", "1 500–2 199 XP"],
  ["Архивариус YUBERA", "2 200–3 199 XP"], ["Легенда YUBERA", "3 200+ XP"],
];
const supportLevels = [
  ["Союзник", "50 ⭐", "YUBERA_Support_Status_Level_01_Soyuznik.webp"],
  ["Сторонник", "1 000 ⭐", "YUBERA_Support_Status_Level_02_Storonnik.webp"],
  ["Преданный участник", "2 500 ⭐", "YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp"],
  ["Почётный покровитель", "5 000 ⭐", "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp"],
  ["Легенда YUBERA", "10 000 ⭐", "YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp"],
];

export function YuberaProfileHub({ animeList, onSelect, onBack }: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [frame, setFrame] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(covers[0]);
  const [isPublic, setIsPublic] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);\n  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Array<{id:string;telegram_first_name:string;telegram_last_name?:string|null;telegram_username?:string|null;telegram_photo_url?:string|null}>>([]);
  const [publicProfile, setPublicProfile] = useState<ProfileData | null>(null);
  const [donationOpen, setDonationOpen] = useState(false);

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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const request = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/yubera/community", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить действие");
      return data;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка запроса"); return null; }
    finally { setBusy(false); }
  };
  const changeScreen = (next: Screen) => { setMenuId(null); setError(""); setScreen(next); window.scrollTo({ top: 0, behavior: "auto" }); };
  const orderedCollections = useMemo(() => [...collections].sort((a,b) => Number(b.is_pinned)-Number(a.is_pinned)), [collections]);
  const pinned = orderedCollections.filter(item => item.is_pinned);
  const rest = orderedCollections.filter(item => !item.is_pinned);

  const searchPeople = async (query: string) => {
    setSearch(query);
    try {
      const action = query.trim() ? "friends" : "recommendations";
      const response = await fetch(`/api/yubera/community?action=${action}${query.trim() ? `&q=${encodeURIComponent(query)}` : ""}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      setPeople(Array.isArray(data.users) ? data.users : []);
    } catch { setPeople([]); }
  };
  useEffect(() => { if (screen === "friends") void searchPeople(""); }, [screen]);

  const viewPublicProfile = async (id: string) => {
    try {
      const response = await fetch(`/api/yubera/community?action=profile&userId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Профиль недоступен");
      setPublicProfile(data.profile); changeScreen("public-profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Профиль недоступен"); }
  };
  const follow = async (id: string, following: boolean) => {
    const result = await request({ action: "follow", userId: id, following });
    if (result) await load();
  };
  const saveProfile = async () => {
    const result = await request({ action: "profile.update", bio, visibility, avatarFrame: frame });
    if (result) { await load(); changeScreen("home"); }
  };
  const createCollection = async () => {
    const result = await request({ action: editingCollectionId ? "collection.update" : "collection.create", ...(editingCollectionId ? { id: editingCollectionId } : {}), title, description, coverKey: cover, isPublic });
    if (result) { setTitle(""); setDescription(""); setCover(covers[0]); setEditingCollectionId(null); await load(); changeScreen("collections"); }
  };
  const collectionAction = async (body: Record<string, unknown>) => {
    const result = await request(body);
    if (result) { setMenuId(null); await load(); }
  };

  const Header = ({ title: heading, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-5 flex items-center gap-3">
      <button type="button" onClick={() => screen === "home" ? onBack() : changeScreen("home")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white" aria-label="Назад"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0"><h2 className="text-xl font-bold text-white">{heading}</h2>{subtitle && <p className="text-sm text-white/55">{subtitle}</p>}</div>
    </div>
  );
  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`rounded-2xl border border-white/10 bg-[#17181e] p-4 ${className}`}>{children}</section>;
  const Action = ({ icon, label, onClick, detail }: { icon: React.ReactNode; label: string; onClick: () => void; detail?: string }) => (
    <button type="button" onClick={onClick} className="flex min-h-[66px] w-full items-center gap-3 border-b border-white/5 py-3 text-left last:border-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff6848]/10 text-[#ff7957]">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-white">{label}</span>{detail && <span className="block text-xs text-white/50">{detail}</span>}</span>
      <ChevronRight className="h-4 w-4 text-white/40" />
    </button>
  );
  const avatar = (p: ProfileData | null) => (
    <div className="relative h-[88px] w-[88px] shrink-0 rounded-full border-2 border-[#ff704f] bg-[#252630] p-1">
      {p?.photoUrl ? <img src={p.photoUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <div className="grid h-full w-full place-items-center rounded-full text-2xl text-white/50"><Users /></div>}
      {p?.avatarFrame && <img src={`/images/yubera/${p.avatarFrame}`} alt="" className="pointer-events-none absolute -inset-2 h-[104px] w-[104px] max-w-none" />}
    </div>
  );
  const collectionRow = (item: Collection) => (
    <div key={item.id} className="relative flex items-center gap-3 border-b border-white/5 py-3 last:border-0">
      <button type="button" onClick={() => { void fetch(`/api/yubera/community?action=collection&id=${item.id}`).then(r=>r.json()).then(data=>{ const ids=(data.items||[]).map((x:{anime_id:string})=>x.anime_id); const anime=animeList.find(x=>x.id===ids[0]); if(anime) onSelect(anime); }); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5">{item.cover_key && <img src={`/images/yubera/${item.cover_key}`} alt="" className="h-full w-full object-cover" />}{Boolean(item.is_pinned) && <span className="absolute left-1 top-1 rounded-full bg-[#ff704f] p-1 text-black"><Pin className="h-3 w-3" /></span>}</div>
        <span className="min-w-0"><span className="block truncate font-semibold text-white">{item.title}</span><span className="text-xs text-white/50">{item.title_count} тайтлов · {item.like_count} лайков</span></span>
      </button>
      <button type="button" onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-white/70" aria-label="Действия подборки">•••</button>
      {menuId === item.id && <div className="absolute right-10 top-12 z-20 w-48 rounded-xl border border-white/15 bg-[#202127] p-1 shadow-2xl">
        <button onClick={() => void collectionAction({action:"collection.pin",id:item.id,pinned:!item.is_pinned})} className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/5">{item.is_pinned ? "Открепить" : "Закрепить"}</button>
        <button onClick={() => {setTitle(item.title);setDescription(item.description);setIsPublic(Boolean(item.is_public));setEditingCollectionId(item.id);setMenuId(null);changeScreen("edit-collection");}} className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/5">Редактировать</button>
        <button onClick={() => {setDeleteTarget(item);setMenuId(null);}} className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#ff7658] hover:bg-white/5">Удалить</button>
      </div>}
    </div>
  );

  if (!profile) return <div className="mx-auto max-w-3xl px-4 py-8 text-white"><Header title="YUBERA" />{error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <div className="animate-pulse space-y-3"><div className="h-28 rounded-2xl bg-white/5"/><div className="h-20 rounded-2xl bg-white/5"/></div>}</div>;

  return <div className="mx-auto max-w-3xl px-4 pb-28 pt-5 text-white">
    <div className="mb-5 flex items-center justify-between"><button onClick={() => screen === "home" ? onBack() : changeScreen("home")} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80"><ArrowLeft className="mr-2 inline h-4 w-4"/>Назад</button><div className="font-black tracking-[.18em] text-white"><span className="text-[#ff704f]">◆</span> YUBERA</div><span className="w-16"/></div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
    {screen === "home" && <>
      <Card className="overflow-hidden p-0">
        <div className="relative h-32 overflow-hidden"><img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover opacity-70"/><div className="absolute inset-0 bg-gradient-to-t from-[#17181e] to-transparent"/></div>
        <div className="flex items-start gap-4 px-4 pb-4">{avatar(profile)}<div className="min-w-0 flex-1 pt-1"><p className="text-[10px] font-bold tracking-widest text-[#ff7957]">ЛИЧНОЕ ПРОСТРАНСТВО</p><h2 className="mt-1 truncate text-xl font-bold">{profile.displayName}</h2><p className="text-sm text-white/50">{profile.username ? `@${profile.username}` : "YUBERA"}</p><p className="mt-2 text-sm text-white/65">{profile.bio}</p></div><button onClick={()=>changeScreen("edit")} className="rounded-xl bg-white/5 p-2 text-white/70" aria-label="Редактировать профиль"><Pencil className="h-4 w-4"/></button></div>
      </Card>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button onClick={()=>changeScreen("level")} className="rounded-2xl border border-white/10 bg-[#17181e] p-3 text-left"><img src={`/images/yubera/${levelAssets[profile.xp.level - 1]}`} alt="" className="mb-2 h-16 w-16 object-contain"/><b>Уровень {profile.xp.level}</b><p className="text-xs text-white/55">{profile.xp.title}</p><p className="mt-1 text-xs text-white/50">{profile.xp.total ?? 0} XP</p></button>
        <button onClick={()=>changeScreen("support-status")} className="rounded-2xl border border-white/10 bg-[#17181e] p-3 text-left"><img src={profile.support.asset ? `/images/yubera/${profile.support.asset}` : "/images/yubera/YUBERA_Support_Status_Level_01_Soyuznik.webp"} alt="" className="mb-2 h-16 w-16 object-contain"/><b>Поддержка</b><p className="text-xs text-white/55">{profile.support.title}</p></button>
      </div>
      <Card className="mt-3"><Action icon={<Users/>} label="Друзья" detail={`${profile.followers} подписчиков · ${profile.following} подписок`} onClick={()=>changeScreen("friends")}/><Action icon={<Layers3/>} label="Мои подборки" detail={`${collections.length} подборок`} onClick={()=>changeScreen("collections")}/><Action icon={<Heart/>} label="Поддержать проект" onClick={()=>changeScreen("support-status")}/><Action icon={<Crown/>} label="YUBERA Plus" detail={profile.isPlus ? "Подписка активна" : "Дополнительные возможности"} onClick={()=>changeScreen("plus")}/></Card>
    </>}
    {screen === "edit" && <><Header title="Редактирование профиля" subtitle="Настройте описание, видимость и оформление профиля"/><Card><div className="mb-4 flex items-center gap-3">{avatar(profile)}<div><b>{profile.displayName}</b><p className="text-sm text-white/50">@{profile.username || "username"}</p></div></div><label className="mb-2 block text-sm font-semibold">Видимость профиля</label><div className="grid grid-cols-2 gap-2"><button onClick={()=>setVisibility("public")} className={`rounded-xl border p-3 text-sm ${visibility==="public"?"border-[#ff7658] bg-[#ff7658]/10":"border-white/10 bg-white/5"}`}>Публичный</button><button onClick={()=>setVisibility("private")} className={`rounded-xl border p-3 text-sm ${visibility==="private"?"border-[#ff7658] bg-[#ff7658]/10":"border-white/10 bg-white/5"}`}>Приватный</button></div><label className="mb-2 mt-4 block text-sm font-semibold">Описание профиля</label><textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={500} rows={4} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#ff7658]" placeholder="Расскажите о себе"/><div className="mt-1 text-right text-xs text-white/40">{bio.length}/500</div><label className="mb-3 mt-5 block text-sm font-semibold">Рамка аватара · YUBERA Plus</label><div className="grid grid-cols-3 gap-2">{["YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp","YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp","YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp","YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp","YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp"].map(f=><button key={f} onClick={()=>setFrame(frame===f?null:f)} className={`rounded-xl border p-2 ${frame===f?"border-[#ff7658]":"border-white/10"}`}><img src={`/images/yubera/${f}`} alt="" className="mx-auto h-16 w-16 object-contain"/><span className="text-[10px] text-white/55">{frame===f?"Выбрано":"Plus"}</span></button>)}</div><button disabled={busy} onClick={()=>void saveProfile()} className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#ff5d42] to-[#ff8058] py-3 font-semibold disabled:opacity-50">Сохранить</button></Card></>}
    {screen === "collections" && <><Header title="Мои подборки" subtitle="Ваши личные подборки аниме"/>{pinned.length>0 && <Card className="mb-3"><h3 className="mb-2 font-semibold"><Pin className="mr-2 inline h-4 w-4 text-[#ff7658]"/>Закреплённые подборки <span className="float-right rounded-full bg-white/10 px-2 text-xs">{pinned.length}</span></h3>{pinned.map(collectionRow)}</Card>}<Card className="mb-4"><h3 className="mb-2 font-semibold"><Layers3 className="mr-2 inline h-4 w-4 text-[#ff7658]"/>Остальные подборки <span className="float-right rounded-full bg-white/10 px-2 text-xs">{rest.length}</span></h3>{rest.length?rest.map(collectionRow):<p className="py-4 text-center text-sm text-white/45">Пока нет подборок</p>}</Card><button onClick={()=>changeScreen("create")} className="w-full rounded-2xl border border-dashed border-white/30 py-4 font-semibold"><Plus className="mr-2 inline h-5 w-5"/>Создать подборку</button></>}
    {(screen === "create" || screen === "edit-collection") && <><Header title={screen === "edit-collection" ? "Редактировать подборку" : "Создать подборку"} subtitle="Соберите аниме в одном месте"/><Card><label className="mb-2 block text-sm font-semibold">Название</label><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={50} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm" placeholder="Например, Любимое"/><div className="mt-1 text-right text-xs text-white/40">{title.length}/50</div><label className="mb-2 mt-4 block text-sm font-semibold">Описание</label><textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={250} rows={3} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm" placeholder="Необязательно"/><label className="mb-3 mt-4 block text-sm font-semibold">Обложка</label><div className="grid grid-cols-3 gap-2">{covers.map(c=><button key={c} onClick={()=>setCover(c)} className={`overflow-hidden rounded-xl border ${cover===c?"border-[#ff7658]":"border-white/10"}`}><img src={`/images/yubera/${c}`} alt="" className="h-20 w-full object-cover"/></button>)}</div><label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)}/>Публичная подборка</label><button disabled={busy||!title.trim()} onClick={()=>void createCollection()} className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#ff5d42] to-[#ff8058] py-3 font-semibold disabled:opacity-50">{screen === "edit-collection" ? "Сохранить изменения" : "Создать подборку"}</button></Card></>}
    {screen === "friends" && <><Header title="Друзья" subtitle="Пользователи YUBERA, на которых вы подписаны"/><div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#17181e] px-3"><Search className="h-4 w-4 text-white/40"/><input value={search} onChange={e=>void searchPeople(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Имя или Telegram username"/></div><Card>{people.map(person=><div key={person.id} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"><button onClick={()=>void viewPublicProfile(person.id)} className="min-w-0 flex-1 text-left"><b className="block truncate">{[person.telegram_first_name,person.telegram_last_name].filter(Boolean).join(" ")}</b><span className="text-xs text-white/50">@{person.telegram_username||"user"}</span></button><button onClick={()=>void follow(person.id,true)} className="rounded-lg bg-[#ff7658]/15 px-3 py-2 text-xs font-semibold text-[#ff967e]">Подписаться</button></div>)}{!people.length&&<p className="py-5 text-center text-sm text-white/45">Ничего не найдено</p>}</Card></>}
    {screen === "level" && <><Header title="Уровень пользователя" subtitle="Ваш прогресс и система опыта"/><Card className="text-center"><img src={`/images/yubera/YUBERA_Level_${String(profile.xp.level).padStart(2,"0")}_${profile.xp.level===1?"Option_A":profile.xp.level===5?"Transparent":profile.xp.level===7||profile.xp.level===8||profile.xp.level===9?"Transparent":profile.xp.level===10?"New_Design":""}.webp`} alt="" className="mx-auto h-36 w-36 object-contain"/><p className="text-sm text-white/50">Уровень {profile.xp.level}</p><h3 className="text-2xl font-bold">{profile.xp.title}</h3><p className="mt-2 text-lg font-semibold">{profile.xp.total??0} XP</p>{profile.xp.nextThreshold && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#ff5d42] to-[#ff9a55]" style={{width:`${profile.xp.progress??0}%`}}/></div><p className="mt-2 text-xs text-white/50">До уровня {profile.xp.nextLevel}: осталось {profile.xp.remaining} XP</p></>}</Card><Card className="mt-3"><h3 className="mb-3 font-semibold">Как получить опыт?</h3>{[["Первая оценка аниме","+10 XP"],["Добавление тайтла в подборку","+2 XP"],["Подборка из трёх тайтлов","+15 XP"],["Просмотр 90% серии","+5 XP"]].map(([label,xp])=><div key={label} className="flex justify-between border-b border-white/5 py-3 text-sm last:border-0"><span>{label}</span><b className="text-[#ff9a55]">{xp}</b></div>)}</Card><Card className="mt-3"><h3 className="mb-3 font-semibold">Система уровней YUBERA</h3>{levels.map(([name,range],i)=><div key={name} className={`flex items-center justify-between border-b border-white/5 py-3 text-sm last:border-0 ${profile.xp.level===i+1?"text-[#ff9a55]": "text-white/65"}`}><span>{i+1}. {name}</span><span>{range}</span></div>)}</Card></>}
    {screen === "support-status" && <><Header title="Статус поддержки" subtitle="Ваш вклад в развитие YUBERA"/><Card className="text-center"><img src={profile.support.asset? `/images/yubera/${profile.support.asset}`:"/images/yubera/YUBERA_Support_Status_Level_01_Soyuznik.webp"} alt="" className="mx-auto h-36 w-36 object-contain"/><h3 className="text-2xl font-bold">{profile.support.title}</h3><p className="mt-2 text-sm text-white/55">Статус присваивается за подтверждённую поддержку проекта в Telegram Stars.</p>{typeof profile.support.total === "number" && profile.support.nextThreshold && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#ff5d42] to-[#ff9a55]" style={{width:`${profile.support.progress ?? 0}%`}}/></div><p className="mt-2 text-xs text-white/50">До следующего статуса: {profile.support.remaining} ⭐</p></>}<button onClick={()=>setDonationOpen(true)} className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#ff5d42] to-[#ff8058] py-3 font-semibold">Поддержать проект</button></Card><Card className="mt-3">{supportLevels.map(([name,threshold,asset],i)=><div key={name} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"><img src={`/images/yubera/${asset}`} alt="" className="h-14 w-14 object-contain"/><div className="flex-1"><b>{i+1}. {name}</b><p className="text-xs text-white/50">От {threshold}</p></div>{profile.support.level>=i+1&&<Check className="h-5 w-5 text-emerald-400"/>}</div>)}</Card></>}
    {screen === "plus" && <><Header title="YUBERA Plus" subtitle="Расширенные возможности личного пространства"/><Card className="text-center"><Crown className="mx-auto h-12 w-12 text-[#ffc66d]"/><h3 className="mt-3 text-2xl font-bold">YUBERA Plus</h3><p className="mt-2 text-sm text-white/60">Подписка на 30 дней с добровольным автоматическим продлением.</p><div className="mt-5 space-y-3 text-left"><p><Check className="mr-2 inline h-4 w-4 text-emerald-400"/>До 30 подборок и 300 тайтлов в каждой</p><p><Check className="mr-2 inline h-4 w-4 text-emerald-400"/>Эксклюзивные рамки аватара</p><p><Check className="mr-2 inline h-4 w-4 text-emerald-400"/>Значок YUBERA Plus</p><p className="text-white/50"><Sparkles className="mr-2 inline h-4 w-4"/>AI-помощник — Скоро</p></div><p className="mt-5 rounded-xl bg-white/5 p-3 text-sm">{profile.isPlus?"Подписка активна":"Оформление подписки будет доступно после подключения платёжного сценария."}</p></Card></>}
    {screen === "public-profile" && publicProfile && <><Header title="Профиль пользователя"/><Card><div className="flex items-center gap-4">{avatar(publicProfile)}<div className="min-w-0"><h3 className="text-xl font-bold">{publicProfile.displayName}</h3><p className="text-sm text-white/50">@{publicProfile.username}</p></div></div><p className="mt-4 text-sm text-white/70">{publicProfile.bio}</p><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div><b className="block text-lg">{publicProfile.publicCollections}</b>Подборки</div><div><b className="block text-lg">{publicProfile.publicTitles}</b>Тайтлы</div><div><b className="block text-lg">{publicProfile.collectionLikes}</b>Лайки</div></div><p className="mt-4 text-sm">Уровень {publicProfile.xp.level} · {publicProfile.xp.title}</p><p className="text-sm">Статус поддержки: {publicProfile.support.title}</p><button onClick={()=>void follow(publicProfile.id,!publicProfile.isFollowing)} className="mt-4 w-full rounded-xl bg-[#ff7658] py-3 font-semibold">{publicProfile.isFollowing?"Отписаться":"Подписаться"}</button></Card></>}
    {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#202127] p-5"><h3 className="text-lg font-bold">Удалить подборку?</h3><p className="mt-2 text-sm text-white/60">«{deleteTarget.title}» будет удалена. Тайтлы каталога и другие подборки не изменятся.</p><div className="mt-5 flex gap-2"><button onClick={()=>setDeleteTarget(null)} className="flex-1 rounded-xl bg-white/10 py-3">Отмена</button><button onClick={()=>{const target=deleteTarget;setDeleteTarget(null);void collectionAction({action:"collection.delete",id:target.id});}} className="flex-1 rounded-xl bg-red-500/90 py-3 font-semibold">Удалить</button></div></div></div>}
    <TelegramStarsDonation open={donationOpen} onClose={()=>setDonationOpen(false)}/>
  </div>;
}
