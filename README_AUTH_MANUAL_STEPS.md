# Google Sign-In Native Android Configuration

Because the native Google Sign-In implementation relies on the official Google Identity Services framework for Android, you must configure a native Android OAuth client in Google Cloud Console.

Before deploying to production, follow these steps:

1. **Obtain the SHA-1 Certificate Fingerprint**
   Extract the SHA-1 fingerprint from your production release keystore using the following command:
   ```bash
   keytool -list -v -keystore <path-to-your-release-keystore> -alias <your-key-alias>
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

Note: Native Android Google Sign-In requires this specific Android OAuth Client ID to exist in your Google Cloud Project to successfully authenticate native tokens.

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
