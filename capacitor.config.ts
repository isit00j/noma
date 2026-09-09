import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.noma.notes",
  appName: "Noma",
  webDir: ".output/public",
  server: {
    hostname: "mynoma.vercel.app",
    androidScheme: "https",
  },
};

export default config;
