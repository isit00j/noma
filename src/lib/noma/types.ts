export type ContentFormat = "tiptap-html";

/** User-selectable appearance. "nature" is a standalone warm light theme. "amoled" is pure black. */
export type ThemeSetting = "light" | "dark" | "system" | "nature" | "amoled";

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
  theme: ThemeSetting;
  fontSize: number;
  editorWidth: number;
  lineHeight: number;
  autoBackup: boolean;
  sidebarCollapsed: boolean;
  /** Firebase uid that has completed the first-run welcome on this device. */
  onboardedFor: string | null;
  displayName: string;

  // App Lock Security Settings
  appLockEnabled: boolean;
  lockTimeout: number; // Seconds: 0 (Immediately), 10, 60, 300, 900, 1800, 3600
  unlockMethods: {
    biometric: boolean;
    pattern: boolean;
    password: boolean;
  };
  passwordHash: string | null;
  passwordSalt: string | null;
  patternHash: string | null;
  patternSalt: string | null;
  failedAttempts: number;
  lockoutUntil: number | null;
}

export type ReminderStatus = "pending" | "completed" | "dismissed";

/** How a reminder should alert the user. Absent (older reminders) resolves to "notification". */
export type ReminderAlertType = "notification" | "phone-alarm";

/** Alarm-tone selection mode for phone-alarm reminders. */
export type AlarmToneMode = "system" | "system-picker" | "custom";

export interface Reminder {
  id: string;
  /** Set for note reminders. Absent for task reminders. */
  noteId?: string;
  /** Set for task reminders (Android-only tasks feature). Absent for note reminders. */
  taskId?: string;
  scheduledAt: number;
  status: ReminderStatus;
  createdAt: number;
  updatedAt: number;
  notificationId?: number | undefined;
  /** Android-only. When "phone-alarm", the alert is handed to the device Clock app. */
  alertType?: ReminderAlertType | undefined;
  /** Alarm tone mode; defaults to "system" when phone-alarm is selected. */
  alarmToneMode?: AlarmToneMode | undefined;
  /** content:// URI of the chosen ringtone/audio (system-picker or custom). */
  alarmToneUri?: string | undefined;
  /** Lightweight display name for the chosen tone, e.g. "My Alarm.mp3". */
  alarmToneName?: string | undefined;
  /** Whether vibration was requested for the phone alarm. Defaults to true. */
  alarmVibrate?: boolean | undefined;
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
  reminderCount?: number;
  taskCount?: number;
  ownerId?: string | null;
  libraryId?: string | null;
}

/* ---------------- Tasks (Android-only) ---------------- */

/** Restrained priority scale for tasks. Kept subtle in the UI. */
export type TaskPriority = "none" | "low" | "medium" | "high";

export type RecurrenceFreq = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

/**
 * Recurrence rule for a task. The same record advances its dueAt on
 * completion — no future occurrence records are ever generated.
 */
export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Repeat every N units (days/weeks/months/years, or N weekdays). Defaults to 1. */
  interval?: number;
  /** Epoch ms. When the next occurrence would pass this, the recurrence ends. */
  endAt?: number | null;
}

export interface Task {
  id: string;
  title: string;
  details: string;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Epoch ms of the due date/time. Null when no due date is set. */
  dueAt: number | null;
  priority: TaskPriority;
  /** TaskList id, or INBOX_LIST_ID for the implicit inbox. */
  listId: string;
  /** Parent task id for subtasks. Null for top-level tasks. Max depth: 1. */
  parentTaskId: string | null;
  /** Manual ordering within a list/view. */
  order: number;
  /** Free-form labels, stored lowercase-trimmed. No separate label store. */
  labelIds: string[];
  /** Optional link to a note. Never auto-created; tasks stay independent of notes. */
  noteId: string | null;
  /** Denormalized from the reminders table for cheap list display. */
  reminderAt: number | null;
  recurrence: RecurrenceRule | null;
  deleted: boolean;
  deletedAt: number | null;
}

export interface TaskList {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Implicit default list. Never stored in the taskLists table. */
export const INBOX_LIST_ID = "inbox";

export const NOMA_VERSION = "1.0.1";
export const BACKUP_FORMAT_VERSION = 2;

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  theme: "system",
  fontSize: 17,
  editorWidth: 720,
  lineHeight: 1.7,
  autoBackup: false,
  sidebarCollapsed: false,
  onboardedFor: null,
  displayName: "",

  appLockEnabled: false,
  lockTimeout: 0,
  unlockMethods: {
    biometric: false,
    pattern: false,
    password: false,
  },
  passwordHash: null,
  passwordSalt: null,
  patternHash: null,
  patternSalt: null,
  failedAttempts: 0,
  lockoutUntil: null,
};
