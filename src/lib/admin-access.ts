export function hasAdminSession(payload: { isAdmin?: unknown }): boolean {
  return payload.isAdmin === true;
}
