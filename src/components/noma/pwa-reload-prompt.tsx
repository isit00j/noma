import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PWAReloadPrompt() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | undefined>();

  useEffect(() => {
    // Only import virtual:pwa-register if window is defined (browser environment)
    if (typeof window !== "undefined") {
      import("virtual:pwa-register")
        .then(({ registerSW }) => {
          const update = registerSW({
            immediate: true,
            onOfflineReady() {
              setOfflineReady(true);
            },
            onNeedRefresh() {
              setNeedRefresh(true);
            },
          });
          setUpdateSW(() => update);
        })
        .catch(console.error);
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
            if (updateSW) updateSW(true);
          },
        },
        duration: Infinity,
      });
    }
  }, [needRefresh, updateSW]);

  return null;
}
