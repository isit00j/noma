import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/noma/app-gate";
import { Workspace } from "@/components/noma/workspace";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Noma — Calm, offline-first notes" },
      {
        name: "description",
        content:
          "Noma is a minimalist note-taking app that works fully offline, stores notes on your device, and backs up to Google Drive.",
      },
      { property: "og:title", content: "Noma — Calm, offline-first notes" },
      {
        property: "og:description",
        content:
          "Write without distraction. Notes live on your device and sync to backups when you choose.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AppGate>
      <Workspace />
    </AppGate>
  );
}
