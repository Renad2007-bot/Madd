import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2qF0Y98iwxUT95_T-cjSco-u8mwd4qI0",
  authDomain: "madd-platform.firebaseapp.com",
  projectId: "madd-platform",
  storageBucket: "madd-platform.firebasestorage.app",
  messagingSenderId: "75327822904",
  appId: "1:75327822904:web:1d093b1d15072704669acd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };

