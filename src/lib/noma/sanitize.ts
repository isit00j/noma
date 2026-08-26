const ALLOWED_TAGS = new Set([
  "P","BR","H1","H2","H3","H4","STRONG","B","EM","I","U","S","MARK","CODE","PRE","BLOCKQUOTE",
  "UL","OL","LI","A","IMG","HR","TABLE","THEAD","TBODY","TR","TH","TD","SPAN","DIV","LABEL","INPUT",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel"]),
  IMG: new Set(["src", "alt", "title"]),
  UL: new Set(["data-type"]),
  LI: new Set(["data-checked", "data-type"]),
  INPUT: new Set(["type", "checked", "disabled"]),
  TD: new Set(["colspan", "rowspan"]),
  TH: new Set(["colspan", "rowspan"]),
};

function safeUrl(value: string, allowData: boolean): string | null {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) return trimmed;
  return null;
}

/** Strips everything outside the editor's allowlist so imported notes can't inject scripts. */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // No DOM available (SSR): drop markup rather than trusting it.
    return html.replace(/<[^>]*>/g, "");
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const allowed = ALLOWED_ATTRS[child.tagName];
        const name = attr.name.toLowerCase();
        if (!allowed?.has(name)) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === "href" || name === "src") {
          const url = safeUrl(attr.value, name === "src");
          if (!url) child.removeAttribute(attr.name);
          else child.setAttribute(attr.name, url);
        }
      }
      if (child.tagName === "A") {
        child.setAttribute("rel", "noopener noreferrer nofollow");
        child.setAttribute("target", "_blank");
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function htmlToPlainText(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, " ");
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function countWords(html: string): number {
  const text = htmlToPlainText(html);
  return text ? text.split(/\s+/).length : 0;
}
