import crypto from 'node:crypto';

const states = new Map();

const STATE_EXPIRATION =
  10 * 60 * 1000;

export function createOAuthState(
  state,
  data = {}
) {
  states.set(
    state,
    {
      ...data,
      createdAt: Date.now()
    }
  );

  return state;
}

export function getOAuthState(
  state
) {
  const data =
    states.get(state);

  if (!data) {
    return null;
  }

  if (
    Date.now() -
      data.createdAt >
      STATE_EXPIRATION
  ) {
    states.delete(state);

    return null;
  }

  return data;
}

export function deleteOAuthState(
  state
) {
  states.delete(state);
}
// const states = new Map();

// export function createOAuthState(data) {

//   const state =
//     crypto.randomBytes(24).toString('hex');

//   states.set(
//     state,
//     {
//       ...data,
//       createdAt: Date.now()
//     }
//   );

//   return state;
// }

// export function getOAuthState(state) {

//   const data = 
//     states.get(state);

//   if (!data) {
//     return null;
//   }

//   if (
//     Date.now() - data.createdAt >
//     10 * 60 * 1000
//   ) {

//     states.delete(state);

//     return null;
//   }

//   return data;
// }

// export function deleteOAuthState(state) {
//   states.delete(state);
// }