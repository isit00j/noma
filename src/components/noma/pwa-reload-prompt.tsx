import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Serwist } from "@serwist/window";

export function PWAReloadPrompt() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [serwist, setSerwist] = useState<Serwist | undefined>();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const serwist = new Serwist("/sw.js", { scope: "/", type: "classic" });
      setSerwist(serwist);

      serwist.addEventListener("installed", () => {
        setOfflineReady(true);
      });

      serwist.addEventListener("waiting", () => {
        setNeedRefresh(true);
      });

      serwist.register().catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (offlineReady) {
      toast.success("App ready to work offline", {
        id: "pwa-offline-ready",
      });
      setOfflineReady(false);
    }
  }, [offlineReady]);

  useEffect(() => {
    if (needRefresh) {
      toast("New version available", {
        id: "pwa-need-refresh",
        action: {
          label: "Reload",
          onClick: () => {
            if (serwist) {
              serwist.messageSW({ type: "SKIP_WAITING" });
              window.location.reload();
            }
          },
        },
        duration: Infinity,
      });
    }
  }, [needRefresh, serwist]);

  return null;
}
