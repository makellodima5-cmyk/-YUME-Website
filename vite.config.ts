// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Nitro's Cloudflare Worker entry dispatches Cron via its native scheduled hook.
  // Register the plugin explicitly; files under /plugins are not auto-discovered here.
  nitro: {
    plugins: ["./plugins/catalog-refresh.ts"],
  },
  vite: {
    // cloudflare:workers is a runtime-provided module, not an npm dependency.
    // Leave it external so Vite can build the SSR bundle and Workers can resolve it at runtime.
    build: {
      rolldownOptions: {
        external: ["cloudflare:workers"],
      },
    },
  },
});
