export type KodikPlaybackEvent =
  | { type: "timeupdate"; currentTime: number; durationSeconds: number | null }
  | { type: "ended" };

type MessageRecord = Record<string, unknown>;

function asRecord(value: unknown): MessageRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MessageRecord;
}

function parseRecord(value: unknown): MessageRecord | null {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function finiteSeconds(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Kodik embeds can expose several common postMessage shapes. Normalize the
 * event name and inspect the top-level plus nested data/value/info payloads.
 * The caller must still validate event.origin and event.source.
 */
export function parseKodikPlaybackMessage(value: unknown): KodikPlaybackEvent | null {
  const root = parseRecord(value);
  if (!root) return null;

  const nested = [root.data, root.value, root.info, root.answer]
    .map(parseRecord)
    .filter((item): item is MessageRecord => item !== null);
  const records = [root, ...nested];

  const eventNames = records.flatMap((record) =>
    ["type", "event", "name", "key", "eventName"].map((key) => record[key])
      .filter((item): item is string => typeof item === "string"),
  );
  const normalizedNames = eventNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));

  if (normalizedNames.some((name) =>
    name === "ended" || name.endsWith("videoended") || name.includes("videoend") ||
    name === "complete" || name.endsWith("completed"),
  )) {
    return { type: "ended" };
  }

  const isTimeUpdate = normalizedNames.some((name) =>
    name === "time" || name === "timeupdate" || name.endsWith("timeupdate") ||
    name === "timed" || name === "timechanged",
  );
  if (!isTimeUpdate) return null;

  const findNumber = (keys: string[]): number | null => {
    for (const record of records) {
      for (const key of keys) {
        if (key in record) {
          const parsed = finiteSeconds(record[key]);
          if (parsed !== null) return parsed;
        }
      }
    }
    return null;
  };

  const currentTime = findNumber(["currentTime", "current_time", "time", "seconds", "position", "value"]);
  if (currentTime === null) return null;

  const durationSeconds = findNumber(["duration", "durationSeconds", "duration_seconds", "totalTime", "total_time"]);
  return { type: "timeupdate", currentTime, durationSeconds: durationSeconds && durationSeconds > 0 ? durationSeconds : null };
}
