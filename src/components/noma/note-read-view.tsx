import { EditorContent, useEditor } from "@tiptap/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Bell, FolderOpen } from "lucide-react";
import React, { useEffect } from "react";
import { createNomaExtensions } from "./tiptap-extensions";
import { noteTitle } from "@/lib/noma/notes";
import type { Folder, Note, Tag } from "@/lib/noma/types";

interface NoteReadViewProps {
  note: Note;
  folders: Folder[];
  tags: Tag[];
  fontSize: number;
  editorWidth: number;
  lineHeight: number;
}

/**
 * Dedicated reading experience for a note. Renders the exact same Tiptap
 * document as the editor (tables, charts, attachments, formatting) through a
 * non-editable editor instance, so there is no cursor, selection UI, toolbar,
 * or other editor chrome — just the content.
 */
export function NoteReadView({
  note,
  folders,
  tags,
  fontSize,
  editorWidth,
  lineHeight,
}: NoteReadViewProps) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: createNomaExtensions({ readOnly: true }),
      content: note.content,
      editable: false,
      editorProps: {
        attributes: { class: "tiptap", spellcheck: "false" },
      },
    },
    [note.id],
  );

  // Keep the rendered document in sync if the underlying note record changes
  // while the Read View is mounted (e.g. tags or reminder updates).
  useEffect(() => {
    if (!editor) return;
    const rendered = editor.getHTML();
    const source = note.content || "";
    if (rendered !== source) {
      editor.commands.setContent(source, { emitUpdate: false });
    }
  }, [editor, note.id, note.content]);

  const folder = folders.find((item) => item.id === note.folderId) ?? null;
  const noteTags = tags.filter((tag) => note.tagIds.includes(tag.id));

  return (
    <article
      className="noma-read mx-auto w-full px-5 pb-32 sm:px-8 animate-in fade-in duration-200 motion-reduce:animate-none"
      style={
        {
          maxWidth: `${editorWidth}px`,
          "--noma-font-size": `${fontSize}px`,
          "--noma-line-height": String(lineHeight),
        } as React.CSSProperties
      }
      aria-label={noteTitle(note)}
    >
      <h1 className="mt-8 mb-3 font-serif text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
        {noteTitle(note)}
      </h1>

      <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Updated {formatDistanceToNowStrict(note.updatedAt, { addSuffix: true })}
        </span>
        {folder && (
          <span className="inline-flex items-center gap-1.5">
            <FolderOpen className="size-3.5" aria-hidden="true" />
            {folder.name}
          </span>
        )}
        {noteTags.slice(0, 5).map((tag) => (
          <span key={tag.id} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
            #{tag.name}
          </span>
        ))}
        {note.reminderAt && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            <Bell className="size-3" aria-hidden="true" />
            {format(note.reminderAt, "MMM d, p")}
          </span>
        )}
        {note.wordCount > 0 && <span className="tabular-nums">{note.wordCount} words</span>}
      </div>

      {/* `.noma-editor` scopes the shared Tiptap content typography; with
          `editable: false` there is no cursor, toolbar, or editor chrome. */}
      <div className="noma-editor">
        <EditorContent editor={editor} />
      </div>
    </article>
  );
}
