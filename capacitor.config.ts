import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android wrapper configuration for YUME.
 *
 * The Android app must load its bundled web assets, never the hosted website.
 * The dedicated mobile build pipeline will generate this directory before
 * running `cap sync android`.
 */
const config: CapacitorConfig = {
  appId: "app.yume.mobile",
  appName: "YUME",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
