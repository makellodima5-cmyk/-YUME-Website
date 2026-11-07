export type YuberaNewsArticle = {
  id: number;
  title: string;
  summary: string;
  createdAt: string;
  commentsCount: number;
  authorName: string;
  linkedTitle: string | null;
  category: "ANNOUNCEMENTS" | "NEW_SEASONS" | "INDUSTRY" | "EVENTS" | "INTERVIEWS";
  sourceUrl: string;
  sourceName: "Shikimori";
};
