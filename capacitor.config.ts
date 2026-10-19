import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ideasea.app",
  appName: "灵感海",
  webDir: "dist",
  backgroundColor: "#dff2f8",
  android: {
    backgroundColor: "#dff2f8",
  },
  plugins: {
    SystemBars: {
      // MainActivity reports IME occlusion without resizing the WebView surface.
      insetsHandling: "disable",
      initialViewportFitValueHint: "cover",
      style: "LIGHT",
    },
  },
};

export default config;
