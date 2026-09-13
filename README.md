# Noma

[![Live Demo](https://img.shields.io/badge/Web_App-mynoma.vercel.app-blue?style=flat-square&logo=vercel)](https://mynoma.vercel.app)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android-brightgreen?style=flat-square)](#technology-stack)
[![Offline First](https://img.shields.io/badge/Offline--First-IndexedDB%20%2B%20Serwist-orange?style=flat-square)](#privacy--security)

> **Calm, offline-first note-taking for Web, PWA, and Android.**

Noma is a minimalist note-taking application designed to provide a calm, distraction-free environment for your thoughts, ideas, and data. Built with a local-first orientation, Noma allows your notes, attachments, and reminders to be stored directly on your device (via IndexedDB)—whether you are working in a web browser, installed as a Progressive Web App (PWA), or running natively on Android.

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
  - [Authentication & Cloud Backups](#authentication--cloud-backups)
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

Noma is built around a local-first architecture where device storage (IndexedDB via Dexie.js) acts as the primary data store. Unlike cloud-centric note applications that depend on active network connectivity for core operations, Noma is designed to function offline.

### Core Design Principles
* **Local Device Storage:** Notes, attachments, reminders, and settings are saved locally to IndexedDB.
* **Calm Interface:** Clean design powered by Tiptap and Tailwind CSS, focusing on productivity without clutter.
* **Cross-Platform Availability:** Run Noma in a web browser, install it as a desktop/mobile PWA, or run the native Android build.
* **User-Driven Cloud Backups:** Optionally sign in to Firebase for user accounts and export backup archives to Google Drive or local `.zip` files.

---

## Current Features

### Notes & Editor
* **Tiptap Rich Text Editor:** Powered by a modern block editor supporting clean typography and markdown-like formatting shortcuts.
* **Formatting Controls:** Bold, italic, underline, strike-through, inline code, text colors, and highlights.
* **Headings:** Structured heading levels (H1, H2, H3).
* **Lists & Checklists:** Bulleted lists, numbered lists, and interactive task checklists.
* **Links & Quotes:** URL hyperlinking, blockquotes, and styled code blocks.
* **Dividers & Tables:** Horizontal rule dividers and rich-text tables with customizable rows, columns, and headers.
* **Image Embedding:** Local photo uploads with client-side canvas compression and inline web image URLs.

### Organization
* **Folders & Tags:** Group notes inside folders or tag them for flexible categorization.
* **Favorites & Pinned Notes:** Pin important notes to the top of your workspace or mark favorites for quick access.
* **Instant Search & Filtering:** Full-text search across titles and content, alongside tag and folder filtering.
* **Archive & Trash:** Archive inactive notes or move notes to trash before permanent deletion.

### Reminders
* **Note Reminders:** Attach scheduled reminders directly to individual notes using a date and time picker.
* **Dedicated Reminders View:** Centrally view all upcoming, due, and completed note reminders.
* **Local Notifications:** Trigger native system notifications on Android (via `@capacitor/local-notifications`) and Web Notifications on PWA/Desktop.
* **Status Lifecycle:** Complete, dismiss, or reschedule reminders for a future date/time.

### Advanced Charts & Graphs
* **Structured Editable Charts:** Interactive offline chart blocks powered by Recharts (Schema v2).
* **Multi-Series Data Matrix:** Spreadsheet-style table editor within note dialogs, supporting TSV clipboard pasting.
* **7 Chart Types:** Bar, Line, Area, Pie, Donut, Radar, and Composed charts (with per-series type configuration where supported).
* **Customization Options:** Custom titles, subtitles, legend position, gridlines, stacked bar mode, custom color swatches, and axis labeling.
* **Live Preview:** Real-time chart rendering while editing data matrix or options.
* **Persistence:** Preserved across note saves, rehydration, and ZIP backup exports/imports.

### Images & Attachments
* **Local Attachment Storage:** Device photos stored in Dexie `db.attachments` using custom `noma-attachment://` URI references.
* **Canvas Compression & Resizing:** Client-side photo resizing and quality compression prior to storage.
* **Attachment Reconciliation:** Automated background cleanup of unreferenced attachments to manage local storage usage.
* **Backup & Restore:** Binary image attachments are bundled within local ZIP backup archives and Google Drive backups.

### Security
* **App Lock System:** Guard application entry with local credential verification (PBKDF2-HMAC-SHA256).
* **Unlock Options:** Unlock via Noma Pattern, Noma Password, or native Android Biometrics (`androidx.biometric`).
* **Rate Limiting & Lockout:** Protection against repeated failed unlock attempts with exponential lockout delays up to 30 minutes.
* **Configurable Lock Timeout:** Set automatic re-locking timers (immediate, 1 min, 5 mins, 15 mins, etc.).
* **Launcher Shortcut Protection:** Launcher shortcuts check active App Lock authentication before presenting note creation views.
* **Security Credential Handling:** Security credential hashes and salts are omitted from backup export payloads.

### Backup & Restore
* **Local ZIP Backups:** Export database backups (notes, attachments, reminders, tables, charts) into compressed `.zip` files.
* **Android SAF Integration:** Storage Access Framework tree picker support on Android 10+ for native file destination selection.
* **Google Drive Cloud Backups:** Export and restore backup archives to/from personal Google Drive (via OAuth 2.0 GIS on Web, native authorization client on Android).
* **Security Exclusions:** Password and pattern credential hashes are explicitly excluded from backup payloads.

### Authentication & Cloud Backups
* **Firebase Authentication:** Optional user account sign-in supporting Email/Password (with verification flow) and Google Sign-In.
* **Native Android Auth:** Uses `@shardev/capacitor-google-auth` for native Google Sign-In on Android.
* **Account Isolation:** Database separation (`noma_guest` vs `noma_<uid>`) isolating data between signed-in accounts and guest mode.
* **Guest Data Migration:** Transfer guest notes into a newly authenticated user database upon sign-in.
* *Note:* Firebase is used strictly for authentication and account management. Cloud note storage is performed via explicit Google Drive backup exports rather than background real-time sync.

### Android
* **Native Mobile Integration:** Built with Capacitor 7 for native Android components and lifecycle handling.
* **Biometric Lock:** Hardware biometric authentication support (`BIOMETRIC_STRONG`).
* **Launcher Shortcut:** Static launcher shortcut ("Note") opening deep-link URI `app.noma.notes://new-note`.
* **SAF File Streaming:** Native Base64 chunked file streaming for Android Storage Access Framework exports.

### Web/PWA
* **Progressive Web App:** Offline accessibility powered by a Serwist service worker.
* **IndexedDB Persistence:** Local storage via Dexie.js.
* **Production Deployment:** Live web application deployed at [https://mynoma.vercel.app](https://mynoma.vercel.app).

### Contact & Feedback
Feedback, bug reports, and feature suggestions are welcome:
* **In-App Contact:** Access the Contact & Feedback view directly within Noma's settings menu.
* **Public Developer Contacts:**
  * **Email:** [dev.jubayer00j@gmail.com](mailto:dev.jubayer00j@gmail.com)
  * **Telegram:** [t.me/jubayer00j](https://t.me/jubayer00j)
  * **Messenger:** [m.me/jubayer00j](https://m.me/jubayer00j)
  * **WhatsApp:** [+8801610017288](https://wa.me/+8801610017288)

---

## Privacy & Security

Noma prioritizes data privacy:

* **Local Data Primary Store:** Notes and attachments reside in your device's IndexedDB storage. Data is not transmitted to external cloud servers unless you sign in to Firebase or initiate a Google Drive backup export.
* **App Lock vs Encryption:** App Lock acts as a local UI access control barrier (verifying password/pattern hashes locally and triggering biometric prompts). *App Lock does not provide encryption-at-rest.*
* **Backup Security:** App Lock credential hashes are excluded from backup exports to ensure exported files do not contain authentication hashes.

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

### Development Commands

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
   *Access the application at `http://localhost:5173`.*

4. **Production PWA Build:**
   ```bash
   npm run build
   ```
   *Executes `scripts/build-pwa.mjs` to generate the Vite client bundle and Serwist service worker.*

5. **Vite Production Build:**
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

The native Android project is managed using Capacitor 7 and located in the `android/` directory.

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
   *Output APK location: `android/app/build/outputs/apk/debug/app-debug.apk`.*

3. **GitHub Actions CI:**
   Automated debug APK workflow is configured in `.github/workflows/android.yml`.

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

Contributions are welcome! If you encounter an issue or wish to propose an enhancement:

1. Fork the repository (`https://github.com/isit00j/noma`).
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## Project Status

* **Web Application:** Production PWA live at [https://mynoma.vercel.app](https://mynoma.vercel.app).
* **Offline Storage:** Operating via IndexedDB storage and Serwist service worker caching.
* **Android Application:** Integrated native Android build using Capacitor 7 featuring local notifications, biometric App Lock, Storage Access Framework backups, and launcher shortcuts.

---

## License

No license has been specified yet.
