import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AlarmToneMode, Reminder, ReminderAlertType } from "./types";

/**
 * Native bridge for delegating alarms to the device's alarm-clock app.
 *
 * Android-only. The system/default Clock app owns ringing, snooze, dismiss,
 * lock-screen behavior and volume — Noma only launches ACTION_SET_ALARM and
 * never implements its own alarm engine.
 *
 * On web/PWA the plugin is not registered, so every method rejects; all
 * phone-alarm UI is gated behind `isPhoneAlarmSupported()` and never renders
 * on web.
 */

export interface PhoneAlarmSetOptions {
  /** Local hour of day (0-23). */
  hour: number;
  /** Local minute (0-59). */
  minute: number;
  /** Label shown in the Clock app, e.g. the note title. */
  message: string;
  /** Request vibration in the alarm. */
  vibrate: boolean;
  /** Optional content:// URI of the alarm tone. Omit for the Clock app default. */
  ringtoneUri?: string | undefined;
}

export interface PickedTone {
  /** content:// URI, or null when the picker returned no tone (e.g. "Silent"). */
  uri: string | null;
  /** Human-readable name, e.g. "My Alarm.mp3", or null when unknown. */
  name: string | null;
}

export interface NomaAlarmPluginInterface {
  /** True when the device can handle ACTION_SET_ALARM. */
  checkAlarmCapability(): Promise<{ available: boolean }>;
  /** Build and launch the ACTION_SET_ALARM intent. Resolves once launched. */
  setAlarm(options: PhoneAlarmSetOptions): Promise<{ launched: boolean }>;
  /** Open the system ringtone picker (alarm sounds). */
  pickSystemRingtone(options?: { existingUri?: string }): Promise<PickedTone>;
  /** Open the system document picker filtered to audio files. */
  pickAudioFile(): Promise<PickedTone>;
  /** Check whether a stored tone URI is still readable. */
  validateToneUri(options: { uri: string }): Promise<{ accessible: boolean; name: string | null }>;
  /** Briefly preview a tone URI. Stops any previous preview. */
  previewTone(options: { uri: string }): Promise<void>;
  /** Stop an in-progress tone preview. */
  stopPreview(): Promise<void>;
}

export const NomaAlarm = registerPlugin<NomaAlarmPluginInterface>("NomaAlarm");

/** Rejection codes surfaced by the native bridge. */
export const PHONE_ALARM_ERRORS = {
  NO_ALARM_APP: "NO_ALARM_APP",
  USER_CANCELLED: "USER_CANCELLED",
  TONE_UNAVAILABLE: "TONE_UNAVAILABLE",
} as const;

/** Phone-alarm controls are only offered on native Android. */
export function isPhoneAlarmSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function resolveAlertType(reminder?: Reminder | null): ReminderAlertType {
  return reminder?.alertType === "phone-alarm" ? "phone-alarm" : "notification";
}

export function resolveToneMode(reminder?: Reminder | null): AlarmToneMode {
  const mode = reminder?.alarmToneMode;
  return mode === "system-picker" || mode === "custom" ? mode : "system";
}

export function phoneAlarmErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function isUserCancelled(error: unknown): boolean {
  return phoneAlarmErrorCode(error) === PHONE_ALARM_ERRORS.USER_CANCELLED;
}

/**
 * Options carried from the reminder dialog into setNoteReminder when the user
 * picks the phone-alarm alert type.
 */
export interface PhoneAlarmSaveOptions {
  alertType: ReminderAlertType;
  alarmToneMode: AlarmToneMode;
  alarmToneUri?: string | undefined;
  alarmToneName?: string | undefined;
  alarmVibrate: boolean;
}

export function buildPhoneAlarmSetOptions(
  scheduledAt: number,
  noteTitle: string,
  saveOptions: PhoneAlarmSaveOptions,
): PhoneAlarmSetOptions {
  const date = new Date(scheduledAt);
  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    message: `Noma: ${noteTitle}`,
    vibrate: saveOptions.alarmVibrate,
    ringtoneUri: saveOptions.alarmToneUri || undefined,
  };
}
