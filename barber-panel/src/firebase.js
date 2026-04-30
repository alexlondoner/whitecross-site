import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A",
  authDomain: "havuz-44f70.firebaseapp.com",
  projectId: "havuz-44f70",
  storageBucket: "havuz-44f70.firebasestorage.app",
  messagingSenderId: "1050766582653",
  appId: "1:1050766582653:web:7ddaa5acb3bec5ef122214"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);