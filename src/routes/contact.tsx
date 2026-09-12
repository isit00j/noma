import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/noma/app-gate";
import { ContactSection } from "@/components/noma/contact-section";

export const Route = createFileRoute("/contact")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Contact & Feedback — Noma" },
      {
        name: "description",
        content:
          "Get in touch with the creator of Noma for bug reports, feature requests, help, or feedback.",
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
