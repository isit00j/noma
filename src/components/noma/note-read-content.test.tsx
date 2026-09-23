// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { sanitizeHtml } from "@/lib/noma/sanitize";
import { NoteReadContent } from "./note-read-content";
import { parseChartElement } from "./chart-node";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;

const { attachmentStore } = vi.hoisted(() => ({
  attachmentStore: {} as Record<string, { data: string }>,
}));

vi.mock("@/lib/noma/DatabaseContext", () => ({
  useDatabase: () => ({
    db: {
      attachments: {
        get: async (id: string) => attachmentStore[id] ?? null,
      },
    },
    loading: false,
    migrateGuestData: async () => {},
    skipGuestData: async () => {},
    guestMigrationPending: false,
  }),
}));

async function renderContent(content: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<NoteReadContent content={content} />);
  });
  return { container, root };
}

function tiptapOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".tiptap");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const key of Object.keys(attachmentStore)) delete attachmentStore[key];
});

describe("NoteReadContent static rendering", () => {
  it("renders normal note HTML correctly", async () => {
    const { container } = await renderContent(
      `<h2>Shopping</h2><p>Hello <strong>world</strong> and <em>friends</em></p>` +
        `<ul><li>one</li><li>two</li></ul>` +
        `<blockquote>quoted</blockquote>` +
        `<table><tbody><tr><td>cell</td></tr></tbody></table>`,
    );
    const el = tiptapOf(container);
    expect(el.querySelector("h2")?.textContent).toBe("Shopping");
    expect(el.querySelector("strong")?.textContent).toBe("world");
    expect(el.querySelectorAll("ul li")).toHaveLength(2);
    expect(el.querySelector("blockquote")?.textContent).toBe("quoted");
    expect(el.querySelector("td")?.textContent).toBe("cell");
  });

  it("renders the sanitized output, not the raw input", async () => {
    const raw = `<p onclick="steal()">Hi</p><script>alert(1)</script><p>Bye</p>`;
    const { container } = await renderContent(raw);
    const el = tiptapOf(container);
    expect(el.innerHTML).toBe(sanitizeHtml(raw));
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("p")?.getAttribute("onclick")).toBeNull();
  });

  it("strips unsafe elements and attributes (XSS regression)", async () => {
    const { container } = await renderContent(
      `<script>alert("xss")</script>` +
        `<iframe src="https://evil.example"></iframe>` +
        `<object data="https://evil.example"></object>` +
        `<img src="javascript:alert(1)" onerror="alert(2)" alt="x">` +
        `<a href="javascript:alert(1)">click</a>` +
        `<a href="data:text/html,<script>alert(1)</script>">click</a>` +
        `<div style="position:absolute;top:0;color:red" onmouseover="alert(1)">styled</div>` +
        `<p>safe</p>`,
    );
    const el = tiptapOf(container);
    // Dangerous elements never survive.
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("iframe")).toBeNull();
    expect(el.querySelector("object")).toBeNull();
    // Event handler attributes are stripped everywhere.
    expect(el.innerHTML).not.toMatch(/onerror|onmouseover|onclick/i);
    // Dangerous URL schemes are neutralized.
    const img = el.querySelector("img");
    expect(img?.getAttribute("src")).toBeNull();
    for (const a of Array.from(el.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toBeNull();
    }
    // Inline styles are reduced to safe colour declarations only (DIV is a
    // styled text element); positioning and handlers are stripped.
    const div = Array.from(el.querySelectorAll("div")).find((d) => d.textContent === "styled");
    expect(div?.getAttribute("style")).toBe("color: red");
    expect(div?.getAttribute("onmouseover")).toBeNull();
    // Safe content is untouched.
    expect(el.querySelector("p")?.textContent).toBe("safe");
  });

  it("preserves link target and rel", async () => {
    const { container } = await renderContent(
      `<p>Visit <a href="https://example.com">example</a> and <a href="mailto:hi@example.com">mail</a></p>`,
    );
    const links = Array.from(tiptapOf(container).querySelectorAll("a"));
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    }
    expect(links[0]?.getAttribute("href")).toBe("https://example.com");
  });

  it("preserves task-list structure", async () => {
    const { container } = await renderContent(
      `<ul data-type="taskList">` +
        `<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span>Done</span></label></li>` +
        `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span>Todo</span></label></li>` +
        `</ul>`,
    );
    const el = tiptapOf(container);
    const ul = el.querySelector('ul[data-type="taskList"]');
    expect(ul).not.toBeNull();
    const items = Array.from(el.querySelectorAll('li[data-type="taskItem"]'));
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("data-checked")).toBe("true");
    expect(items[0]?.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(items[1]?.querySelector("span")?.textContent).toBe("Todo");
  });

  it("mounts chart nodes with the existing ChartRenderer", async () => {
    const { container } = await renderContent(
      `<p>Before</p>` +
        `<div data-type="noma-chart" data-version="2" data-chart-type="bar" data-title="Sales" data-subtitle="" ` +
        `data-categories='["Jan","Feb"]' data-series='[{"id":"s1","name":"S1","values":[10,20]}]' data-options='{}'></div>` +
        `<p>After</p>`,
    );
    const el = tiptapOf(container);
    const chart = el.querySelector('div[data-type="noma-chart"]');
    expect(chart).not.toBeNull();
    // Read-mode wrapper frame applied.
    expect(chart?.classList.contains("rounded-xl")).toBe(true);
    // The existing renderer produced output (title is rendered outside recharts).
    expect(chart?.textContent).toContain("Sales");
    expect(el.textContent).toContain("Before");
    expect(el.textContent).toContain("After");
  });

  it("parses legacy v1 chart markup the same way the editor node does", () => {
    const el = document.createElement("div");
    el.setAttribute("data-type", "noma-chart");
    el.setAttribute("data-version", "1");
    el.setAttribute("data-chart-type", "line");
    el.setAttribute("data-title", "Old");
    el.setAttribute("data-chart", JSON.stringify([{ name: "A", value: 5 }]));
    const data = parseChartElement(el);
    expect(data.version).toBe(2);
    expect(data.type).toBe("line");
    expect(data.title).toBe("Old");
    expect(data.categories).toEqual(["A"]);
    expect(data.series[0]?.values).toEqual([5]);
  });

  it("resolves noma-attachment:// images through the attachment store", async () => {
    attachmentStore["att-1"] = { data: "data:image/png;base64,iVBORw0KGgo=" };
    const { container } = await renderContent(
      `<p><img src="noma-attachment://att-1" alt="photo"></p>`,
    );
    const img = tiptapOf(container).querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(img?.getAttribute("alt")).toBe("photo");
    // Editor node view presentation preserved.
    expect(img?.classList.contains("rounded-lg")).toBe(true);
    expect(img?.parentElement?.classList.contains("relative")).toBe(true);
  });

  it("leaves regular image URLs alone while still styling them", async () => {
    const { container } = await renderContent(
      `<p><img src="https://example.com/pic.png" alt="pic"></p>`,
    );
    const img = tiptapOf(container).querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/pic.png");
    expect(img?.classList.contains("rounded-lg")).toBe(true);
  });

  it("renders empty and plain-text notes without crashing", async () => {
    const empty = await renderContent("");
    expect(tiptapOf(empty.container).innerHTML).toBe("");
    empty.root.unmount();

    const plain = await renderContent("Just some words");
    expect(tiptapOf(plain.container).textContent).toContain("Just some words");
    plain.root.unmount();
  });

  it("constructs no Tiptap editor and unmounts cleanly on read -> edit", async () => {
    function ModeHarness({ content }: { content: string }) {
      const [mode, setMode] = useState<"read" | "edit">("read");
      return (
        <div>
          <button onClick={() => setMode("edit")}>Edit</button>
          {mode === "read" ? (
            <NoteReadContent content={content} />
          ) : (
            <div data-testid="editor-mount">editor</div>
          )}
        </div>
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ModeHarness
          content={`<p>hello</p><div data-type="noma-chart" data-version="2" data-chart-type="bar" data-title="T" data-categories='["a"]' data-series='[{"id":"s","name":"s","values":[1]}]' data-options='{}'></div>`}
        />,
      );
    });

    // No ProseMirror/editor artifacts: the read view builds no editor instance.
    expect(container.querySelector(".ProseMirror")).toBeNull();
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(container.textContent).toContain("hello");

    // Switching to edit unmounts the static renderer (chart roots cleaned up).
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="editor-mount"]')).not.toBeNull();
    expect(container.querySelector(".tiptap")).toBeNull();

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });
});
