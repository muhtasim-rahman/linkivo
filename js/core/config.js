/**
 * Linkivo — js/core/config.js  (introduced in v2.0.0)
 * Public client configuration. Everything here is PUBLIC by design:
 *  - The Firebase web config is not a secret; access is protected by Auth + Realtime Database rules.
 *  - Restrict the API key by HTTP referrer in Google Cloud Console (see @ Creator/docs/SETUP-GUIDE.md).
 * NEVER put private keys, service-account JSON, PIN pepper or any Worker secret in this repository.
 * Analytics is intentionally not configured (not needed, avoids extra load and tracking).
 */
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDWoYM48lMzyCB43jlLJN1CkRgsWkTdi8c',
  authDomain: 'linkivo.firebaseapp.com', // see SETUP-GUIDE.md: consider switching to the hosting domain for redirect sign-in
  databaseURL: 'https://linkivo-default-rtdb.firebaseio.com',
  projectId: 'linkivo',
  storageBucket: 'linkivo.firebasestorage.app',
  messagingSenderId: '830330759960',
  appId: '1:830330759960:web:5b2d88843a1e829883cc6d'
});

/** Cloudflare Worker (metadata, PIN/session, account lifecycle, cron). */
export const WORKER_URL = 'https://linkivo.programs-turzo.workers.dev';
