import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBfEn8Cgp3bFGeVVftZ87cw-mxVJaOZfKI",
  authDomain: "electricity-manager-5ec3c.firebaseapp.com",
  projectId: "electricity-manager-5ec3c",
  storageBucket: "electricity-manager-5ec3c.firebasestorage.app",
  messagingSenderId: "236883994735",
  appId: "1:236883994735:web:c1e736ffab5572dd96459a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);