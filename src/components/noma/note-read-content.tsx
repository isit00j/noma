import { useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { sanitizeHtml } from "@/lib/noma/sanitize";
import { ChartRenderer, parseChartElement } from "./chart-node";

/**
 * Static read renderer for note content. Renders the already-sanitized stored
 * HTML directly instead of constructing a Tiptap/ProseMirror editor, then
 * enhances the two custom node types the editor persists as plain markup:
 *
 * - `img[src^="noma-attachment://"]` resolved to blob/data URLs via IndexedDB
 * - `div[data-type="noma-chart"]` mounted with the existing ChartRenderer
 *
 * The `.tiptap` class keeps the shared `.noma-editor .tiptap` typography exactly
 * as the editor produced it. Sanitization is the same `sanitizeHtml` applied on
 * every content write, so the rendered markup carries identical trust.
 */
export function NoteReadContent({ content }: { content: string }) {
  const { db } = useDatabase();
  const html = useMemo(() => sanitizeHtml(content || ""), [content]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    const chartRoots: Root[] = [];

    for (const img of Array.from(container.querySelectorAll("img"))) {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("noma-attachment://") && db) {
        const attachmentId = src.replace("noma-attachment://", "");
        db.attachments.get(attachmentId).then((att) => {
          if (active && att?.data) img.setAttribute("src", att.data);
        });
      }
      // Mirror the editor image node view's presentation.
      img.classList.add(
        "rounded-lg",
        "max-w-full",
        "h-auto",
        "object-contain",
        "border",
        "border-border/40",
        "shadow-2xs",
      );
      const wrapper = document.createElement("div");
      wrapper.className = "relative inline-block my-2 max-w-full";
      img.replaceWith(wrapper);
      wrapper.appendChild(img);
    }

    for (const el of Array.from(container.querySelectorAll('div[data-type="noma-chart"]'))) {
      // Mirror the read-only chart node view's static wrapper (its edit/delete
      // chrome is already hidden in read mode, so only the frame is needed).
      el.classList.add(
        "group",
        "relative",
        "my-4",
        "rounded-xl",
        "border",
        "border-border",
        "bg-card",
        "p-3",
        "sm:p-4",
        "transition-all",
        "hover:border-ring/50",
        "max-w-full",
        "overflow-hidden",
      );
      const root = createRoot(el);
      root.render(<ChartRenderer chartData={parseChartElement(el as HTMLElement)} />);
      chartRoots.push(root);
    }

    return () => {
      active = false;
      for (const root of chartRoots) root.unmount();
    };
  }, [html, db]);

  return <div ref={containerRef} className="tiptap" dangerouslySetInnerHTML={{ __html: html }} />;
}
