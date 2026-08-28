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
  apiKey: "AIzaSyC6sEQpvGn3HYmW9RTeS4SAlfpWkSf_wQM",
  authDomain: "noma-note.firebaseapp.com",
  projectId: "noma-note",
  storageBucket: "noma-note.firebasestorage.app",
  messagingSenderId: "453389463270",
  appId: "1:453389463270:web:72efa216b515fedf125527",
};

/**
 * Optional and completely separate from Firebase Google Sign-In:
 * the Google Cloud OAuth 2.0 Web client ID used only for Google Drive backups
 * (scope: https://www.googleapis.com/auth/drive.file). Leave empty to disable.
 */
export const googleDriveClientId =
  "453389463270-ja6ebprburb7j0smhpa2kqthg6ngt2o0.apps.googleusercontent.com";
