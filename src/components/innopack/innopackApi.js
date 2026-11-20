// Innopack API helper (base /api/innopack). Modeled on components/testing/testingApi.js.
// Errors are { error, code, fields?: [{ path, msg }] }. An expired login (AUTH_INVALID_TOKEN /
// AUTH_INVALID_USER / AUTH_NO_TOKEN) is handled app-wide by services/apiStatus.js (it signs the user
// out); here it only becomes a readable message. PERM_DENIED is a permission message, never a logout.
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const SESSION_CODES = new Set(['AUTH_INVALID_TOKEN', 'AUTH_INVALID_USER', 'AUTH_NO_TOKEN']);

export class InnopackApiError extends Error {
  constructor({ status, code, message, fields, body }) {
    super(message);
    this.status = status;
    this.code = code || null;
    this.fields = Array.isArray(fields) ? fields : [];
    this.body = body || {};
  }

  get isSession() {
    return this.status === 401 || SESSION_CODES.has(this.code);
  }

  get isForbidden() {
    return this.code === 'PERM_DENIED' || (this.status === 403 && !this.isSession);
  }
}

const FALLBACK_BY_CODE = {
  PERM_DENIED: 'Your role does not allow this action.',
  INVALID_INPUT: 'Some fields need attention.',
  NOT_FOUND: 'This part no longer exists. It may have been deleted by someone else.',
  SERVER_UNAVAILABLE: 'The server is temporarily unavailable. Please try again.',
};

function token() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toError(status, body) {
  const code = body.code || null;
  let message = typeof body.error === 'string' && body.error ? body.error : null;
  if (status === 401 || SESSION_CODES.has(code)) message = 'Your session has expired. Please sign in again.';
  if (!message) message = FALLBACK_BY_CODE[code] || `Request failed (${status})`;
  return new InnopackApiError({ status, code, message, fields: body.fields, body });
}

/** fetch wrapper: innopackRequest('/parts', { method, body }) -> parsed JSON (or null for 204). */
export async function innopackRequest(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/innopack${path}`, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new InnopackApiError({ status: 0, code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' });
  }
  if (res.status === 204) return null;
  const data = await readBody(res);
  if (!res.ok) throw toError(res.status, data);
  return data;
}

export const partsApi = {
  list: (opts) => innopackRequest('/parts', opts).then((d) => (Array.isArray(d?.items) ? d.items : [])),
  options: (opts) => innopackRequest('/parts/options', opts),
  create: (body) => innopackRequest('/parts', { method: 'POST', body }),
  update: (id, body) => innopackRequest(`/parts/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  remove: (id) => innopackRequest(`/parts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Field errors keyed by input name (a "body." prefix from the validator is dropped). */
export function fieldErrors(err) {
  if (!(err instanceof InnopackApiError)) return {};
  return err.fields.reduce((acc, f) => {
    const key = String(f?.path || '').replace(/^body\./, '');
    if (key && f?.msg && !acc[key]) acc[key] = f.msg;
    return acc;
  }, {});
}

/** One-line human message for any thrown value, including INVALID_INPUT field details. */
export function errorText(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (err instanceof InnopackApiError) {
    if (err.fields.length) {
      const detail = err.fields.slice(0, 4).map((f) => `${f.path ? `${f.path}: ` : ''}${f.msg}`).join('; ');
      return `${err.message} (${detail})`;
    }
    return err.message;
  }
  return err.message || fallback;
}
