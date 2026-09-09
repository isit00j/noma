# Android App Links Configuration

Because the SHA-256 fingerprint for the production signing certificate could not be definitively determined, you must perform the following manual steps before deploying:

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
