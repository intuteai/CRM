// Motor Testing API helper. Contract: CRM_BACKEND/docs/motor-test/admin-api.md (+ contract/openapi.yaml).
// Errors are { error, code, ...details }. An expired login (AUTH_INVALID_TOKEN / AUTH_INVALID_USER /
// AUTH_NO_TOKEN) is handled app-wide by services/apiStatus.js (it signs the user out); here it only
// becomes a readable message. TESTING_ROLE_REQUIRED is a permission message, never a logout.
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const SESSION_CODES = new Set(['AUTH_INVALID_TOKEN', 'AUTH_INVALID_USER', 'AUTH_NO_TOKEN']);

export class TestingApiError extends Error {
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
    return this.code === 'TESTING_ROLE_REQUIRED' || (this.status === 403 && !this.isSession);
  }
}

const FALLBACK_BY_CODE = {
  TESTING_ROLE_REQUIRED: 'Your testing role does not allow this action.',
  SECOND_PERSON_REQUIRED: 'This must be approved by a different person from the one who created it.',
  LIFECYCLE_CONFLICT: 'This action is not allowed in the current status. Refresh and try again.',
  DUPLICATE: 'An entry with these details already exists.',
  NOT_FOUND: 'Not found.',
  SERVER_UNAVAILABLE: 'The server is temporarily unavailable. Please try again.',
};

function token() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function buildUrl(path, query) {
  const url = `${BASE_URL}/api/testing${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
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
  return new TestingApiError({ status, code, message, fields: body.fields, body });
}

/** fetch wrapper: testingRequest('/admin/variants', { method, body, query }) -> parsed JSON (or null for 204). */
export async function testingRequest(path, { method = 'GET', body, query, signal } = {}) {
  let res;
  try {
    res = await fetch(buildUrl(path, query), {
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
    throw new TestingApiError({ status: 0, code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' });
  }
  if (res.status === 204) return null;
  const data = await readBody(res);
  if (!res.ok) throw toError(res.status, data);
  return data;
}

/** Downloads a CSV with the auth header (a plain link cannot carry it). */
export async function downloadTestingCsv(path, filename) {
  let res;
  try {
    res = await fetch(buildUrl(path), { headers: { Authorization: `Bearer ${token()}` } });
  } catch {
    throw new TestingApiError({ status: 0, code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' });
  }
  if (!res.ok) throw toError(res.status, await readBody(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One-line human message for any thrown value, including VALIDATION_ERROR field details. */
export function errorText(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (err instanceof TestingApiError) {
    if (err.fields.length) {
      const detail = err.fields.slice(0, 4).map((f) => `${f.path ? `${f.path}: ` : ''}${f.msg}`).join('; ');
      return `${err.message} (${detail})`;
    }
    return err.message;
  }
  return err.message || fallback;
}
