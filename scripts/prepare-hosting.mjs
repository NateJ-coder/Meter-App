import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, '.firebase-hosting');
const publicFiles = [
    'capture-dashboard.html',
    'capture-login.html',
    'manifest.webmanifest',
    'service-worker.js',
    'assets/styles.css',
    'assets/capture-dashboard.js',
    'assets/capture-login.js',
    'assets/firebase.js',
    'assets/install-dashboard.js',
    'assets/images/Fuzio logo.jpg'
];

await rm(outputRoot, { recursive: true, force: true });

for (const relativePath of publicFiles) {
    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(projectRoot, relativePath), destination);
}

console.log(`Prepared ${publicFiles.length} public files in ${outputRoot}`);