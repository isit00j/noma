import { injectManifest } from '@serwist/build';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const buildRevision = process.env["VERCEL_GIT_COMMIT_SHA"] || Date.now().toString();

const isVercel = process.env.VERCEL === "1";
const globDir = isVercel ? path.resolve(rootDir, '.vercel/output/static') : path.resolve(rootDir, '.output/public');

const injectManifestOptions = {
    swSrc: path.resolve(rootDir, 'dist-sw/sw.js'), // Use bundled TS
    swDest: path.resolve(rootDir, '.output/public/sw.js'),
    globDirectory: globDir,
    globPatterns: [
        '**/*.{js,css,html,ico,png,svg,woff2,woff,json,webmanifest}'
    ],
    globIgnores: [
        '**/node_modules/**/*',
        'sw.js',
        'workbox-*.js'
    ],
    manifestTransforms: [
        async (manifestEntries) => {
            const filteredEntries = manifestEntries.filter(
                (e) => !e.url.includes("index.html")
            );

            filteredEntries.push({
                url: "index.html",
                revision: buildRevision,
                size: 0,
            });

            return { manifest: filteredEntries, warnings: [] };
        }
    ]
};

async function buildServiceWorker() {
    try {
        console.log('Bundling service worker with esbuild...');
        await esbuild.build({
          entryPoints: [path.resolve(rootDir, 'src/sw.ts')],
          bundle: true,
          outfile: path.resolve(rootDir, 'dist-sw/sw.js'),
          format: 'esm',
          target: 'es2022',
          define: {
            'process.env.NODE_ENV': '"production"',
            'import.meta.env.DEV': 'false',
          },
          minify: true
        });

        console.log('Building service worker with Serwist...');
        const { count, size, warnings } = await injectManifest(injectManifestOptions);

        warnings.forEach(warning => console.warn(warning));
        console.log(`Service worker built successfully! Precached ${count} files, totaling ${size} bytes.`);

    } catch (error) {
        console.error('Error building service worker:', error);
        process.exit(1);
    }
}

buildServiceWorker();
