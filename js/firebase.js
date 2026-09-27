// The only module that talks to the Firebase CDN; everything else imports from here.
// (The UI tests serve this file with the gstatic URLs pointed at tests/ui/mock.js.)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export { onAuthStateChanged, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export { collection, doc, addDoc, deleteDoc, setDoc, getDoc, onSnapshot, serverTimestamp, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
// local cache on the device: the game opens without reception, and marks made offline are kept (even if the app is
// closed) and sent when reception returns
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const auth = getAuth(app);
