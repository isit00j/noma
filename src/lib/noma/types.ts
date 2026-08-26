export type ContentFormat = "tiptap-html";

export interface Note {
  id: string;
  title: string;
  content: string;
  contentFormat: ContentFormat;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  tagIds: string[];
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
  deletedAt: number | null;
  reminderAt: number | null;
  wordCount: number;
}

export interface Folder {
  id: string;
  name: string;
  /** Reserved for future nested folders. */
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

export interface AttachmentMeta {
  id: string;
  noteId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  /** Data URL kept locally so attachments survive offline + export. */
  data: string;
}

export interface AppSettings {
  id: "app";
  theme: "light" | "dark" | "system";
  fontSize: number;
  editorWidth: number;
  lineHeight: number;
  autoBackup: boolean;
  sidebarCollapsed: boolean;
}

export interface BackupRecord {
  id: string;
  createdAt: number;
  source: "local" | "google-drive";
  status: "success" | "failed";
  noteCount: number;
  message?: string;
}

export interface BackupManifest {
  backupFormatVersion: number;
  nomaVersion: string;
  createdAt: string;
  noteCount: number;
  folderCount: number;
  tagCount: number;
  attachmentCount: number;
}

export const NOMA_VERSION = "1.0.0";
export const BACKUP_FORMAT_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  theme: "system",
  fontSize: 17,
  editorWidth: 720,
  lineHeight: 1.7,
  autoBackup: false,
  sidebarCollapsed: false,
};
