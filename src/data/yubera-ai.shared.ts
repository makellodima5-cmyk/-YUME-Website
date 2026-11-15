export const YUBERA_AI_DAILY_QUESTION_LIMIT = 20;
export const YUBERA_AI_MESSAGE_MAX_CHARS = 1200;
export const YUBERA_AI_REPLY_MAX_TOKENS = 560;
export const YUBERA_AI_CONTEXT_MESSAGES = 6;
export const YUBERA_AI_MODEL_IDS = ["mistralai/mistral-large-2512", "mistralai/mistral-medium-3.5", "cohere/command-a-plus"] as const;
export type YuberaAiModelId = (typeof YUBERA_AI_MODEL_IDS)[number];
export type YuberaAiRecommendation = {
  id: string; title: string; posterUrl: string | null; ageRating: string | null;
  year: number; rating: number | null; genres: string[]; reason: string;
};
export type YuberaAiMessage = {
  id: string; role: "user" | "assistant"; content: string;
  recommendations: YuberaAiRecommendation[]; createdAt: string;
};
export type YuberaAiConversation = {
  id: string; title: string; updatedAt: string; messages: YuberaAiMessage[];
};
export function getYuberaAiModelId(value: unknown): YuberaAiModelId | null {
  return typeof value === "string" && (YUBERA_AI_MODEL_IDS as readonly string[]).includes(value)
    ? value as YuberaAiModelId : null;
}

const DOMAIN_TERMS = /аниме|тайтл|титл|мультфильм|манг(?:а|и|у|ой)?|shikimori|yubera|юбер|каталог|подборк|сер(?:ия|ии|ий|и)|эпизод|озвуч|сезон|жанр|персонаж|сюжет|студи[яи]|режисс|анимац|премьера|онгоинг|анонс|плеер|просмотр|избран|смотреть позже|подписк|plus|плюс|профил|функци|возможност|раздел|сайт|проект|сервис|аккаунт|пользоват|лимит|чат|бот|помощник|оплат|тариф|доступ|поддержк|настройк|поиск|описани|постер|рейтинг|оценк|фильтр|коллекци|подборк|новинк|популярн|anime|manga/i;
const OFF_TOPIC_TERMS = /населени[ея]|погод[аы]|курс валют|программир|написать код|python|javascript|рецепт|политик|выборы|криптовалют|акции на бирже|реши уравнени|домашн(яя|юю) работ|курсов(ая|ую)|переведи текст|translate this|write an essay|сделай сайт|создай приложение|population|weather|stock market|politic|election|recipe|solve an equation|write code|build a website/i;
const QUICK_WATCH_PROMPT = /^(?:что посмотреть сегодня|что глянуть сегодня|выбери аниме на сегодня)[?!.,\s]*$/i;
const FOLLOW_UP = /^(?:а\s+)?(?:почему|зачем|как именно|подробнее|расскажи подробнее|а он|а она|а этот|а эта|а это|а какие|а какой|а сколько|а есть|можешь подробнее|продолжи|и что дальше|что насчет этого|почему именно|what about|tell me more|why is that|and what about)(?:\s|[?!.,]|$)/i;

export function isAllowedYuberaAiTopic(value: string, previousContext = ""): boolean {
  const text = value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
  if (text.length < 2 || OFF_TOPIC_TERMS.test(text)) return false;
  if (DOMAIN_TERMS.test(text) || QUICK_WATCH_PROMPT.test(text)) return true;
  const context = previousContext.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  return text.length <= 100 && FOLLOW_UP.test(text) && DOMAIN_TERMS.test(context);
}

export function sanitizeAiRecommendations(value: unknown): Array<{ id: string; reason: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(), result: Array<{ id: string; reason: string }> = [];
  for (const candidate of value.slice(0, 8)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^(?:\d{1,20}|wa-cinema-\d{1,12})$/.test(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ id: item.id, reason: typeof item.reason === "string" ? item.reason.replace(/[<>]/g, "").slice(0, 280) : "" });
  }
  return result;
}
