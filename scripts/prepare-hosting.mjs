import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, '.firebase-hosting');
const publicFiles = [
    'capture-dashboard.html',
    'capture-login.html',
    'manifest.webmanifest',
    'service-worker.js',
    'version.json',
    'assets/styles.css',
    'assets/capture-dashboard.js',
    'assets/capture-login.js',
    'assets/firebase.js',
    'assets/install-dashboard.js',
    'assets/images/Fuzio logo.jpg'
];

await rm(outputRoot, { recursive: true, force: true });

// Copy standard public files
for (const relativePath of publicFiles) {
    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(projectRoot, relativePath), destination);
}

// Copy all APK files from downloads folder
const downloadsDir = path.join(projectRoot, 'downloads');
try {
    const files = await readdir(downloadsDir);
    const apkFiles = files.filter(f => f.endsWith('.apk'));
    
    if (apkFiles.length > 0) {
        const downloadsOutput = path.join(outputRoot, 'downloads');
        await mkdir(downloadsOutput, { recursive: true });
        
        for (const apkFile of apkFiles) {
            await cp(
                path.join(downloadsDir, apkFile),
                path.join(downloadsOutput, apkFile)
            );
        }
        console.log(`✓ Copied ${apkFiles.length} APK file(s) from downloads/`);
    }
} catch (err) {
    console.log('No downloads folder or APK files found (this is OK for initial setup)');
}

console.log(`✓ Prepared ${publicFiles.length} public files + APKs for deployment`);