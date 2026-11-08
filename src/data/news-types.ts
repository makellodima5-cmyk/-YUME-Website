export type YuberaNewsArticle = {
  id: number;
  title: string;
  summary: string;
  createdAt: string;
  authorName: string;
  linkedTitle: string | null;
  linkedId: number | null;
  linkedType: string | null;
  category: "ANNOUNCEMENTS" | "NEW_SEASONS" | "INDUSTRY" | "EVENTS" | "INTERVIEWS";
  sourceUrl: string;
  sourceName: "Shikimori";
};

export type YuberaNewsArticleDetails = {
  id: number;
  bodyHtml: string;
  bodyText: string;
  youtubeVideoId: string | null;
  youtubeEmbedInBody: boolean;
};
