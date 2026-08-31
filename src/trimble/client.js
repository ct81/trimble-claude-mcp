import { config } from '../config.js';
import { refreshIfNeeded } from '../oauth/oauth.js';

function joinUrl(baseUrl, path) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const cleanPath = String(path).replace(/^\/+/, '');

  return `${base}/${cleanPath}`;
}

export async function trimbleRequest(
  sessionId,
  path,
  options = {}
) {
  const session = await refreshIfNeeded(sessionId);

  if (!session?.trimble?.access_token) {
    throw new Error('No Trimble access token');
  }

  const baseUrl = config.trimble.apiBaseUrl;

  const url = joinUrl(baseUrl, path);

  console.log('[Trimble API] Base URL:', baseUrl);
  console.log('[Trimble API] Path:', path);
  console.log('[Trimble API] FINAL URL:', url);

  const headers = {
    accept: 'application/json',

    authorization:
      `Bearer ${session.trimble.access_token}`,

    ...(options.body
      ? {
          'content-type': 'application/json'
        }
      : {}),

    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,

    body: options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Trimble API ${response.status}: ${
        typeof data === 'string'
          ? data
          : JSON.stringify(data)
      }`
    );
  }

  return data;
}


// import { config } from '../config.js';
// import { refreshIfNeeded } from '../oauth/oauth.js';

// // export async function trimbleRequest(sessionId, path, options = {}) {
// //   const session = await refreshIfNeeded(sessionId);
// //   if (!session?.trimble?.access_token) throw new Error('No Trimble access token');
// //   const url = new URL(path, config.trimble.apiBaseUrl.endsWith('/') ? config.trimble.apiBaseUrl : config.trimble.apiBaseUrl + '/');
// //   const response = await fetch(url, { ...options, headers: { accept:'application/json', ...(options.body ? {'content-type':'application/json'} : {}), ...(options.headers || {}), authorization:`Bearer ${session.trimble.access_token}` } });
// //   const text = await response.text();
// //   let data; try { data = JSON.parse(text); } catch { data = text; }
// //   if (!response.ok) throw new Error(`Trimble API ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
// //   return data;
// // }
// // export async function trimbleRequest(
// //     sessionId,
// //     path,
// //     options = {}
// // ) {

// //     console.log('[Trimble API] Request:', {
// //         sessionId:
// //             sessionId
// //                 ? `${sessionId.substring(0, 8)}...`
// //                 : null,
// //         path,
// //         method:
// //             options.method || 'GET'
// //     });

// //     const session =
// //         await refreshIfNeeded(sessionId);

// //     if (!session?.trimble?.access_token) {
// //         throw new Error(
// //             'No Trimble access token'
// //         );
// //     }

// //     console.log(
// //         '[Trimble API] Access token exists:',
// //         true
// //     );

// //     const base =
// //         config.trimble.apiBaseUrl.endsWith('/')
// //             ? config.trimble.apiBaseUrl
// //             : config.trimble.apiBaseUrl + '/';

// //     const url =
// //         new URL(path, base);

// //     console.log(
// //         '[Trimble API] URL:',
// //         url.toString()
// //     );

// //     console.log(
// //       '[Trimble API] Request URL:',
// //       url.toString()
// //     );

// //     console.log(
// //       '[Trimble API] Method:',
// //       options.method || 'GET'
// //     );

// //     const response =
// //         await fetch(
// //             url,
// //             {
// //                 ...options,

// //                 headers: {
// //                     accept:
// //                         'application/json',

// //                     ...(options.body
// //                         ? {
// //                             'content-type':
// //                                 'application/json'
// //                         }
// //                         : {}),

// //                     ...(options.headers || {}),

// //                     authorization:
// //                         `Bearer ${session.trimble.access_token}`
// //                 }
// //             }
// //         );

// //     console.log(
// //         '[Trimble API] Status:',
// //         response.status
// //     );

// //     const text =
// //         await response.text();

// //     let data;

// //     try {
// //         data = JSON.parse(text);
// //     } catch {
// //         data = text;
// //     }

// //     if (!response.ok) {

// //         console.error(
// //             '[Trimble API] Error:',
// //             data
// //         );

// //         throw new Error(
// //             `Trimble API ${response.status}: ${
// //                 typeof data === 'string'
// //                     ? data
// //                     : JSON.stringify(data)
// //             }`
// //         );
// //     }

// //     console.log(
// //         '[Trimble API] Success'
// //     );

// //     return data;
// // }

// export async function trimbleRequest(
//     sessionId,
//     path,
//     options = {}
// ) {
//     const session =
//         await refreshIfNeeded(sessionId);

//     if (!session?.trimble?.access_token) {
//         throw new Error(
//             'No Trimble access token'
//         );
//     }

//     const baseUrl =
//     config.trimble.apiBaseUrl.endsWith('/')
//         ? config.trimble.apiBaseUrl
//         : config.trimble.apiBaseUrl + '/';

//     const cleanPath =
//     path.startsWith('/')
//         ? path.substring(1)
//         : path;

//     const url =
//     new URL(
//         cleanPath,
//         baseUrl
//     );

//     console.log('================ TRIMBLE API DEBUG ================');
//     console.log('[Trimble API] Base URL:', config.trimble.apiBaseUrl);
//     console.log('[Trimble API] Path:', path);
//     console.log('[Trimble API] FINAL URL:', url.toString());
//     console.log('[Trimble API] Method:', options.method || 'GET');
//     console.log('====================================================');

//     // console.log(
//     //     '[Trimble API] Request URL:',
//     //     url.toString()
//     // );

//     // console.log(
//     //     '[Trimble API] Method:',
//     //     options.method || 'GET'
//     // );

//     const response =
//         await fetch(
//             url,
//             {
//                 ...options,

//                 headers: {
//                     accept:
//                         'application/json',

//                     ...(options.body
//                         ? {
//                             'content-type':
//                                 'application/json'
//                         }
//                         : {}),

//                     ...(options.headers || {}),

//                     authorization:
//                         `Bearer ${session.trimble.access_token}`
//                 }
//             }
//         );

//     const text =
//         await response.text();

//     let data;

//     try {
//         data = JSON.parse(text);
//     }
//     catch {
//         data = text;
//     }

//     if (!response.ok) {
//         throw new Error(
//             `Trimble API ${response.status}: ${
//                 typeof data === 'string'
//                     ? data
//                     : JSON.stringify(data)
//             }`
//         );
//     }

//     return data;
// }

// export const tools = {

//     async getUser(sessionId) {
//         return trimbleRequest(
//             sessionId,
//             '/users/me'
//         );
//     },

//     async getRegions(sessionId) {
//         return trimbleRequest(
//             sessionId,
//             '/regions'
//         );
//     },

//     // async getProjects(sessionId) {
//     //     return trimbleRequest(
//     //         sessionId,
//     //         '/users/me'
//     //     );
//     // },
//     async getProjects(sessionId) {
//         return trimbleRequest(
//             sessionId,
//             '/projects?fullyLoaded=false'
//         );
//     },

//     async getProject(sessionId, projectId) {
//         return trimbleRequest(
//             sessionId,
//             `/projects/${encodeURIComponent(projectId)}`
//         );
//     },

//     async getFolders(sessionId, projectId) {
//         return trimbleRequest(
//             sessionId,
//             `/projects/${encodeURIComponent(projectId)}/folders`
//         );
//     },

//     async getIssues(sessionId, projectId) {
//         return trimbleRequest(
//             sessionId,
//             `/projects/${encodeURIComponent(projectId)}/issues`
//         );
//     }
// };

// // export const tools = {
// //   async getProjects(sessionId) { return trimbleRequest(sessionId, '/projects'); },
// //   async getProject(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}`); },
// //   async getFolders(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}/folders`); },
// //   async getIssues(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}/issues`); }
// // };
