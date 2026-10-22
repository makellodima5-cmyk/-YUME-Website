import { getRequest, getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { filterAnimeForCountry } from "@/data/territorial-restrictions";

type CloudflareRequest = Request & {
  cf?: {
    country?: string | null;
  };
};

type CatalogWithItems<TItem extends { id: string }> = {
  items: TItem[];
};

/**
 * Filter on the server so a client cannot change a country query parameter to
 * regain a restricted title. Cloudflare's request.cf.country is preferred; the
 * CF-IPCountry header is a fallback when the IP Geolocation header is enabled.
 */
export function filterCatalogForCurrentRequest<
  TItem extends { id: string },
  T extends CatalogWithItems<TItem>,
>(result: T): T {
  const request = getRequest() as CloudflareRequest;
  const country = request.cf?.country ?? getRequestHeader("cf-ipcountry");

  // This RPC's output differs by visitor country and must not be shared-cached.
  setResponseHeader("Cache-Control", "private, no-store");

  return {
    ...result,
    items: filterAnimeForCountry(result.items, country),
  } as T;
}
