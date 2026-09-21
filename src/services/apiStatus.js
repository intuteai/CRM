import axios from 'axios';
import { logout, toggleLogin } from '../features/auth/authSlice.js';
import { addNotification } from '../features/notifications/notificationSlice';
import { disconnectSocket } from './socket.js';

// Watches every API response for two situations the pages can't tell apart on their own:
//  - the session is over (expired / invalid token): send the user back to the login screen
//  - the role isn't allowed to see the data (a 403 with any other code): remember it so the shared
//    error screen (pages/ConnectionError.jsx) can say "Access denied" instead of "Connection interrupted"
// The backend answers an expired token with 403 + code AUTH_INVALID_TOKEN, so a 403 alone is not proof
// of a permission problem.
const RECENT_MS = 10000;
const SESSION_CODES = new Set(['AUTH_INVALID_TOKEN', 'AUTH_INVALID_USER', 'AUTH_NO_TOKEN']);
let lastForbiddenAt = 0;
let installed = false;

export function wasForbiddenRecently() {
  return Date.now() - lastForbiddenAt < RECENT_MS;
}

// Unreadable or past-its-expiry token counts as expired. A token that is still in date but was
// rejected is more likely a server hiccup (the backend also answers database errors with
// AUTH_INVALID_TOKEN), so that case must not sign anyone out.
function tokenIsExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function bearerFrom(headers) {
  let value = null;
  if (!headers) return null;
  if (typeof headers.get === 'function') value = headers.get('authorization');
  else if (Array.isArray(headers)) value = headers.find(([k]) => String(k).toLowerCase() === 'authorization')?.[1];
  else value = Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  return typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') : null;
}

function endSession(store, requestToken, code) {
  const { token } = store.getState().auth;
  if (!token) return; // already signed out
  if (requestToken && requestToken !== token) return; // a late answer to a previous login
  // AUTH_INVALID_TOKEN is only trusted when the token really is out of date (see tokenIsExpired).
  if (code === 'AUTH_INVALID_TOKEN' && !tokenIsExpired(token)) return;
  try {
    localStorage.clear();
  } catch {
    // storage unavailable — the redux state below still signs the user out
  }
  disconnectSocket();
  store.dispatch(logout());
  store.dispatch(toggleLogin(true));
  store.dispatch(addNotification({ type: 'warning', message: 'Your session has expired. Please sign in again.' }));
}

function handleDenied(store, status, code, url, requestToken) {
  if (!url.includes('/api/')) return;
  if (SESSION_CODES.has(code)) {
    endSession(store, requestToken, code);
  } else if (status === 403) {
    lastForbiddenAt = Date.now();
  }
}

export function installApiStatusTracking(store) {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    if (res.status === 401 || res.status === 403) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const requestToken = bearerFrom(init?.headers) || bearerFrom(input?.headers);
      // Read the (tiny) error body before handing the response back, so the page that
      // triggered the request sees the outcome already recorded.
      const body = await res.clone().json().catch(() => null);
      handleDenied(store, res.status, body?.code, url, requestToken);
    }
    return res;
  };

  axios.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        handleDenied(
          store,
          status,
          err.response.data?.code,
          String(err.config?.url || ''),
          bearerFrom(err.config?.headers),
        );
      }
      return Promise.reject(err);
    },
  );
}
