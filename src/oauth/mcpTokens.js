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

  console.log(
    '[MCP TOKEN] Created token:',
    token
  );

  console.log(
    '[MCP TOKEN] Session ID:',
    sessionId
  );

  console.log(
    '[MCP TOKEN] Total tokens:',
    tokens.size
  );


  return token;
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