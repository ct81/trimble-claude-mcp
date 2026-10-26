import 'dotenv/config';

const required = ['SESSION_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);

const trimbleScopes = new Set(
  (process.env.TRIMBLE_SCOPE || 'openid profile email')
    .split(/\s+/)
    .filter(Boolean)
);
for (const scope of ['openid', 'profile', 'email']) trimbleScopes.add(scope);

export const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET,
  trimble: {
    clientId: process.env.TRIMBLE_CLIENT_ID,
    clientSecret: process.env.TRIMBLE_CLIENT_SECRET,
    redirectUri: process.env.TRIMBLE_REDIRECT_URI,
    scope: [...trimbleScopes].join(' '),
    authorizationEndpoint: process.env.TRIMBLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: process.env.TRIMBLE_TOKEN_ENDPOINT,
    apiBaseUrl: process.env.TRIMBLE_API_BASE_URL || 'https://app.connect.trimble.com/tc/api/2.0'
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  extensionOrigin: process.env.EXTENSION_ORIGIN || '*',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    databaseUrl: process.env.FIREBASE_DATABASE_URL
  }
};
