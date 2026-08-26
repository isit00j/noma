import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Note } from "@/lib/noma/types";

export type SaveState = "idle" | "saving" | "saved" | "offline";

interface NoteEditorProps {
  note: Note;
  onChange: (patch: { title?: string; content?: string }) => void;
  fontSize: number;
  editorWidth: number;
  lineHeight: number;
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = () => {
    const previous = editor.getAttributes("link")["href"] as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt("Image URL", "https://");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="noma-scroll flex items-center gap-0.5 overflow-x-auto">
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListTodo className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={addLink}>
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={addImage}>
        <ImageIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolbarButton>
    </div>
  );
}

export function NoteEditor({ note, onChange, fontSize, editorWidth, lineHeight }: NoteEditorProps) {
  const [showToolbar, setShowToolbar] = useState(true);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const loadedNoteId = useRef(note.id);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Highlight,
      Image.configure({ inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: note.content,
    editorProps: { attributes: { class: "tiptap", spellcheck: "true" } },
    onUpdate: ({ editor: instance }) => onChange({ content: instance.getHTML() }),
  });

  // Swap document when a different note is opened, without clobbering typing.
  useEffect(() => {
    if (!editor || loadedNoteId.current === note.id) return;
    loadedNoteId.current = note.id;
    editor.commands.setContent(note.content || "", { emitUpdate: false });
  }, [editor, note.id, note.content]);

  useEffect(() => {
    const textarea = titleRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [note.title, note.id]);

  return (
    <div
      className="noma-editor mx-auto w-full px-5 pb-32 sm:px-8"
      style={
        {
          maxWidth: `${editorWidth}px`,
          "--noma-font-size": `${fontSize}px`,
          "--noma-line-height": String(lineHeight),
        } as React.CSSProperties
      }
    >
      <textarea
        ref={titleRef}
        value={note.title}
        onChange={(event) => onChange({ title: event.target.value.replace(/\n/g, "") })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            editor?.commands.focus("start");
          }
        }}
        rows={1}
        placeholder="Untitled"
        aria-label="Note title"
        className="mt-8 mb-4 w-full resize-none border-0 bg-transparent font-serif text-3xl leading-tight font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none sm:text-4xl"
      />

      {editor && (
        <>
          <div className="sticky top-0 z-10 -mx-2 mb-4 flex items-center gap-1 border-b border-border/70 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
            {showToolbar ? (
              <Toolbar editor={editor} />
            ) : (
              <span className="px-1 text-xs text-muted-foreground">Formatting hidden</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0 text-xs text-muted-foreground"
              onClick={() => setShowToolbar((value) => !value)}
            >
              {showToolbar ? "Hide" : "Format"}
            </Button>
          </div>
          <EditorContent editor={editor} />
        </>
      )}
    </div>
  );
}
