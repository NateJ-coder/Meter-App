import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import { firebaseAuth } from './firebase.js';

const OFFICE_EMAILS = new Set([
    'nathan@sectionalts.co',
    'admin@sectionalts.co'
]);

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-btn');
const errorBox = document.getElementById('login-error');
const returnTo = new URLSearchParams(location.search).get('returnTo');
const destination = returnTo?.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/capture-dashboard.html';

function isOfficeUser(user) {
    return Boolean(user && OFFICE_EMAILS.has(user.email?.toLowerCase()));
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

onAuthStateChanged(firebaseAuth, async (user) => {
    if (isOfficeUser(user)) {
        location.replace(destination);
    } else if (user) {
        await signOut(firebaseAuth);
        showError('This account is not authorized for the office dashboard.');
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    loginButton.disabled = true;
    loginButton.textContent = 'Signing In...';

    try {
        const credential = await signInWithEmailAndPassword(
            firebaseAuth,
            emailInput.value.trim(),
            passwordInput.value
        );

        if (!isOfficeUser(credential.user)) {
            await signOut(firebaseAuth);
            showError('This account is not authorized for the office dashboard.');
            return;
        }

        location.replace(destination);
    } catch (error) {
        const message = error.code === 'auth/invalid-credential'
            ? 'Incorrect email or password.'
            : error.code === 'auth/too-many-requests'
                ? 'Too many attempts. Wait a moment and try again.'
                : 'Sign-in failed. Check the account and try again.';
        showError(message);
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign In';
    }
});