# Noma

[![Live Demo](https://img.shields.io/badge/Web_App-mynoma.vercel.app-blue?style=flat-square&logo=vercel)](https://mynoma.vercel.app)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android-brightgreen?style=flat-square)](#technology-stack)
[![Offline First](https://img.shields.io/badge/Offline--First-IndexedDB%20%2B%20Serwist-orange?style=flat-square)](#privacy--security)

> **Calm, offline-first note-taking for Web, PWA, and Android.**

Noma is a minimalist, local-first note-taking application designed to provide a calm, distraction-free environment for your thoughts, ideas, and data. Operating with an offline-first philosophy, Noma ensures your notes remain accessible, responsive, and stored directly on your device—whether you're working in a web browser, installed as a Progressive Web App (PWA), or running natively on Android.

---

## Table of Contents

- [Overview](#noma-overview)
- [Features](#current-features)
  - [Rich Text & Editor](#notes--editor)
  - [Organization](#organization)
  - [Reminders & Notifications](#reminders)
  - [Advanced Charts & Graphs](#advanced-charts--graphs)
  - [Images & Attachments](#images--attachments)
  - [Security & App Lock](#security)
  - [Backup & Restore](#backup--restore)
  - [Authentication & Cloud Sync](#authentication--cloud)
  - [Android Application](#android)
  - [Web & PWA](#webpwa)
  - [Developer Contact](#contact--feedback)
- [Privacy & Security](#privacy--security)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Android Development](#android-development)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Project Status](#project-status)
- [License](#license)

---

## Noma Overview

Noma is built around a local-first architecture where device storage (IndexedDB) acts as the primary source of truth. Unlike cloud-centric note applications that require constant connectivity, Noma works seamlessly offline.

### Core Philosophy
* **Offline-First Storage:** All notes, attachments, reminders, and settings are saved locally instantly.
* **Calm Interface:** Clean design powered by Tiptap and Tailwind CSS, focusing on productivity without distraction.
* **Device Independence:** Run Noma as a web app, install it as a desktop/mobile PWA, or use the native Android APK.
* **User Control:** Optional account synchronization via Firebase and back up directly to your own Google Drive or local ZIP archives.

---

## Current Features

### Notes & Editor
* **Tiptap Rich Text Editor:** Powered by a modern block editor supporting clean typography and markdown-like syntax.
* **Formatting Controls:** Bold, italic, underline, strike-through, code inline, text colors, and highlights.
* **Headings:** Structured heading support (H1, H2, H3).
* **Lists & Checklists:** Bulleted lists, numbered lists, and interactive task checklists.
* **Links & Quotes:** URL link embedding, blockquotes, and styled code blocks.
* **Dividers & Tables:** Horizontal rule dividers and full rich-text tables with customizable rows, columns, and headers.
* **Image Embedding:** Local photo uploads with client-side canvas compression and inline web image URLs.

### Organization
* **Folders & Tags:** Group notes inside folders or tag them for multi-dimensional organization.
* **Favorites & Pinned Notes:** Pin crucial notes to the top of your workspace or mark favorites for quick access.
* **Instant Search & Filtering:** Full-text instant search across title and content, with tag and folder filters.
* **Archive & Trash:** Archive inactive notes or move deleted notes to trash before permanent deletion.

### Reminders
* **Note Reminders:** Attach scheduled reminders directly to individual notes with custom date and time pickers.
* **Dedicated Reminders View:** Centrally view all upcoming, due, and completed reminders.
* **Local Notifications:** Trigger native system notifications on Android (via `@capacitor/local-notifications`) and Web Notifications on PWA/Desktop.
* **Status Lifecycle:** Mark reminders complete, dismiss them, or reschedule for a future date/time.

### Advanced Charts & Graphs
* **Structured Editable Charts:** Offline interactive chart blocks powered by Recharts (Schema v2).
* **Multi-Series Data Matrix:** Spreadsheet-style table editor within note dialogs, supporting TSV clipboard pasting.
* **7 Chart Types:** Bar, Line, Area, Pie, Donut, Radar, and Composed charts (with per-series rendering options).
* **Customization Options:** Custom chart titles, subtitles, legend positioning, gridlines, stacked bar mode, custom color swatches, and axis labeling.
* **Live Preview:** Real-time chart preview while editing data or configuration.
* **Full Persistence:** Dynamic JSON parsing guards ensure safe note rehydration and lossless ZIP backup/restore.

### Images & Attachments
* **Local Attachment Storage:** Device photos uploaded to Dexie `db.attachments` with custom `noma-attachment://` URI references.
* **Canvas Compression & Resizing:** Client-side photo resizing and quality compression prior to local storage.
* **Attachment Reconciliation:** Automated background cleanup of orphaned attachments with creation grace periods to conserve storage.
* **Backup & Restore:** Full binary attachment preservation inside exported ZIP backups.

### Security
* **App Lock System:** Guard application entry with local credential verification (PBKDF2-HMAC-SHA256).
* **Multiple Unlock Methods:** Unlock via Noma Pattern, Noma Password, or native Android Biometrics (`androidx.biometric`).
* **Rate Limiting & Lockout:** Protection against brute-force attempts with exponential lockout delays up to 30 minutes.
* **Configurable Lock Timeout:** Set automatic re-locking timers (immediate, 1 min, 5 mins, 15 mins, etc.).
* **Launcher Shortcut Security:** Launcher shortcuts enforce active App Lock authentication before exposing note creation views.
* **Credential Sanitization:** Security credential hashes and salts are strictly stripped during backup export to prevent hash leakage.

### Backup & Restore
* **Local ZIP Backups:** Export full database backups (notes, attachments, reminders, tables, charts) into compressed `.zip` files.
* **Android SAF Integration:** Storage Access Framework tree picker support on Android 10+ for native file destination selection.
* **Google Drive Integration:** Direct cloud backup export/import to your personal Google Drive (via OAuth 2.0 GIS on Web, native authorization client on Android).
* **Sanitized Exports:** App Lock password/pattern hashes are excluded from backup payloads for total security.

### Authentication & Cloud
* **Firebase Authentication:** Secure authentication supporting Email/Password (with verification flow) and Google Sign-In.
* **Native Android Auth:** Uses `@shardev/capacitor-google-auth` for native Google Sign-In bypassing mobile webview limits.
* **Account-Isolated Storage:** Database separation (`noma_guest` vs `noma_<uid>`) ensuring total isolation between user accounts.
* **Guest Migration:** Smoothly transfer guest data into a newly created account upon sign-in.

### Android
* **Native Mobile Experience:** Capacitor 7 Android app built with native components and lifecycle integration.
* **Biometric Lock:** Strong biometric hardware authentication (`BIOMETRIC_STRONG`).
* **Launcher Shortcut:** Static launcher shortcut ("Note") triggering deep-link URI `app.noma.notes://new-note`.
* **SAF Storage:** Native Base64 chunked file streaming for Android Storage Access Framework exports.

### Web/PWA
* **Progressive Web App:** Built with Serwist service worker for instant cold start and full offline availability.
* **IndexedDB Persistence:** High-performance local storage via Dexie.js.
* **Production Deployment:** Deployed on Vercel at [https://mynoma.vercel.app](https://mynoma.vercel.app).

### Contact & Feedback
Users can reach out directly to developer Jubayer for bug reports, feature requests, questions, or feedback:
* **Email:** [dev.jubayer00j@gmail.com](mailto:dev.jubayer00j@gmail.com)
* **Telegram:** [t.me/jubayer00j](https://t.me/jubayer00j)
* **Messenger:** [m.me/jubayer00j](https://m.me/jubayer00j)
* **WhatsApp:** [+8801610017288](https://wa.me/+8801610017288)

---

## Privacy & Security

Noma prioritizes user privacy through a local-first design:

* **Local Data Storage:** Notes and attachments are stored in your browser's IndexedDB or device storage. Data is not uploaded to third-party servers unless you explicitly sign in to Firebase or initiate a Google Drive backup.
* **App Lock vs Encryption:** App Lock provides local access control (verifying password/pattern hashes locally and triggering biometric prompts). *App Lock acts as an access barrier; it is not encryption-at-rest.*
* **Sanitized Exports:** Backup archives sanitize security credentials to ensure export files never contain password or pattern hashes.

---

## Technology Stack

| Category | Technology |
| :--- | :--- |
| **Framework & UI** | React 19, TypeScript, TanStack Start, TanStack Router |
| **Styling** | Tailwind CSS v4, Radix UI Primitives, Lucide Icons |
| **Rich Text Editor** | Tiptap Editor (`@tiptap/react`, StarterKit, Tables, Tasks, Highlights) |
| **Data & Charts** | Recharts, Dexie.js (IndexedDB wrapper) |
| **PWA & Offline** | Serwist (`@serwist/vite`, `@serwist/build`), Vite |
| **Authentication & Cloud** | Firebase Auth, Google Identity Services, Google Drive API |
| **Mobile Integration** | Capacitor 7 (`@capacitor/core`, `@capacitor/android`), `@shardev/capacitor-google-auth`, `@capacitor/local-notifications` |

---

## Quick Start

### Prerequisites
* **Node.js:** v18.0.0 or higher
* **npm** or **bun**

### Installation & Development Commands

1. **Clone the repository:**
   ```bash
   git clone https://github.com/isit00j/noma.git
   cd noma
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local development server:**
   ```bash
   npm run dev
   ```
   *Access the app at `http://localhost:5173`.*

4. **Production PWA Build:**
   ```bash
   npm run build
   ```
   *Runs `scripts/build-pwa.mjs` to produce optimized Vite client bundle and Serwist service worker.*

5. **Vite Production Build (Standard):**
   ```bash
   npm run build:vite
   ```

6. **Lint Codebase:**
   ```bash
   npm run lint
   ```

7. **Format Codebase:**
   ```bash
   npm run format
   ```

---

## Android Development

The native Android application is integrated using Capacitor 7 and resides in the `android/` directory.

### Build Steps

1. **Sync Capacitor Web Assets:**
   ```bash
   npm run build
   npx cap sync android
   ```

2. **Compile Android Debug APK:**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   *The generated APK will be located at `android/app/build/outputs/apk/debug/app-debug.apk`.*

3. **GitHub Actions CI:**
   Automated debug APK builds are configured in `.github/workflows/android.yml`.

---

## Project Structure

```
noma/
├── android/                   # Capacitor 7 Android native project
│   ├── app/src/main/          # Java plugins, biometric auth, manifest, shortcuts
│   └── gradlew                # Gradle build script
├── public/                    # Static assets, icons, manifest
├── scripts/                   # Build scripts (e.g., build-pwa.mjs)
├── src/
│   ├── components/            # React UI components
│   │   ├── noma/              # Noma features (editor, charts, lock, reminders, drive)
│   │   └── ui/                # Radix UI primitives & components
│   ├── lib/
│   │   └── noma/              # Core logic (Dexie DB, App Lock, Auth, Drive, Backup, Shortcuts)
│   ├── routes/                # TanStack Router file-based routes
│   └── sw.ts                  # Serwist PWA service worker entrypoint
├── capacitor.config.ts        # Capacitor configuration
├── package.json               # Dependencies and scripts
├── vite.config.ts             # Vite configuration
└── README.md                  # Application documentation
```

---

## Contributing

Contributions are welcome! If you find a bug or have an idea for a feature, feel free to open an issue or submit a pull request.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## Project Status

* **Web Application:** Fully functional production PWA live at [https://mynoma.vercel.app](https://mynoma.vercel.app).
* **Offline Storage:** Fully operational using IndexedDB local storage and Serwist service worker caching.
* **Android Application:** Android native application fully built using Capacitor 7 with local notification support, biometric App Lock, Storage Access Framework backups, and launcher shortcuts.

---

## License

Noma is open-source software. Please check the repository repository settings or contact the maintainer for license terms.
