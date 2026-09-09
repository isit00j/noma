# Android App Links Configuration

Because the SHA-256 fingerprint for the production signing certificate could not be definitively determined from the repository code, you must perform the following manual steps before deploying the application to production:

1. Obtain the SHA-256 fingerprint from your release keystore using the following command:
   ```bash
   keytool -list -v -keystore <path-to-your-release-keystore> -alias <your-key-alias>
   ```

2. Create a file at `public/.well-known/assetlinks.json` with the following content (replacing the placeholder with your actual fingerprint):
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "app.noma.notes",
         "sha256_cert_fingerprints": [
           "<YOUR-ACTUAL-SHA256-FINGERPRINT>"
         ]
       }
     }
   ]
   ```

3. Ensure this file is deployed to `https://mynoma.vercel.app/.well-known/assetlinks.json`.

# Firebase & Google OAuth Configuration

To securely handle Firebase Authentication redirects for the progressive web app (which blocks cross-origin iframe storage via Safari ITP / 3rd-party cookie deprecation), this project optionally proxies the Firebase Auth helper endpoints on the primary application domain.

This prevents PWA users from getting stuck on "Connecting...", as Firebase can natively retrieve its authentication session without violating cross-origin constraints. Note that the Capacitor Android app uses the default `firebaseapp.com` authDomain precisely to ensure it opens in the external system browser instead of the internal WebView.

You must manually update your Firebase and Google Cloud configurations to authorize this proxied domain for the Web App:

1. **Firebase Authorized Domains**
   - Go to the **Firebase Console**.
   - Select your project.
   - Navigate to **Authentication** > **Settings** > **Authorized domains**.
   - Click **Add domain** and enter `mynoma.vercel.app`.

2. **Google Cloud OAuth Redirect URIs**
   Because the Web App's `authDomain` is overridden to `mynoma.vercel.app`, the authentication helper initiates the Google OAuth request with the proxied callback URL. Google will reject the request with `redirect_uri_mismatch` if this URL is not explicitly authorized.
   - Go to the **Google Cloud Console**.
   - Select your project.
   - Navigate to **APIs & Services** > **Credentials**.
   - Under **OAuth 2.0 Client IDs**, select your existing Web client (the one used for Firebase Auth).
   - Under **Authorized redirect URIs**, click **Add URI**.
   - Enter exactly: `https://mynoma.vercel.app/__/auth/handler`
   - Save your changes.
