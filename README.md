# Noma

Noma is a minimalist note-taking app that works fully offline, stores notes on your device, and backs up to Google Drive.

## What Noma Does

Noma provides a calm, distraction-free environment for your thoughts. Current features include:
- **Rich Text Editing:** Create and edit notes with a clean, Tiptap-powered editor.
- **Organization:** Manage notes with folders, tags, favorites, and pinned notes.
- **Search & Filtering:** Quickly find notes across your workspace.
- **Archive & Trash:** Safely archive old notes or move them to the trash.
- **Authentication:** Secure sign-in via Firebase (Email/Password or Google Auth).
- **Backups:** Export your library to Google Drive for safekeeping.

## Offline-First / PWA

Noma is designed as an offline-first Progressive Web Application (PWA).
All of your data is stored locally on your device in an IndexedDB database (via Dexie), ensuring you can view, create, and edit notes without an internet connection. A service worker intelligently caches the application so it loads instantly even when offline.

The production web application is deployed on Vercel and can be accessed at:
[https://mynoma.vercel.app](https://mynoma.vercel.app)

## Technology Stack

Noma is built using modern web technologies:
- **Framework:** React / TypeScript / TanStack Start
- **Build Tooling:** Vite
- **Offline / Storage:** Dexie (IndexedDB) for local data, Serwist for service worker / PWA support
- **Styling & Components:** TailwindCSS, Radix UI, shadcn/ui
- **Authentication:** Firebase Auth
- **Deployment:** Vercel

## Android Application

Capacitor Android integration is currently in progress.
The Android application is built from the existing Noma application. The Android project is located in the `android/` directory. Android builds are being automated through GitHub Actions. Note that the Android app is not yet published or considered production-ready.

## Development

To work on Noma locally, you will need Node.js and npm installed.

1. **Clone the repository:**
   ```sh
   git clone <repository-url>
   cd <repository-name>
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Start the development server:**
   ```sh
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

4. **Build for production:**
   ```sh
   npm run build
   ```
   This command creates an optimized build of the PWA.

## Project Status

- **Web Application:** Production PWA is deployed and running smoothly on Vercel.
- **Offline Capabilities:** Fully implemented; local persistence via IndexedDB and service worker caching are active.
- **Mobile Application:** Capacitor Android development is currently in progress.
