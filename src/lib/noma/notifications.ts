import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Reminder } from "./types";

export interface NotificationCapability {
  supported: boolean;
  canScheduleBackground: boolean;
  permissionGranted: boolean;
  permissionState: "granted" | "denied" | "prompt" | "unsupported";
  reason?: string;
}

export async function checkNotificationCapability(): Promise<NotificationCapability> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const status = await LocalNotifications.checkPermissions();
      const granted = status.display === "granted";
      return {
        supported: true,
        canScheduleBackground: true,
        permissionGranted: granted,
        permissionState: granted ? "granted" : status.display === "denied" ? "denied" : "prompt",
      };
    } catch {
      return {
        supported: false,
        canScheduleBackground: false,
        permissionGranted: false,
        permissionState: "unsupported",
        reason: "Local notifications plugin unavailable.",
      };
    }
  }

  // Web / PWA Environment
  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      supported: false,
      canScheduleBackground: false,
      permissionGranted: false,
      permissionState: "unsupported",
      reason: "Browser notifications are not supported on this device/browser.",
    };
  }

  const permission = Notification.permission;
  const granted = permission === "granted";
  const permissionState = permission === "default" ? "prompt" : permission;

  return {
    supported: true,
    // Web notifications only guarantee background delivery if supported by Service Worker / Notification API while browser context is active.
    canScheduleBackground: false,
    permissionGranted: granted,
    permissionState: permissionState,
    reason:
      "Web notifications fire while Noma is open or active in browser. Scheduled background delivery requires full PWA/browser support.",
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    } catch {
      return false;
    }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }

  return false;
}

// In-memory web timer store for active session scheduling on web
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Generates a numeric 32-bit positive integer ID for Capacitor Local Notifications from a string UUID.
 */
function hashNotificationId(reminderId: string): number {
  let hash = 0;
  for (let i = 0; i < reminderId.length; i++) {
    const char = reminderId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export async function scheduleNotification(reminder: Reminder): Promise<number | undefined> {
  const isNative = Capacitor.isNativePlatform();
  const notifId = reminder.notificationId ?? hashNotificationId(reminder.id);

  const capability = await checkNotificationCapability();
  if (!capability.permissionGranted) {
    return notifId;
  }

  const scheduledDate = new Date(reminder.scheduledAt);

  // PRIVACY REQUIREMENT: Do not leak sensitive note content in notification text.
  const title = "Reminder from Noma";
  const body = "You have a scheduled note reminder.";

  if (isNative) {
    try {
      // Cancel any prior notification with same ID first
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] }).catch(() => {});

      if (reminder.scheduledAt > Date.now()) {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title,
              body,
              schedule: { at: scheduledDate },
              extra: { noteId: reminder.noteId, reminderId: reminder.id },
            },
          ],
        });
      }
    } catch (e) {
      console.warn("Failed to schedule local notification on Android:", e);
    }
    return notifId;
  }

  // Web/PWA Implementation
  if (webTimers.has(reminder.id)) {
    clearTimeout(webTimers.get(reminder.id));
    webTimers.delete(reminder.id);
  }

  const delay = reminder.scheduledAt - Date.now();
  if (delay > 0) {
    const timer = setTimeout(() => {
      webTimers.delete(reminder.id);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: "/noma-icon-192.png",
            tag: reminder.id,
          });
        } catch (e) {
          console.warn("Failed to deliver Web Notification:", e);
        }
      }
    }, delay);

    webTimers.set(reminder.id, timer);
  }

  return notifId;
}

export async function cancelNotification(
  reminderId: string,
  notificationId?: number,
): Promise<void> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    const notifId = notificationId ?? hashNotificationId(reminderId);
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
    } catch (e) {
      console.warn("Failed to cancel local notification:", e);
    }
  }

  if (webTimers.has(reminderId)) {
    clearTimeout(webTimers.get(reminderId));
    webTimers.delete(reminderId);
  }
}
