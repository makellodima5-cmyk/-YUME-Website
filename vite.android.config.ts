import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Standalone client build for Capacitor. Keep this separate from vite.config.ts:
 * the existing Cloudflare Worker build must retain its SSR/server output.
 */
export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_YUME_ANDROID_BUILD": JSON.stringify("true"),
  },
  plugins: [
    tanstackStart({
      // Use TanStack Start's default Node-compatible entry for the static shell.
      // src/server.ts is the production Cloudflare Worker entry and expects Worker bindings.
      spa: {
        enabled: true,
        prerender: {
          outputPath: "/index.html",
        },
      },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    // The shell prerender runs in Node; never substitute this stub in the Worker build.
    alias: {
      "@/lib/mobile-api": fileURLToPath(
        new URL("./src/lib/mobile-api.android.ts", import.meta.url),
      ),
      "cloudflare:workers": fileURLToPath(
        new URL("./scripts/android/cloudflare-workers.stub.ts", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Unlike the production Worker build, shell prerender runs under Node.
    // Keep cloudflare:workers bundled through the Android-only stub alias above.
  },
});
