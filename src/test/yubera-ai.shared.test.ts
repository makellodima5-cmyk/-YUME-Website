import { describe, expect, it } from "vitest";
import { getYuberaAiModelId, isAllowedYuberaAiTopic, sanitizeAiRecommendations } from "@/data/yubera-ai.shared";
describe("YUBERA AI topic restrictions",()=>{
 it("allows anime and public YUBERA questions",()=>{
  for(const query of ["Порекомендуй мне аниме","Что посмотреть сегодня?","Расскажи о проекте YUBERA","Какие жанры есть в каталоге?","Как добавить тайтл в избранное?","Расскажи интересный факт об аниме","What anime should I watch?","Tell me about Yubera"])expect(isAllowedYuberaAiTopic(query)).toBe(true);
 });
 it("rejects unrelated requests before provider calls",()=>{
  for(const query of ["Сколько людей живёт на Земле?","Напиши программу на Python","Какая погода сегодня?","Реши квадратное уравнение","Расскажи о выборах","Напиши рецепт борща","Кто такой Альберт Эйнштейн?","Расскажи историю Японии","How do I fix a bicycle?"])expect(isAllowedYuberaAiTopic(query)).toBe(false);
 });
 it("allows only short contextual follow-ups after an anime/YUBERA exchange",()=>{
  expect(isAllowedYuberaAiTopic("А почему?", "Порекомендуй мне аниме из каталога YUBERA.")).toBe(true);
  expect(isAllowedYuberaAiTopic("Tell me more", "This anime has a strong mystery plot.")).toBe(true);
  expect(isAllowedYuberaAiTopic("Кто такой Альберт Эйнштейн?", "Порекомендуй мне аниме.")).toBe(false);
  expect(isAllowedYuberaAiTopic("А сколько население Земли?", "Расскажи об аниме.")).toBe(false);
 });
});
describe("YUBERA AI provider and recommendation validation",()=>{
 it("allows only the three configured Xkiro models",()=>{
  expect(getYuberaAiModelId("mistralai/mistral-large-2512")).toBe("mistralai/mistral-large-2512");
  expect(getYuberaAiModelId("mistralai/mistral-medium-3.5")).toBe("mistralai/mistral-medium-3.5");
  expect(getYuberaAiModelId("cohere/command-a-plus")).toBe("cohere/command-a-plus");
  expect(getYuberaAiModelId("unknown/model")).toBeNull();
 });
 it("accepts only real-looking unique catalog IDs and sanitizes reasons",()=>{
  expect(sanitizeAiRecommendations([{id:"123",reason:"similar"},{id:"wa-cinema-73880",reason:"genre"},{id:"123",reason:"duplicate"},{id:"../secret",reason:"bad"},{id:"456",reason:"<script>"}])).toEqual([{id:"123",reason:"similar"},{id:"wa-cinema-73880",reason:"genre"},{id:"456",reason:"script"}]);
 });
});
