import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { config } from './config.js';

const { projectId, clientEmail, privateKey, storageBucket, databaseUrl } = config.firebase;

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
