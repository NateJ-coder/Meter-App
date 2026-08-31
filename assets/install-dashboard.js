let installPrompt;

const installGroup = document.getElementById('install-group');
const installButton = document.getElementById('install-btn');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch((error) => {
            console.error('Dashboard service worker registration failed:', error);
        });
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installGroup.hidden = false;
});

installButton.addEventListener('click', async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installGroup.hidden = true;
});

window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installGroup.hidden = true;
});