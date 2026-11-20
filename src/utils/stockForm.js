/* =====================================================================
   Raw-material stock page logic shared by the Admin, Store and Production
   pages (pure — runs under `node --test`, no React / import.meta).
   The API rules these mirror live in CRM_BACKEND/controllers/core/stock.*.
   ===================================================================== */
import { isValidProductCode } from "./productCode.js";

export const NUMERIC_MAX = 99999999.99; // numeric(10,2)
export const INT_MAX = 2147483647;
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 5000;
export const RAW_SOURCE = "raw_materials";

const round2 = (n) => Math.round(n * 100) / 100;

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/** Parse a user / spreadsheet number: strips ₹, commas and spaces. NaN when invalid. */
export function parseLooseNumber(v) {
  if (typeof v === "number") return v;
  const cleaned = String(v ?? "").replace(/[₹,\s]/g, "");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

/** API row (snake_case or camelCase, numeric strings) → page item with real numbers. */
export function normalizeStockItem(raw = {}) {
  const r = raw || {};
  return {
    productId: toNumber(r.productId ?? r.product_id),
    productName: String(r.productName ?? r.product_name ?? ""),
    productCode: String(r.productCode ?? r.product_code ?? ""),
    description: String(r.description ?? ""),
    price: toNumber(r.price),
    stockQuantity: toNumber(r.stockQuantity ?? r.stock_quantity),
    qtyRequired: toNumber(r.qtyRequired ?? r.qty_required),
    returnableQty: toNumber(r.returnableQty ?? r.returnable_qty),
    location: r.location ?? null,
    imageUrl: r.imageUrl ?? r.image_url ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
  };
}

/**
 * Apply a socket 'stockUpdate' payload to the list.
 * Only raw-material payloads (source === 'raw_materials') are applied: the same
 * event name is used for finished goods, whose product ids overlap.
 */
export function applyStockUpdate(items, payload) {
  const list = Array.isArray(items) ? items : [];
  if (!payload || payload.source !== RAW_SOURCE) return { items: list, needsRefetch: false };

  const id = Number(payload.product_id ?? payload.productId);
  if (!Number.isFinite(id)) return { items: list, needsRefetch: false };

  const status = String(payload.status || "").toLowerCase();
  if (status === "deleted") {
    return { items: list.filter((it) => it.productId !== id), needsRefetch: false };
  }

  const idx = list.findIndex((it) => it.productId === id);
  if (idx === -1) return { items: list, needsRefetch: true };

  const patch = {};
  const numField = (snake, camel, key) => {
    const v = payload[snake] ?? payload[camel];
    if (v === undefined || v === null) return;
    const n = Number(v);
    if (Number.isFinite(n)) patch[key] = n;
  };
  numField("stock_quantity", "stockQuantity", "stockQuantity");
  numField("returnable_qty", "returnableQty", "returnableQty");
  numField("qty_required", "qtyRequired", "qtyRequired");
  numField("price", "price", "price");
  if (payload.location !== undefined) patch.location = payload.location;
  if (payload.image_url !== undefined) patch.imageUrl = payload.image_url;
  else if (payload.imageUrl !== undefined) patch.imageUrl = payload.imageUrl;

  const next = list.slice();
  next[idx] = { ...list[idx], ...patch };
  return { items: next, needsRefetch: false };
}

export const EMPTY_FORM = Object.freeze({
  productName: "",
  productCode: "",
  price: "",
  stockQuantity: "",
  qtyRequired: "",
  returnableQty: "",
  description: "",
});

const str = (v) => (v === undefined || v === null ? "" : String(v));

/** Item → edit form (uses ?? so a stored 0 shows as "0", not blank). */
export function formFromItem(item = {}) {
  const it = item || {};
  return {
    productName: str(it.productName),
    productCode: str(it.productCode),
    price: str(it.price),
    stockQuantity: str(it.stockQuantity),
    qtyRequired: str(it.qtyRequired),
    returnableQty: str(it.returnableQty),
    description: str(it.description),
  };
}

function checkAmount(errors, field, raw, { required = false, label } = {}) {
  if (isBlank(raw)) {
    if (required) errors[field] = `${label} is required`;
    return;
  }
  const n = parseLooseNumber(raw);
  if (!Number.isFinite(n)) errors[field] = `${label} must be a number`;
  else if (n < 0) errors[field] = "Must be ≥ 0";
  else if (n > NUMERIC_MAX) errors[field] = `Must be at most ${NUMERIC_MAX}`;
}

/** Form → { field: message } (empty object when valid). */
export function validateStockForm(form, { mode = "create", requirePrice = true } = {}) {
  const f = form || {};
  const errors = {};

  const name = str(f.productName).trim();
  if (!name) errors.productName = "Required";
  else if (name.length > NAME_MAX) errors.productName = `Max ${NAME_MAX} characters`;

  const code = str(f.productCode).trim().toUpperCase();
  if (code.length !== 11) errors.productCode = "Must be exactly 11 characters";
  else if (!isValidProductCode(code))
    errors.productCode = "Must be 4 digits, 4 letters/digits, then 3 digits";

  if (requirePrice) checkAmount(errors, "price", f.price, { required: true, label: "Price" });

  // Blank stock: create → 0, edit → keep stored value.
  checkAmount(errors, "stockQuantity", f.stockQuantity, { label: "Stock" });
  checkAmount(errors, "returnableQty", f.returnableQty, { label: "Returnable qty" });

  if (!isBlank(f.qtyRequired)) {
    const q = parseLooseNumber(f.qtyRequired);
    if (!Number.isInteger(q) || q < 0 || q > INT_MAX) errors.qtyRequired = "Must be a whole number ≥ 0";
  }

  if (str(f.description).trim().length > DESCRIPTION_MAX)
    errors.description = `Max ${DESCRIPTION_MAX} characters`;

  void mode;
  return errors;
}

/** True when the edit form's stock differs from the stored value. */
export function stockChanged(form, original) {
  if (!form || !original || isBlank(form.stockQuantity)) return false;
  const next = parseLooseNumber(form.stockQuantity);
  if (!Number.isFinite(next)) return false;
  return round2(next) !== round2(toNumber(original.stockQuantity));
}

/** Form → API body for POST /api/stock (create) or PUT /api/stock/:id (edit). */
export function buildStockPayload(
  form,
  {
    mode = "create",
    original = null,
    includePrice = true,
    includeReturnable = false,
    partNumberAuto = false,
    stockChangeReason = "",
  } = {},
) {
  const f = form || {};
  const isCreate = mode === "create";

  let price;
  if (includePrice) price = round2(parseLooseNumber(f.price));
  else price = isCreate ? 0 : round2(toNumber(original?.price));

  const body = {
    productName: str(f.productName).trim(),
    productCode: str(f.productCode).trim().toUpperCase(),
    description: str(f.description).trim(),
    price,
  };

  if (!isBlank(f.stockQuantity)) body.stockQuantity = round2(parseLooseNumber(f.stockQuantity));
  else if (isCreate) body.stockQuantity = 0;

  if (!isBlank(f.qtyRequired)) body.qtyRequired = parseLooseNumber(f.qtyRequired);

  if (includeReturnable && !isBlank(f.returnableQty))
    body.returnableQty = round2(parseLooseNumber(f.returnableQty));

  if (isCreate) {
    body.part_number_auto = !!partNumberAuto;
  } else if (stockChanged(f, original)) {
    const reason = str(stockChangeReason).trim();
    if (reason) body.stockChangeReason = reason;
  }

  return body;
}

/**
 * Excel rows (XLSX.utils.sheet_to_json) → API bodies.
 * Rows with a "Product ID" update that item (it must exist); others create.
 * Row numbers in messages are spreadsheet rows (header is row 1).
 */
export function parseImportRows(
  rows,
  { existingById = new Map(), includePrice = true, includeReturnable = false } = {},
) {
  const valid = [];
  const errors = [];

  (Array.isArray(rows) ? rows : []).forEach((row, i) => {
    const label = `Row ${i + 2}`;
    const rowErrors = [];
    const r = row || {};

    let productId = null;
    let existing = null;
    if (!isBlank(r["Product ID"])) {
      const id = parseLooseNumber(r["Product ID"]);
      if (!Number.isInteger(id) || id < 1) rowErrors.push(`${label}: invalid Product ID`);
      else if (!existingById.has(id)) rowErrors.push(`${label}: Product ID ${id} not found`);
      else {
        productId = id;
        existing = existingById.get(id);
      }
    }

    const name = str(r["Product Name"]).trim();
    if (!name) rowErrors.push(`${label}: Product Name required`);
    else if (name.length > NAME_MAX) rowErrors.push(`${label}: Product Name too long`);

    const code = str(r["Product Code"]).trim().toUpperCase();
    if (!isValidProductCode(code)) rowErrors.push(`${label}: Product Code must be a valid 11-character code`);

    let price;
    if (includePrice) {
      if (isBlank(r["Price (₹)"])) {
        if (existing) price = round2(toNumber(existing.price));
        else rowErrors.push(`${label}: Price required`);
      } else {
        const p = parseLooseNumber(r["Price (₹)"]);
        if (!Number.isFinite(p) || p < 0 || p > NUMERIC_MAX) rowErrors.push(`${label}: invalid price`);
        else price = round2(p);
      }
    } else {
      price = existing ? round2(toNumber(existing.price)) : 0;
    }

    let stockQuantity;
    if (!isBlank(r["Stock Quantity"])) {
      const s = parseLooseNumber(r["Stock Quantity"]);
      if (!Number.isFinite(s) || s < 0 || s > NUMERIC_MAX) rowErrors.push(`${label}: invalid Stock Quantity`);
      else stockQuantity = round2(s);
    } else if (!existing) {
      stockQuantity = 0;
    }

    let qtyRequired;
    if (!isBlank(r["Qty Required"])) {
      const q = parseLooseNumber(r["Qty Required"]);
      if (!Number.isInteger(q) || q < 0 || q > INT_MAX) rowErrors.push(`${label}: invalid Qty Required`);
      else qtyRequired = q;
    }

    let returnableQty;
    if (includeReturnable && !isBlank(r["Returnable Qty"])) {
      const q = parseLooseNumber(r["Returnable Qty"]);
      if (!Number.isFinite(q) || q < 0 || q > NUMERIC_MAX) rowErrors.push(`${label}: invalid Returnable Qty`);
      else returnableQty = round2(q);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    const body = { productName: name, productCode: code, price };
    if (stockQuantity !== undefined) body.stockQuantity = stockQuantity;
    if (qtyRequired !== undefined) body.qtyRequired = qtyRequired;
    if (returnableQty !== undefined) body.returnableQty = returnableQty;
    if (r["Description"] !== undefined) {
      const d = str(r["Description"]).trim();
      body.description = d === "N/A" ? "" : d;
    }
    if (existing && stockQuantity !== undefined) body.stockChangeReason = "Excel import";

    valid.push({ productId, body });
  });

  return { valid, errors };
}

/** Best human message from an API error body. */
export function apiErrorMessage(json, status) {
  const j = json && typeof json === "object" ? json : {};
  return (
    j.error ||
    j.message ||
    (Array.isArray(j.details) && j.details[0] && j.details[0].message) ||
    `Request failed (${status})`
  );
}
