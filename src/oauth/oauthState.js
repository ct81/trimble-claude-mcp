import crypto from 'node:crypto';

const states = new Map();

export function createOAuthState(data) {

  const state =
    crypto.randomBytes(24).toString('hex');

  states.set(
    state,
    {
      ...data,
      createdAt: Date.now()
    }
  );
// states.createOAuthState({
//   type: 'extension',
//   createdAt: Date.now()
// });

  return state;
}

export function getOAuthState(state) {

  const data = 
    states.get(state);

  if (!data) {
    return null;
  }

  if (
    Date.now() - data.createdAt >
    10 * 60 * 1000
  ) {

    states.delete(state);
    //states.deleteOAuthState(state);

    return null;
  }

  return data;
}

export function deleteOAuthState(state) {
  states.delete(state);
  //states.deleteOAuthState(state);
}