import crypto from 'crypto';

const tokens = new Map();

// export function createMcpAccessToken(
//   sessionId,
//   resource
// ) {

//   const token =
//     crypto.randomBytes(48)
//       .toString('hex');

//   tokens.set(
//     token,
//     {
//       sessionId,
//       resource,
//       createdAt: Date.now(),
//       expiresAt:
//         Date.now() +
//         60 * 60 * 1000
//     }
//   );

//   console.log(
//     '[MCP TOKEN] Created token:',
//     token
//   );

//   console.log(
//     '[MCP TOKEN] Session ID:',
//     sessionId
//   );

//   console.log(
//     '[MCP TOKEN] Total tokens:',
//     tokens.size
//   );

//   return token;
// }


// export function getSessionIdFromMcpToken(
//   token
// ) {

//   console.log(
//     '[MCP TOKEN] Looking up token:',
//     token
//   );

//   console.log(
//     '[MCP TOKEN] Token length:',
//     token?.length
//   );

//   console.log(
//     '[MCP TOKEN] Stored token count:',
//     tokens.size
//   );

//   const data =
//     tokens.get(token);

//   if (!data) {

//     console.log(
//       '[MCP TOKEN] ❌ TOKEN NOT FOUND'
//     );

//     return null;
//   }

//   if (
//     Date.now() >
//     data.expiresAt
//   ) {

//     console.log(
//       '[MCP TOKEN] ❌ TOKEN EXPIRED'
//     );

//     tokens.delete(token);

//     return null;
//   }

//   console.log(
//     '[MCP TOKEN] ✅ TOKEN FOUND'
//   );

//   console.log(
//     '[MCP TOKEN] Session ID:',
//     data.sessionId
//   );

//   return data.sessionId;
// }

export function createMcpAccessToken(
  sessionId,
  resource
) {

  const token =
    crypto
      .randomBytes(48)
      .toString('hex');

  tokens.set(
    token,
    {
      sessionId,

      resource,

      createdAt:
        Date.now(),

      expiresAt:
        Date.now() +
        60 *
        60 *
        1000
    }
  );

  // console.log(
  //   '[MCP TOKEN] Created token:',
  //   token
  // );

  // console.log('[MCP TOKEN] Created token', {
  //   token_length: token.length,
  //   token_fingerprint: crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)
  // });
  // console.log('[MCP TOKEN] Session created', {
  //   session_id_fingerprint: crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
  // });
  console.log( '[MCP TOKEN] Created token:', token ); 
  console.log( '[MCP TOKEN] Session ID:', sessionId ); 
  console.log( '[MCP TOKEN] Resource:', resource ); 
  console.log( '[MCP TOKEN] Created At:', new Date().toISOString() ); 
  console.log( '[MCP TOKEN] Expires At:', new Date( Date.now() + 60 * 60 * 1000 ).toISOString() ); 
  console.log( '[MCP TOKEN] Total tokens:', tokens.size );


  return token;
}

const refreshTokens = new Map();

export function createMcpRefreshToken(
  sessionId,
  resource,
  clientId
) {

  const token =
    crypto
      .randomBytes(48)
      .toString('hex');

  const now = Date.now();
  const expiresIn = 60 * 60; // 1 hour

  // tokens.set(token, {
  //   sessionId,
  //   resource,
  //   createdAt: now,
  //   expiresAt: now + expiresIn * 1000
  // });

  refreshTokens.set(
    token,
    {
      sessionId,
      resource,
      clientId,
      expiresAt:
        Date.now() +
        30 * 24 * expiresIn * 1000
    }
  );

  // refreshTokens.set(
  //   token,
  //   {
  //     sessionId,
  //     resource,
  //     clientId,
  //     expiresAt:
  //       Date.now() +
  //       30 * 24 * 60 * 60 * 1000
  //   }
  // );

  return token;
}

// Refresh tokens are single use; a new one is issued on each refresh.
export function consumeMcpRefreshToken(
  token
) {

  const data =
    refreshTokens.get(token);

  if (!data) {
    return null;
  }

  refreshTokens.delete(token);

  if (
    Date.now() >
    data.expiresAt
  ) {
    return null;
  }

  return data;
}

export function getSessionIdFromMcpToken(
  token
) {

  const data =
    tokens.get(token);

  if (!data) {
    return null;
  }

  if (
    Date.now() >
    data.expiresAt
  ) {
    tokens.delete(token);

    return null;
  }

  return data.sessionId;
}

export function getMcpToken(
  token
) {

  const data =
    tokens.get(token);

  if (!data) {
    return null;
  }

  if (
    Date.now() >
    data.expiresAt
  ) {

    tokens.delete(token);

    return null;
  }

  return data;
}