import axios from 'axios';

// Pages show one shared error screen (pages/ConnectionError.jsx) for any failed load. A 403 is not a
// connection problem, so we remember when the API last answered 403 and let that screen say so.
const RECENT_MS = 10000;
let lastForbiddenAt = 0;
let installed = false;

const noteForbidden = () => {
  lastForbiddenAt = Date.now();
};

export function wasForbiddenRecently() {
  return Date.now() - lastForbiddenAt < RECENT_MS;
}

export function installApiStatusTracking() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    if (res.status === 403) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/')) noteForbidden();
    }
    return res;
  };

  axios.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err?.response?.status === 403) noteForbidden();
      return Promise.reject(err);
    },
  );
}
