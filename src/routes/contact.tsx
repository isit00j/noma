import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/noma/app-gate";
import { ContactSection } from "@/components/noma/contact-section";

const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact & Feedback — Noma",
  url: "https://mynoma.vercel.app/contact",
  description:
    "Get in touch with the creator of Noma for bug reports, feature requests, help, or feedback.",
};

export const Route = createFileRoute("/contact")({
  ssr: false,
  head: () => ({
    links: [{ rel: "canonical", href: "https://mynoma.vercel.app/contact" }],
    meta: [
      { title: "Contact & Feedback — Noma" },
      {
        name: "description",
        content:
          "Get in touch with the creator of Noma for bug reports, feature requests, help, or feedback.",
      },
      { property: "og:site_name", content: "Noma" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mynoma.vercel.app/contact" },
      { property: "og:title", content: "Contact & Feedback — Noma" },
      {
        property: "og:description",
        content:
          "Get in touch with the creator of Noma for bug reports, feature requests, help, or feedback.",
      },
      { property: "og:image", content: "https://mynoma.vercel.app/noma-icon-512.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Contact & Feedback — Noma" },
      {
        name: "twitter:description",
        content:
          "Get in touch with the creator of Noma for bug reports, feature requests, help, or feedback.",
      },
      { name: "twitter:image", content: "https://mynoma.vercel.app/noma-icon-512.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(contactPageSchema),
      },
    ],
  }),
  component: ContactRoute,
});

function ContactRoute() {
  return (
    <AppGate>
      <ContactSection />
    </AppGate>
  );
}
