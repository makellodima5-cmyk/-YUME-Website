import { useRef } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { ALL_GENRES } from "@/data/anime";

export type CatalogFiltersValue = {
  genres: string[];
  status: string;
  yearFrom: string;
  yearTo: string;
  minRating: number;
  type: string;
  ageRating: string;
};

export const EMPTY_CATALOG_FILTERS: CatalogFiltersValue = {
  genres: [],
  status: "Любой",
  yearFrom: "",
  yearTo: "",
  minRating: 0,
  type: "Любой",
  ageRating: "Любой",
};

type Props = {
  open: boolean;
  placement?: "catalog" | "home";
  draft: CatalogFiltersValue;
  setDraft: (value: CatalogFiltersValue) => void;
  onApply: () => void;
  onReset: () => void;
};

const selectClass = "h-9 w-full rounded-lg border border-border bg-secondary px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/50";
const labelClass = "mb-1 block text-xs text-muted-foreground";

export function CatalogFilters({ open, draft, setDraft, onApply, onReset, placement = "catalog" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const update = (patch: Partial<CatalogFiltersValue>) => setDraft({ ...draft, ...patch });
  const toggleGenre = (genre: string) => update({
    genres: draft.genres.includes(genre)
      ? draft.genres.filter((item) => item !== genre)
      : [...draft.genres, genre],
  });

  const panelPosition = placement === "home"
    ? "fixed left-3 right-3 top-[145px] z-[60] max-h-[calc(100svh-230px)] overflow-y-auto sm:left-8 sm:right-auto sm:top-[120px] sm:max-h-[calc(100svh-160px)]"
    : "absolute right-0 top-full z-40 mt-2 max-h-[calc(100svh-180px)] overflow-y-auto";

  return (
    <div ref={panelRef} className={`${panelPosition} w-[min(94vw,440px)] rounded-2xl border border-white/10 bg-[#171127]/[.98] p-3 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-4`} role="dialog" aria-label="Фильтры каталога">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" /> Фильтры</div>
      </div>

      <div className="mb-3">
        <label className={labelClass}>Жанры · можно выбрать несколько</label>
        <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
          {ALL_GENRES.map((genre) => {
            const active = draft.genres.includes(genre);
            return <button key={genre} type="button" onClick={() => toggleGenre(genre)} aria-pressed={active} className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? "border-primary/70 bg-primary/20 text-foreground" : "border-border bg-secondary/70 text-muted-foreground hover:text-foreground"}`}>{genre}</button>;
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label><span className={labelClass}>Статус</span><span className="relative block"><select className={selectClass} value={draft.status} onChange={(e) => update({ status: e.target.value })}><option>Любой</option><option>Вышел</option><option>Онгоинг</option><option>Анонс</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" /></span></label>
        <label><span className={labelClass}>Тип</span><span className="relative block"><select className={selectClass} value={draft.type} onChange={(e) => update({ type: e.target.value })}><option>Любой</option><option>TV</option><option>Фильм</option><option>OVA</option><option>ONA</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" /></span></label>
        <label><span className={labelClass}>Год от</span><input className={selectClass} inputMode="numeric" type="number" min="1900" max="2100" placeholder="Например, 2010" value={draft.yearFrom} onChange={(e) => update({ yearFrom: e.target.value })} /></label>
        <label><span className={labelClass}>Год до</span><input className={selectClass} inputMode="numeric" type="number" min="1900" max="2100" placeholder="Например, 2026" value={draft.yearTo} onChange={(e) => update({ yearTo: e.target.value })} /></label>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between"><label htmlFor="catalog-min-rating" className="text-xs text-muted-foreground">Рейтинг от</label><span className="text-xs font-semibold tabular-nums">{draft.minRating.toFixed(1)}</span></div>
        <input id="catalog-min-rating" type="range" min="0" max="9" step="0.5" value={draft.minRating} onChange={(e) => update({ minRating: Number(e.target.value) })} className="h-2 w-full cursor-pointer accent-fuchsia-400" />
        <div className="flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>9</span></div>
      </div>

      <label className="mt-3 block"><span className={labelClass}>Возрастной рейтинг</span><span className="relative block"><select className={selectClass} value={draft.ageRating} onChange={(e) => update({ ageRating: e.target.value })}><option>Любой</option><option>Без ограничений</option><option>12+</option><option>16+</option><option>18+</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" /></span></label>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onReset} className="h-9 flex-1 rounded-lg border border-border bg-secondary text-sm transition hover:bg-accent">Сбросить</button>
        <button type="button" onClick={onApply} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-neon text-sm font-semibold text-primary-foreground transition hover:brightness-110"><Check className="h-4 w-4" /> Показать</button>
      </div>
    </div>
  );
}
