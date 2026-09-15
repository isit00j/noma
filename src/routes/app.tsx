import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/noma/app-gate";
import { Workspace } from "@/components/noma/workspace";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    links: [{ rel: "canonical", href: "https://mynoma.vercel.app/app" }],
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Noma" },
      {
        name: "description",
        content: "Minimalist, calm, offline-first notes.",
      },
    ],
  }),
  component: AppRoute,
});

function AppRoute() {
  return (
    <AppGate>
      <Workspace />
    </AppGate>
  );
}
