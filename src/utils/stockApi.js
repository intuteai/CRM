/* Raw-material stock API (/api/stock) — fetch wrappers shared by the
   Admin, Store and Production stock pages. Every call sends the login token,
   throws an Error carrying the server's message plus .status and .code on
   failure, and returns the parsed JSON (null for 204 No Content). */
import { apiErrorMessage } from "./stockForm.js";

export const getBackendUrl = () =>
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

async function request(path, { method = "GET", body, signal, isForm = false } = {}) {
  const token = localStorage.getItem("token");
  if (!token) {
    const err = new Error("Authentication token missing. Please log in again.");
    err.status = 401;
    err.code = "AUTH_NO_TOKEN";
    throw err;
  }
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${getBackendUrl()}/api/stock${path}`, {
    method,
    headers,
    credentials: "include",
    signal,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(apiErrorMessage(json, res.status));
    err.status = res.status;
    err.code = json?.code;
    err.details = json?.details;
    throw err;
  }
  return json;
}

export const fetchStockList = ({ signal } = {}) =>
  request("?limit=10000&offset=0", { signal });

export const createStock = (body) => request("", { method: "POST", body });

export const updateStock = (id, body) => request(`/${id}`, { method: "PUT", body });

export const deleteStock = (id) => request(`/${id}`, { method: "DELETE" });

export const adjustStock = (id, { quantity, reason }) =>
  request(`/${id}/adjust`, { method: "POST", body: { quantity, reason } });

export const acceptReturn = (id, quantity) =>
  request(`/${id}/accept-return`, { method: "POST", body: { quantity } });

export const fetchAdjustments = (id, limit = 20, { signal } = {}) =>
  request(`/${id}/adjustments?limit=${encodeURIComponent(limit)}`, { signal });

export function uploadStockPhoto(id, file) {
  const form = new FormData();
  form.append("photo", file);
  return request(`/${id}/photo`, { method: "POST", body: form, isForm: true });
}

export function checkPartNumber(partNumber, excludeId, signal) {
  const params = new URLSearchParams({ part_number: partNumber });
  if (excludeId !== undefined && excludeId !== null && excludeId !== "")
    params.set("exclude_id", String(excludeId));
  return request(`/check-part-number?${params.toString()}`, { signal });
}
