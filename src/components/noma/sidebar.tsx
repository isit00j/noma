import { Link } from "@tanstack/react-router";
import {
  Archive,
  ChevronLeft,
  Clock,
  FileText,
  Folder as FolderIcon,
  Hash,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Settings as SettingsIcon,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Folder, Note, Tag } from "@/lib/noma/types";
import { sameView, type ViewState } from "@/lib/noma/view";

interface SidebarProps {
  notes: Note[];
  folders: Folder[];
  tags: Tag[];
  view: ViewState;
  onSelectView: (view: ViewState) => void;
  onNewNote: () => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onCreateTag: () => void;
  onRenameTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
  onCollapse?: () => void;
}

function NavItem({
  label,
  icon: Icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon: typeof FileText;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

export function NomaSidebar({
  notes,
  folders,
  tags,
  view,
  onSelectView,
  onNewNote,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onCollapse,
}: SidebarProps) {
  const live = notes.filter((note) => !note.deleted);
  const counts = {
    all: live.filter((note) => !note.archived).length,
    recent: live.filter((note) => !note.archived && Date.now() - note.updatedAt < 6.048e8).length,
    pinned: live.filter((note) => note.pinned && !note.archived).length,
    favorites: live.filter((note) => note.favorite && !note.archived).length,
    archive: live.filter((note) => note.archived).length,
    trash: notes.filter((note) => note.deleted).length,
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <span className="flex items-center gap-2.5">
          <img
            src="/noma-icon-192.png"
            alt="Noma"
            className="size-8 rounded-[10px] noma-glow"
            width={32}
            height={32}
          />
          <span className="flex flex-col leading-none">
            <span className="font-serif text-lg font-semibold tracking-tight text-sidebar-foreground">Noma</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">A quiet place for your thoughts.</span>
          </span>
        </span>
        {onCollapse && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onCollapse} aria-label="Collapse sidebar">
            <ChevronLeft className="size-4" />
          </Button>
        )}
      </div>


      <div className="px-3 pb-3">
        <Button className="h-9 w-full justify-start gap-2" onClick={onNewNote}>
          <Plus className="size-4" />
          New Note
        </Button>
      </div>

      <nav className="noma-scroll flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        <div className="space-y-0.5">
          <NavItem label="All Notes" icon={FileText} count={counts.all} active={sameView(view, { kind: "all" })} onClick={() => onSelectView({ kind: "all" })} />
          <NavItem label="Recent" icon={Clock} count={counts.recent} active={sameView(view, { kind: "recent" })} onClick={() => onSelectView({ kind: "recent" })} />
          <NavItem label="Pinned" icon={Pin} count={counts.pinned} active={sameView(view, { kind: "pinned" })} onClick={() => onSelectView({ kind: "pinned" })} />
          <NavItem label="Favorites" icon={Star} count={counts.favorites} active={sameView(view, { kind: "favorites" })} onClick={() => onSelectView({ kind: "favorites" })} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Folders</span>
            <button type="button" onClick={onCreateFolder} aria-label="New folder" className="text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {folders.length === 0 && <p className="px-2.5 py-1 text-xs text-muted-foreground">No folders yet</p>}
            {folders.map((folder) => (
              <div key={folder.id} className="group/row flex items-center">
                <NavItem
                  label={folder.name}
                  icon={FolderIcon}
                  count={live.filter((note) => note.folderId === folder.id && !note.archived).length}
                  active={sameView(view, { kind: "folder", id: folder.id })}
                  onClick={() => onSelectView({ kind: "folder", id: folder.id })}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Folder options for ${folder.name}`}
                      className="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
                      <Pencil className="size-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteFolder(folder)}>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tags</span>
            <button type="button" onClick={onCreateTag} aria-label="New tag" className="text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {tags.length === 0 && <p className="px-2.5 py-1 text-xs text-muted-foreground">No tags yet</p>}
            {tags.map((tag) => (
              <div key={tag.id} className="group/row flex items-center">
                <NavItem
                  label={tag.name}
                  icon={Hash}
                  count={live.filter((note) => note.tagIds.includes(tag.id) && !note.archived).length}
                  active={sameView(view, { kind: "tag", id: tag.id })}
                  onClick={() => onSelectView({ kind: "tag", id: tag.id })}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Tag options for ${tag.name}`}
                      className="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRenameTag(tag)}>
                      <Pencil className="size-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteTag(tag)}>
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-0.5">
          <NavItem label="Archive" icon={Archive} count={counts.archive} active={sameView(view, { kind: "archive" })} onClick={() => onSelectView({ kind: "archive" })} />
          <NavItem label="Trash" icon={Trash2} count={counts.trash} active={sameView(view, { kind: "trash" })} onClick={() => onSelectView({ kind: "trash" })} />
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/settings"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <SettingsIcon className="size-4" />
          Settings
        </Link>
      </div>
    </div>
  );
}
