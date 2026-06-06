// ============================================================
// Linkivo — firebase-init.js  v1.4.5
// Firebase SDK initialization.
// If firebase-config.js fails to load (MIME error, 404, missing
// export default), window.__showConfigError() is called instead
// of crashing silently and leaving the splash screen stuck.
// ============================================================

import { initializeApp }            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, sendPasswordResetEmail,
         onAuthStateChanged, signOut, updateProfile }
                                     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase, ref, set, get, update, remove,
         push, onValue, off, serverTimestamp, query,
         orderByChild, equalTo, limitToLast }
                                     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getAnalytics, logEvent }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js';
// Static import — if this throws (MIME error, missing file),
// the module fails to load. app.js boot() catch handles it via
// window.__showConfigError(). See also: sw.js NEVER_CACHE list.
import firebaseConfig from '/firebase-config.js';

// ── Initialize ───────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getDatabase(app);
const analytics = getAnalytics(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Export everything needed across the app ──────────────
export {
  app, auth, db, analytics, googleProvider,

  // Auth helpers
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile,

  // Realtime DB helpers
  ref, set, get, update, remove, push,
  onValue, off, serverTimestamp,
  query, orderByChild, equalTo, limitToLast,

  // Analytics
  logEvent
};

// ── Database Path Helpers ────────────────────────────────
export const DbPaths = {
  user:           (uid)               => `users/${uid}`,
  userProfile:    (uid)               => `users/${uid}/profile`,
  userSettings:   (uid)               => `users/${uid}/settings`,
  folders:        (uid)               => `users/${uid}/folders`,
  folder:         (uid, fid)          => `users/${uid}/folders/${fid}`,
  links:          (uid, fid)          => `users/${uid}/folders/${fid}/links`,
  link:           (uid, fid, lid)     => `users/${uid}/folders/${fid}/links/${lid}`,
  recycleBin:     (uid)               => `users/${uid}/recycleBin`,
  deletedItem:    (uid, id)           => `users/${uid}/recycleBin/${id}`,
  history:        (uid)               => `users/${uid}/history`,
  historyItem:    (uid, id)           => `users/${uid}/history/${id}`,
  pinnedFolders:  (uid)               => `users/${uid}/pinnedFolders`,
};
