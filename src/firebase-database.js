import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { config } from './config.js';

const { projectId, clientEmail, privateKey, storageBucket, databaseUrl } = config.firebase;

const missing = Object.entries({
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: clientEmail,
  FIREBASE_PRIVATE_KEY: privateKey,
  FIREBASE_DATABASE_URL: databaseUrl
}).filter(([, value]) => !value).map(([key]) => key);
console.log(missing.length
  ? `[Firebase] Realtime Database DISABLED; workflows use local disk. Missing: ${missing.join(', ')}`
  : `[Firebase] Realtime Database enabled: ${databaseUrl}`);

export const realtimeDb = projectId && clientEmail && privateKey && databaseUrl
  ? getDatabaseWithUrl(
      databaseUrl,
      getApps()[0] || initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        databaseURL: databaseUrl,
        ...(storageBucket ? { storageBucket } : {})
      })
    )
  : null;
