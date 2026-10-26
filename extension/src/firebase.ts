import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth/web-extension';
import { getFirestore, type Firestore } from 'firebase/firestore';

function envValue(value: string | undefined): string {
  return (value ?? '').trim();
}

const options: FirebaseOptions = {
  apiKey: envValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: envValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: envValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: envValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: envValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: envValue(import.meta.env.VITE_FIREBASE_APP_ID),
};

export function firebaseConfigProblem(): string | null {
  const apiKey = options.apiKey ?? '';
  const projectId = options.projectId ?? '';
  if (!apiKey || !projectId || apiKey === 'YOUR_API_KEY' || apiKey.startsWith('your_')) {
    return 'Add your Firebase web config to .env (see .env.example), run npm run build:extension, and reload this extension.';
  }
  return null;
}

const configured = firebaseConfigProblem() === null;
const app = configured ? initializeApp(options) : null;

export const auth: Auth | null = app ? getAuth(app) : null;
// Same named database as the website. See src/firebase.ts.
export const db: Firestore | null = app ? getFirestore(app, 'bookmarks') : null;
