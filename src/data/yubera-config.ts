export const YUBERA_XP_REWARDS = {
  firstAnimeRating: 10,
  collectionTitleAdded: 2,
  collectionThreeTitleMilestone: 15,
  episodeNinetyPercent: 5,
} as const;

export const YUBERA_XP_LEVELS = [
  { level: 1, title: "Начинающий зритель", min: 0, max: 49 },
  { level: 2, title: "Любитель аниме", min: 50, max: 149 },
  { level: 3, title: "Искатель историй", min: 150, max: 299 },
  { level: 4, title: "Исследователь миров", min: 300, max: 499 },
  { level: 5, title: "Коллекционер", min: 500, max: 749 },
  { level: 6, title: "Знаток аниме", min: 750, max: 999 },
  { level: 7, title: "Хранитель историй", min: 1000, max: 1499 },
  { level: 8, title: "Мастер YUBERA", min: 1500, max: 2199 },
  { level: 9, title: "Архивариус YUBERA", min: 2200, max: 3199 },
  { level: 10, title: "Легенда YUBERA", min: 3200, max: null },
] as const;

export const YUBERA_SUPPORT_LEVELS = [
  { level: 0, title: "Без статуса", min: 0, asset: null },
  { level: 1, title: "Союзник", min: 50, asset: "YUBERA_Support_Status_Level_01_Soyuznik.webp" },
  { level: 2, title: "Сторонник", min: 1000, asset: "YUBERA_Support_Status_Level_02_Storonnik.webp" },
  { level: 3, title: "Преданный участник", min: 2500, asset: "YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp" },
  { level: 4, title: "Почётный покровитель", min: 5000, asset: "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp" },
  { level: 5, title: "Легенда YUBERA", min: 10000, asset: "YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp" },
] as const;
