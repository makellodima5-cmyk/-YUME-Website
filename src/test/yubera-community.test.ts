import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

describe("YUBERA community foundation", () => {
  it("declares private profiles, one-way follows, collections and idempotent XP storage", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations-clean/0008_yubera_community_plus.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_profiles");
    expect(sql).toContain("CHECK (visibility IN ('public','private'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_follows");
    expect(sql).toContain("PRIMARY KEY (follower_id, followed_id)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_collections");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_collection_items");
    expect(sql).toContain("event_key TEXT NOT NULL UNIQUE");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_plus_subscriptions");
  });

  it("enforces profile visibility, collection ownership and Free/Plus caps in server handlers", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("profile.visibility !== \"public\"");
    expect(server).toContain("p.visibility = 'public'");
    expect(server).toContain("ownedCollection(database, userId, id)");
    expect(server).toContain("PLUS_COLLECTIONS : FREE_COLLECTIONS");
    expect(server).toContain("PLUS_TITLES : FREE_TITLES");
    expect(server).toContain("titleLimit: ownerPlus ? PLUS_TITLES : FREE_TITLES");
    expect(server).toContain("INSERT OR IGNORE INTO yume_xp_ledger");
    expect(server).toContain("LIMIT 30 OFFSET ?");
    expect(server).toContain("LIMIT 13 OFFSET ?");
    expect(server).toContain("rows.results.slice(0, 12)");
  });

  it("exposes collection detail, catalogue add/remove, public profiles and people discovery in the UI", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const friendsPanel = await readFile(resolve(process.cwd(), "src/components/yume/YuberaFriendsPanel.tsx"), "utf8");
    expect(component).toContain('"collection-detail"');
    expect(component).toContain("Добавить аниме");
    expect(component).toContain("collection.item.add");
    expect(component).toContain("collection.item.remove");
    expect(component).toContain("Публичные подборки");
    expect(component).toContain("YuberaFriendsPanel");
    expect(component).toContain("w-max max-w-none flex-nowrap items-center gap-1 whitespace-nowrap");
    expect(component).toContain("h-6 w-6 shrink-0");
    expect(friendsPanel).toContain("Показать ещё");
    expect(friendsPanel).toContain("Найти друзей");
    expect(friendsPanel).toContain("truncate whitespace-nowrap line-clamp-1");
    expect(friendsPanel).not.toContain("По дате подписки");
    expect(friendsPanel).toContain("bg-neon text-white shadow-neon");
    expect(component).not.toContain("text-black");
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");
    const brandTokens = styles.slice(styles.lastIndexOf("/* One saturated YUBERA orange"));
    expect(brandTokens).toContain("--primary: #FF5738");
    expect(brandTokens).toContain(".yubera-bottom-nav button[aria-current=\"page\"]");
    expect(brandTokens).toContain("color: #FF5738 !important;");
    expect(brandTokens).toContain("--primary-foreground: #FFFFFF");
    expect(brandTokens).toContain("linear-gradient(120deg, #FF5738 0%, #FF704F 100%)");
  });

  it("awards collection XP atomically with unique-add and milestone guards", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("if (!database.batch) return json({ error: \"atomic_xp_batch_unavailable\" }, 503)");
    expect(server).toContain("WHERE changes()=1");
    expect(server).toContain("`collection-add:${id}:${animeId}`");
    expect(server).toContain("`collection-milestone:${id}`");
    expect(server).toContain("WHERE changes()=1 AND (SELECT COUNT(*) FROM yume_collection_items WHERE collection_id=?)=?");
    expect(server).toContain("YUBERA_XP_RULES.collectionMilestoneTitleCount");
  });


  it("recalculates support status from confirmed donations after recorded refunds", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id = d.telegram_payment_charge_id");
    expect(server).toContain("d.status = 'paid' AND r.telegram_payment_charge_id IS NULL");
    expect(server).toContain("progress:");
    expect(server).toContain("remaining:");
  });


  it("hides Plus-only avatar frames when the paid period is no longer active", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("avatarFrame: isSupportFrame(account.profile.avatar_frame) ? account.profile.avatar_frame : plus ? account.profile.avatar_frame : null");
    expect(server).toContain("expires_at > ?");
  });


  it("shows active Plus status in both owner and public profile headers", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain("profile.isPlus && <span");
    expect(component).toContain("publicProfile.isPlus && <span");
    expect(component).toContain(">Plus</span>");
  });


  it("keeps support frames permanently unlocked and restricts Plus frames to active subscribers", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const webhook = await readFile(resolve(process.cwd(), "src/data/telegram-bot.server.ts"), "utf8");
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(server).toContain("yume_support_frame_unlocks WHERE user_id = ?");
    expect(server).toContain("if (frame && isSupportFrame(frame))");
    expect(server).toContain("else if (frame && !plus)");
    expect(server).toContain("availableSupportFrames:");
    expect(webhook).toContain("INSERT OR IGNORE INTO yume_support_frame_unlocks");
    expect(component).toContain("supportFrameOptions");
    expect(component).toContain("plusFrameOptions");
    expect(component).toContain("profile.availableSupportFrames");
  });

  it("uses the approved 250-character profile bio limit and exact level image mapping", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(server).toContain("bio.length > 250");
    expect(component).toContain("maxLength={250}");
    expect(component).toContain("levelAssets[profile.xp.level - 1]");
  });


  it("keeps all supplied YUBERA level, support, Plus-frame and collection-cover assets in the website bundle", async () => {
    const files = new Set(await readdir(resolve(process.cwd(), "public/images/yubera")));
    const required = [
      "YUBERA_Level_01_Option_A.webp","YUBERA_Level_02.webp","YUBERA_Level_03.webp","YUBERA_Level_04.webp","YUBERA_Level_05_Transparent.webp",
      "YUBERA_Level_06.webp","YUBERA_Level_07_Transparent.webp","YUBERA_Level_08_Transparent.webp","YUBERA_Level_09_Transparent.webp","YUBERA_Level_10_New_Design.webp",
      "YUBERA_Support_Status_Level_01_Soyuznik.webp","YUBERA_Support_Status_Level_02_Storonnik.webp","YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp",
      "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp","YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp",
      "YUBERA_Contribution_Avatar_Frame_01_Soyuznik.webp.webp","YUBERA_Contribution_Avatar_Frame_02_Storonnik.webp.webp","YUBERA_Contribution_Avatar_Frame_03_Predanniy_Uchastnik.webp.webp",
      "YUBERA_Contribution_Avatar_Frame_04_Pochetnyy_Pokrovitel.webp","YUBERA_Contribution_Avatar_Frame_05_Legenda_YUBERA.webp",
      "YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp","YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp","YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp",
      "YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp","YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp",
      "YUBERA_Collection_Cover_Action.webp","YUBERA_Collection_Cover_Adventure_Fantasy.webp","YUBERA_Collection_Cover_Romance.webp",
      "YUBERA_Collection_Cover_Slice_of_Life.webp","YUBERA_Collection_Cover_Thriller_Mystery.webp",
    ];
    expect(required.filter(file => !files.has(file))).toEqual([]);
  });


  it("returns owner-only favorites, watchlist and history counts from existing library tables", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(server).toContain("FROM yume_saved_anime WHERE user_id=? AND list_type='favorite'");
    expect(server).toContain("FROM yume_saved_anime WHERE user_id=? AND list_type='watchlist'");
    expect(server).toContain("FROM yume_view_history WHERE user_id=?");
    expect(server).toContain("stats: isOwner ?");
    expect(component).toContain("profile.stats?.favorites");
    expect(component).toContain("profile.stats?.watchlist");
    expect(component).toContain("profile.stats?.history");
  });

  it("keeps donation checkout off the informational support-status screen", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const supportScreen = component.slice(component.indexOf('{screen === "support-status"'), component.indexOf('{screen === "plus"'));
    expect(supportScreen).not.toContain("setDonationOpen(true)");
    expect(component).not.toContain("Аккаунт Telegram");
    expect(component).not.toContain("onSignOut");
    expect(component).not.toContain("onDeleteAccount");
    const profile = await readFile(resolve(process.cwd(), "src/components/yume/Profile.tsx"), "utf8");
    expect(profile).toContain('id="telegram-account"');
    expect(profile).toContain("signOut()");
    expect(profile).toContain("deleteAccount()");
  });


  it("centralizes all XP rewards, ten level thresholds and five support thresholds", async () => {
    const config = await readFile(resolve(process.cwd(), "src/data/yubera-config.ts"), "utf8");
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const webhook = await readFile(resolve(process.cwd(), "src/data/telegram-bot.server.ts"), "utf8");
    for (const reward of ["firstAnimeRating: 10","collectionTitleAdded: 2","collectionThreeTitleMilestone: 15","episodeNinetyPercent: 5","collectionMilestoneTitleCount: 3","episodeCompletionRatio: 0.9"]) expect(config).toContain(reward);
    expect(config).toContain("level: 10, title: \"Легенда YUBERA\", min: 3200");
    expect(config).toContain("level: 5, title: \"Легенда YUBERA\", min: 10000");
    expect(server).toContain("YUBERA_XP_LEVELS");
    expect(server).toContain("YUBERA_SUPPORT_LEVELS");
    expect(webhook).toContain("YUBERA_SUPPORT_LEVELS.filter");
  });

  it("returns public profile card data and total counts for paginated people lists", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const panel = await readFile(resolve(process.cwd(), "src/components/yume/YuberaFriendsPanel.tsx"), "utf8");
    expect(server).toContain("p.bio");
    expect(server).toContain("AS avatar_frame");
    expect(server).toContain("return json({ users: rows.results, total: count, hasMore: offset + rows.results.length < count })");
    expect(server).toContain("p.visibility = 'public'");
    expect(panel).not.toContain("По дате подписки");
    expect(panel).toContain("Мои подписчики");
    expect(panel).toContain("direction=followers");
    expect(panel).toContain("UserRound");
    expect(panel).toContain("followingTotal");
    expect(panel).toContain("Поиск по нику или @username");
    expect(panel).toContain("Показать ещё");
  });

  it("debounces user search and discards stale responses", async () => {
    const panel = await readFile(resolve(process.cwd(), "src/components/yume/YuberaFriendsPanel.tsx"), "utf8");
    expect(panel).toContain("window.setTimeout");
    expect(panel).toContain("}, 280)");
    expect(panel).toContain("searchRequestId.current");
    expect(panel).toContain("setSearchResults([])");
  });

  it("does not expose expired Plus avatar frames in people discovery", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("p.avatar_frame LIKE 'YUBERA_Plus_Avatar_Frame_%'");
    expect(server).toContain("s.status='active' AND s.expires_at > ?");
    expect(server).toContain("ELSE NULL END AS avatar_frame");
  });

  it("keeps the stage 3 friends panel wired to the existing community API", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain('import { YuberaFriendsPanel } from "./YuberaFriendsPanel"');
    expect(component).toContain("onOpenProfile={(id) => void viewPublicProfile(id)}");
    expect(component).toContain("onFollowChange={load}");
  });

  it("renders public profiles with public-only counters and read-only collection details", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const publicStart = component.indexOf('{screen === "public-profile"');
    const publicEnd = component.indexOf('{screen === "public-collections"', publicStart);
    const publicView = component.slice(publicStart, publicEnd);
    expect(publicView).toContain("yubera_banner.webp");
    expect(publicView).toContain("publicProfile.publicCollections");
    expect(publicView).toContain("publicProfile.publicTitles");
    expect(publicView).toContain("publicProfile.collectionLikes");
    expect(publicView).toContain("Читать полностью");
    expect(publicView).toContain("whitespace-nowrap");
    expect(publicView).toContain("publicCollections.slice(0, 4)");
    expect(publicView).not.toContain("publicProfile.xp.total");
    expect(component).toContain("activeCollectionIsOwner &&");
    expect(component).toContain("activeCollectionTitleLimit");
    expect(component).toContain("data.titleLimit");
    expect(component).toContain("likeBusyCollectionId");
    expect(server).toContain("row.owner_id !== userId && (row.visibility !== \"public\" || Number(row.is_public) !== 1)");
  });

  it("returns to the originating screen after viewing a public profile", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain("setPublicProfileReturnScreen(screen)");
    expect(component).toContain("changeScreen(publicProfileReturnScreen)");
    expect(component).toContain("setCollectionReturnScreen(screen)");
    expect(component).toContain("changeScreen(collectionReturnScreen)");
  });

  it("matches the approved collection creation defaults and visibility choices", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const formStart = component.indexOf('{(screen === "create" || screen === "edit-collection")');
    const formEnd = component.indexOf('{screen === "friends"', formStart);
    const form = component.slice(formStart, formEnd);
    expect(component).toContain('useState<string | null>(null)');
    expect(component).toContain('useState(true)');
    expect(form).toContain("title.length} / 50");
    expect(form).toContain("maxLength={50}");
    expect(form).toContain("maxLength={250}");
    expect(form).toContain("description.length} / 250");
    expect(form).toContain("aria-pressed={isPublic}");
    expect(form).toContain("Доступна всем пользователям");
    expect(form).toContain("Видна только вам");
    expect(form).toContain("Отменить");
    expect(form).not.toContain('type="file"');
    expect(form).not.toContain("Добавить аниме");
  });

  it("asks before discarding modified collection forms and preserves the entry screen", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain("collectionFormReturnScreen");
    expect(component).toContain("const cancelCollectionForm = () =>");
    expect(component).toContain("if (dirty) setDiscardCollectionOpen(true)");
    expect(component).toContain("confirmDiscardCollectionForm");
    expect(component).toContain("Введённые данные и выбранные параметры не сохранятся.");
  });

  it("uses only existing collection cover assets and leaves the cover unselected by default", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const tree = await readFile(resolve(process.cwd(), "docs/superpowers/plans/2026-11-12-yubera-stage-3-plan.md"), "utf8");
    expect(component).toContain('const [cover, setCover] = useState<string | null>(null)');
    expect(component).toContain("const initial = { title: \"\", description: \"\", cover: null, isPublic: true");
    expect(component).toContain("covers.map(asset");
    expect(tree).toContain("Stage 3 scope");
  });

  it("confirms profile-edit discard through both back and cancel paths", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain("type ProfileFormSnapshot");
    expect(component).toContain("const cancelProfileEdit = () =>");
    expect(component).toContain("bio !== profileFormInitial.bio");
    expect(component).toContain('else if (screen === "edit") cancelProfileEdit()');
    expect(component).toContain("onClick={cancelProfileEdit}");
    expect(component).toContain("Отменить изменения профиля?");
    expect(component).toContain("confirmDiscardProfileEdit");
  });

  it("presents public and closed profile visibility with server-save semantics", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    const editStart = component.indexOf('screen === "edit" &&');
    const editEnd = component.indexOf('(screen === "create" || screen === "edit-collection")', editStart);
    const edit = component.slice(editStart, editEnd);
    expect(edit).toContain("Доступен в поиске и открыт для всех");
    expect(edit).toContain("Не отображается в поиске и недоступен для общего доступа");
    expect(edit).toContain('setVisibility("public")');
    expect(edit).toContain('setVisibility("private")');
    expect(edit).toContain("Аватар и никнейм берутся из Telegram");
    expect(edit).toContain("maxLength={250}");
  });

  it("keeps recommendation pagination shuffled but stable within one screen session", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    const panel = await readFile(resolve(process.cwd(), "src/components/yume/YuberaFriendsPanel.tsx"), "utf8");
    expect(server).toContain("url.searchParams.get(\"seed\")");
    expect(server).toContain("ORDER BY abs((CAST(substr(u.id, -8) AS INTEGER) * 1103515245 + ?) % 2147483647)");
    expect(server).toContain("LIMIT 13 OFFSET ?");
    expect(server).toContain("hasMore: rows.results.length > 12");
    expect(panel).toContain("recommendationSeed");
    expect(panel).toContain("&seed=${recommendationSeed}");
  });

});
