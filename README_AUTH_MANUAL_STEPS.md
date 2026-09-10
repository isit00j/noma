# Google Sign-In Native Android Configuration

Because the native Google Sign-In implementation relies on the official Google Identity Services framework for Android, you must explicitly configure a native Android OAuth client in Google Cloud Console.

### CI Build & GitHub Actions Keystore Requirements

By default, GitHub Actions runners generate a random ephemeral `debug.keystore` on every run, resulting in an unpredictable SHA-1 that causes Google Sign-In to fail with `DEVELOPER_ERROR`.
To fix this, a stable debug keystore must be provisioned for CI.

1. Generate a stable keystore (or encode your local `debug.keystore`) as base64:
   ```bash
   base64 -w 0 ~/.android/debug.keystore > keystore.b64
   ```
2. Navigate to your GitHub Repository **Settings > Secrets and variables > Actions**.
3. Create a new Repository Secret named `ANDROID_DEBUG_KEYSTORE_BASE64` containing the base64 output.
4. CI builds will now use this stable keystore, meaning the resulting APK will have a consistent, deterministic SHA-1.

Before deploying the Android app to production or when configuring the development environment, follow these steps:

1. **Obtain the SHA-1 Certificate Fingerprint**
   Extract the SHA-1 fingerprint from your stable CI debug keystore (for development) or production release keystore (for release) using the following command:
   ```bash
   keytool -list -v -keystore <path-to-your-keystore> -alias <your-key-alias>
   ```

2. **Register the Android Client ID in Google Cloud Console**
   - Go to the **Google Cloud Console**.
   - Select your project.
   - Navigate to **APIs & Services** > **Credentials**.
   - Click **Create Credentials** > **OAuth client ID**.
   - Select **Android** as the Application type.
   - Enter your Package Name exactly as: `app.noma.notes`
   - Paste the SHA-1 fingerprint you obtained in Step 1.
   - Save your changes.

3. **Provide the Firebase Web Client ID**
   For native Android Google Sign-in to produce an ID Token compatible with Firebase Auth, it must be initialized using the exact **Web client ID** associated with the Firebase project.
   - In Google Cloud Console, under **OAuth 2.0 Client IDs**, find the auto-created Web client ID (usually named "Web client (auto created by Google Service)").
   - Copy this Client ID.
   - Paste it into `src/config/firebaseConfig.ts` for the `firebaseWebClientId` variable.

Note: Native Android Google Sign-In requires both the Android Client ID (to authenticate the app) and the Web Client ID (to generate the ID token) to successfully authenticate into Firebase natively.

# Google Drive Authorization Architecture

Noma uses incremental authorization to request Google Drive access only when the user explicitly chooses "Connect Google Drive".

### Web / PWA Architecture
- **Flow**: Google Identity Services (GIS) Web SDK token client (`window.google.accounts.oauth2.initTokenClient`).
- **Scope**: `https://www.googleapis.com/auth/drive.file` (least-privileged scope; allows access only to backup files created by Noma).
- **Requirements**:
  - The hosting domain (e.g., `https://mynoma.vercel.app` or `http://localhost:3000`) must be added under **Authorized JavaScript origins** for the Web OAuth Client ID in Google Cloud Console.

### Android Native Architecture
- **Flow**: Native Google Play Services authorization via `@shardev/capacitor-google-auth`.
- **Scope**: Incremental request for `https://www.googleapis.com/auth/drive.file` scope.
- **Key Details**:
  - Launches native Android Google Play Services account picker/consent dialog rather than a web browser window.
  - Avoids browser `origin_mismatch` errors on Capacitor apps.
  - Leverages `GoogleAuth.getToken()` for silent re-authorization and `GoogleAuth.login()` for user consent.
  - Access tokens are stored strictly short-lived in memory (`accessToken`) and never persisted to local storage or logs.

### Required Google Cloud Configuration for Google Drive
1. **Enable Google Drive API**:
   - Go to Google Cloud Console > **APIs & Services** > **Library**.
   - Search for **Google Drive API** and click **Enable**.
2. **OAuth Consent Screen**:
   - Under **OAuth consent screen** > **Data Access / Scopes**, ensure `https://www.googleapis.com/auth/drive.file` is added to non-sensitive scopes.

---

# Web & PWA Firebase Authorized Domains Configuration

To securely handle Firebase Authentication redirects for the progressive web app (which blocks cross-origin iframe storage via Safari ITP / 3rd-party cookie deprecation), this project proxies the Firebase Auth helper endpoints on the primary application domain.

You must manually update your Firebase and Google Cloud configurations to authorize this proxied domain for the Web App:

1. **Firebase Authorized Domains**
   - Go to the **Firebase Console**.
   - Select your project.
   - Navigate to **Authentication** > **Settings** > **Authorized domains**.
   - Click **Add domain** and enter `mynoma.vercel.app`.

2. **Google Cloud OAuth Redirect URIs**
   Because the Web App's `authDomain` is overridden to `mynoma.vercel.app`, the authentication helper initiates the Web Google OAuth request with the proxied callback URL. Google will reject the request with `redirect_uri_mismatch` if this URL is not explicitly authorized.
   - Go to the **Google Cloud Console**.
   - Select your project.
   - Navigate to **APIs & Services** > **Credentials**.
   - Under **OAuth 2.0 Client IDs**, select your existing **Web application** client (the one used for Firebase Auth).
   - Under **Authorized redirect URIs**, click **Add URI**.
   - Enter exactly: `https://mynoma.vercel.app/__/auth/handler`
   - Save your changes.
