import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { validateCatalogSearch } from "@/data/catalog-search";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("accepts login, registration, and direct privacy-policy views", () => {
    expect(validateCatalogSearch({ section: "login" }).section).toBe("login");
    expect(validateCatalogSearch({ section: "register" }).section).toBe("register");
    expect(validateCatalogSearch({ section: "privacy-policy" }).section).toBe("privacy-policy");
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});