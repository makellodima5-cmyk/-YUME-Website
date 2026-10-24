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
  plugins: [
    tanstackStart({
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
  define: {
    "import.meta.env.VITE_YUME_ANDROID_BUILD": JSON.stringify("true"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      // The server bundle is emitted by TanStack Start but never runs in the APK.
      // Cloudflare provides this runtime module only when deployed as a Worker.
      external: ["cloudflare:workers"],
    },
  },
});
