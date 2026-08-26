/**
 * Firebase Web App configuration.
 *
 * These six values are PUBLIC client-side configuration (Firebase console >
 * Project settings > Your apps > SDK setup and configuration). They are safe to
 * commit and ship in the frontend — access is controlled by Firebase Auth
 * settings and security rules, not by hiding these strings.
 *
 * NEVER put Firebase Admin SDK credentials, service-account JSON, private keys,
 * or OAuth client secrets in this file.
 *
 * >>> PASTE YOUR SIX VALUES BELOW <<<
 */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

/**
 * Optional and completely separate from Firebase Google Sign-In:
 * the Google Cloud OAuth 2.0 Web client ID used only for Google Drive backups
 * (scope: https://www.googleapis.com/auth/drive.file). Leave empty to disable.
 */
export const googleDriveClientId = "";
