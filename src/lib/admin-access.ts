export function getTelegramAdminIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").map((part) => part.trim()).filter((id) => /^\\d{1,20}$/.test(id)))];
}

export function isTelegramAdminIdAllowed(configuredIds: unknown, candidateId: unknown): boolean {
  if (typeof candidateId !== "string" || !/^\\d{1,20}$/.test(candidateId)) return false;
  return getTelegramAdminIds(configuredIds).includes(candidateId);
}

export function hasAdminSession(payload: { isAdmin?: unknown }): boolean {
  return payload.isAdmin === true;
}
