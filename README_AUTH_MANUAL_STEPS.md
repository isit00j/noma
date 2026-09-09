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

# Firebase Authorized Domains Configuration

The Capacitor application is configured with `server.hostname` set to `mynoma.vercel.app`. This ensures that when Firebase initiates OAuth authentication within the app, it reports `https://mynoma.vercel.app` as the **origin URL**.

The actual Firebase `authDomain` remains `noma-note.firebaseapp.com`. Google will return authentication data to the helper page at `https://noma-note.firebaseapp.com/__/auth/handler`. The helper page will then redirect the system browser back to the **origin URL**, which is `https://mynoma.vercel.app/signin`.

Because Firebase only allows this redirect flow if the **origin URL** is explicitly authorized, you must ensure that `mynoma.vercel.app` is added to your Firebase project's Authorized Domains:

1. Go to the Firebase Console.
2. Select your project.
3. Navigate to **Authentication** > **Settings** > **Authorized domains**.
4. Click **Add domain** and enter `mynoma.vercel.app`.
