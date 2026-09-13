import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/noma/app-gate";
import { Workspace } from "@/components/noma/workspace";

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Noma",
  url: "https://mynoma.vercel.app/",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "All",
  description:
    "Minimalist, calm, offline-first note-taking application that stores notes locally on your device with optional Google Drive backup.",
  browserRequirements: "Requires JavaScript. Requires HTML5 IndexedDB storage support.",
};

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    links: [{ rel: "canonical", href: "https://mynoma.vercel.app/" }],
    meta: [
      { title: "Noma — Calm, offline-first notes" },
      {
        name: "description",
        content:
          "Noma is a minimalist note-taking app that works fully offline, stores notes on your device, and backs up to Google Drive.",
      },
      { property: "og:site_name", content: "Noma" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mynoma.vercel.app/" },
      { property: "og:title", content: "Noma — Calm, offline-first notes" },
      {
        property: "og:description",
        content:
          "Write without distraction. Notes live on your device and sync to backups when you choose.",
      },
      { property: "og:image", content: "https://mynoma.vercel.app/noma-icon-512.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Noma — Calm, offline-first notes" },
      {
        name: "twitter:description",
        content:
          "Write without distraction. Notes live on your device and sync to backups when you choose.",
      },
      { name: "twitter:image", content: "https://mynoma.vercel.app/noma-icon-512.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(webAppSchema),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <noscript>
        <div className="p-8 font-sans">
          <h1 className="text-2xl font-bold">Noma — Calm, offline-first notes</h1>
          <p className="mt-2 text-base">
            Noma is a minimalist note-taking application designed for privacy and speed. Your notes
            are stored locally on your device using IndexedDB, with support for offline access,
            custom folders, tags, rich text formatting, reminders, structured charts, and optional
            Google Drive backups.
          </p>
        </div>
      </noscript>
      <AppGate>
        <Workspace />
      </AppGate>
    </>
  );
}
