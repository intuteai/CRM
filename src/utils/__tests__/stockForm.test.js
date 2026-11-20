import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStockItem,
  applyStockUpdate,
  EMPTY_FORM,
  formFromItem,
  validateStockForm,
  stockChanged,
  buildStockPayload,
  parseImportRows,
  apiErrorMessage,
  parseLooseNumber,
  isValidLeadDate,
  normalizeLeadDate,
  formatLeadDate,
  isLeadDateOverdue,
  todayIso,
  parseLeadDateCell,
  compareLeadDate,
} from "../stockForm.js";

const item = (over = {}) => ({
  productId: 7,
  productName: "Bearing",
  productCode: "0007L5BR123",
  description: "6203",
  price: 12.5,
  stockQuantity: 10,
  qtyRequired: 4,
  returnableQty: 2,
  location: null,
  imageUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

const form = (over = {}) => ({
  ...EMPTY_FORM,
  productName: "Bearing",
  productCode: "0007L5BR123",
  price: "12.5",
  stockQuantity: "10",
  ...over,
});

describe("parseLooseNumber", () => {
  test("strips ₹, commas, spaces", () => {
    assert.equal(parseLooseNumber("₹1,234.50"), 1234.5);
    assert.equal(parseLooseNumber(" 12 "), 12);
    assert.equal(parseLooseNumber(5), 5);
    assert.ok(Number.isNaN(parseLooseNumber("")));
    assert.ok(Number.isNaN(parseLooseNumber("abc")));
    assert.ok(Number.isNaN(parseLooseNumber(null)));
  });
});

describe("normalizeStockItem", () => {
  test("snake_case numeric strings become numbers", () => {
    const n = normalizeStockItem({
      product_id: 3,
      product_name: "Shaft",
      product_code: "0003R1SH111",
      price: "99.90",
      stock_quantity: "12.00",
      qty_required: 5,
      returnable_qty: "1.50",
      image_url: "u",
      created_at: "d",
      location: "A1",
    });
    assert.deepEqual(n, {
      productId: 3,
      productName: "Shaft",
      productCode: "0003R1SH111",
      description: "",
      price: 99.9,
      stockQuantity: 12,
      qtyRequired: 5,
      returnableQty: 1.5,
      location: "A1",
      imageUrl: "u",
      leadDate: null,
      createdAt: "d",
    });
  });
  test("camelCase wins and garbage becomes 0, never NaN", () => {
    const n = normalizeStockItem({ productId: "4", stockQuantity: "x", price: null, qtyRequired: undefined, returnableQty: "" });
    assert.equal(n.productId, 4);
    assert.equal(n.stockQuantity, 0);
    assert.equal(n.price, 0);
    assert.equal(n.qtyRequired, 0);
    assert.equal(n.returnableQty, 0);
    assert.equal(n.location, null);
    assert.equal(n.imageUrl, null);
  });
  test("null / undefined input", () => {
    assert.equal(normalizeStockItem(null).productId, 0);
    assert.equal(normalizeStockItem().productName, "");
  });
});

describe("applyStockUpdate", () => {
  const list = [item(), item({ productId: 8, productName: "Shaft" })];

  test("ignores finished-goods payloads (same product ids)", () => {
    const r = applyStockUpdate(list, { source: "inventory", product_id: 7, stock_quantity: 999 });
    assert.equal(r.items, list);
    assert.equal(r.needsRefetch, false);
  });
  test("ignores legacy payloads without source", () => {
    const r = applyStockUpdate(list, { product_id: 7, stock_quantity: 999 });
    assert.equal(r.items, list);
    assert.equal(r.needsRefetch, false);
  });
  test("ignores null payload and non-array items", () => {
    assert.equal(applyStockUpdate(list, null).items, list);
    assert.deepEqual(applyStockUpdate(null, { source: "raw_materials", product_id: 1 }).items, []);
  });
  test("deleted removes the row", () => {
    const r = applyStockUpdate(list, { source: "raw_materials", product_id: 7, status: "deleted" });
    assert.deepEqual(r.items.map((i) => i.productId), [8]);
    assert.equal(r.needsRefetch, false);
    const r2 = applyStockUpdate(list, { source: "raw_materials", product_id: "8", status: "Deleted" });
    assert.deepEqual(r2.items.map((i) => i.productId), [7]);
  });
  test("unknown id asks for a refetch", () => {
    const r = applyStockUpdate(list, { source: "raw_materials", product_id: 99, stock_quantity: 1 });
    assert.equal(r.items, list);
    assert.equal(r.needsRefetch, true);
  });
  test("partial (returnable-only) payload keeps every other field, no NaN", () => {
    const r = applyStockUpdate(list, { source: "raw_materials", product_id: 7, returnable_qty: "5.00", status: "updated" });
    const row = r.items.find((i) => i.productId === 7);
    assert.equal(row.returnableQty, 5);
    assert.equal(row.stockQuantity, 10);
    assert.equal(row.qtyRequired, 4);
    assert.equal(row.price, 12.5);
    for (const v of Object.values(row)) if (typeof v === "number") assert.ok(!Number.isNaN(v));
    assert.notEqual(r.items, list);
    assert.equal(list[0].returnableQty, 2, "input not mutated");
  });
  test("full payload updates numbers, location and image", () => {
    const r = applyStockUpdate(list, {
      source: "raw_materials",
      product_id: 7,
      stock_quantity: "3.50",
      returnable_qty: 0,
      qty_required: 9,
      location: null,
      image_url: "https://x",
    });
    const row = r.items[0];
    assert.equal(row.stockQuantity, 3.5);
    assert.equal(row.returnableQty, 0);
    assert.equal(row.qtyRequired, 9);
    assert.equal(row.location, null);
    assert.equal(row.imageUrl, "https://x");
  });
  test("non-numeric values are skipped, null numbers keep old value", () => {
    const r = applyStockUpdate(list, { source: "raw_materials", product_id: 7, stock_quantity: "oops", qty_required: null });
    assert.equal(r.items[0].stockQuantity, 10);
    assert.equal(r.items[0].qtyRequired, 4);
  });
  test("bad product id is ignored", () => {
    const r = applyStockUpdate(list, { source: "raw_materials", product_id: "abc", stock_quantity: 1 });
    assert.equal(r.items, list);
    assert.equal(r.needsRefetch, false);
  });
});

describe("formFromItem", () => {
  test("zeros stay '0', missing become ''", () => {
    const f = formFromItem(item({ stockQuantity: 0, qtyRequired: 0, returnableQty: 0, price: 0, description: null }));
    assert.equal(f.stockQuantity, "0");
    assert.equal(f.qtyRequired, "0");
    assert.equal(f.returnableQty, "0");
    assert.equal(f.price, "0");
    assert.equal(f.description, "");
    assert.deepEqual(Object.keys(f).sort(), Object.keys(EMPTY_FORM).sort());
  });
  test("null item → empty form", () => assert.deepEqual(formFromItem(null), { ...EMPTY_FORM }));
});

describe("validateStockForm", () => {
  test("valid form has no errors", () => {
    assert.deepEqual(validateStockForm(form()), {});
    assert.deepEqual(validateStockForm(form({ stockQuantity: "" }), { mode: "edit" }), {});
  });
  test("name required and length-limited", () => {
    assert.equal(validateStockForm(form({ productName: "  " })).productName, "Required");
    assert.ok(validateStockForm(form({ productName: "x".repeat(101) })).productName);
  });
  test("code length and pattern", () => {
    assert.equal(validateStockForm(form({ productCode: "0007L5BR12" })).productCode, "Must be exactly 11 characters");
    assert.ok(validateStockForm(form({ productCode: "A007L5BR123" })).productCode);
    assert.deepEqual(validateStockForm(form({ productCode: "0007l5br123" })), {}, "lower-case is upper-cased");
  });
  test("price required only when requirePrice", () => {
    assert.ok(validateStockForm(form({ price: "" })).price);
    assert.ok(validateStockForm(form({ price: "-1" })).price);
    assert.ok(validateStockForm(form({ price: "abc" })).price);
    assert.ok(validateStockForm(form({ price: "100000000" })).price);
    assert.equal(validateStockForm(form({ price: "" }), { requirePrice: false }).price, undefined);
    assert.equal(validateStockForm(form({ price: "0" })).price, undefined);
  });
  test("numbers", () => {
    assert.ok(validateStockForm(form({ stockQuantity: "-1" })).stockQuantity);
    assert.ok(validateStockForm(form({ stockQuantity: "x" })).stockQuantity);
    assert.ok(validateStockForm(form({ returnableQty: "-2" })).returnableQty);
    assert.ok(validateStockForm(form({ qtyRequired: "1.5" })).qtyRequired);
    assert.ok(validateStockForm(form({ qtyRequired: "-1" })).qtyRequired);
    assert.deepEqual(validateStockForm(form({ qtyRequired: "3", returnableQty: "1.5" })), {});
  });
  test("description limit", () => {
    assert.ok(validateStockForm(form({ description: "x".repeat(5001) })).description);
  });
  test("null form reports required fields", () => {
    const e = validateStockForm(null);
    assert.ok(e.productName && e.productCode && e.price);
  });
});

describe("stockChanged", () => {
  test("compares numerically", () => {
    assert.equal(stockChanged(form({ stockQuantity: "10.00" }), item()), false);
    assert.equal(stockChanged(form({ stockQuantity: "11" }), item()), true);
    assert.equal(stockChanged(form({ stockQuantity: "" }), item()), false);
    assert.equal(stockChanged(form({ stockQuantity: "abc" }), item()), false);
    assert.equal(stockChanged(form(), null), false);
    assert.equal(stockChanged(form({ stockQuantity: "0" }), item({ stockQuantity: "0.00" })), false);
  });
});

describe("buildStockPayload", () => {
  test("admin create: price, stock, returnable, auto flag", () => {
    const b = buildStockPayload(
      form({ productName: " Bearing ", productCode: "0007l5br123", price: "12.345", qtyRequired: "3", returnableQty: "2", description: " d " }),
      { mode: "create", includePrice: true, includeReturnable: true, partNumberAuto: true },
    );
    assert.deepEqual(b, {
      productName: "Bearing",
      productCode: "0007L5BR123",
      description: "d",
      price: 12.35,
      stockQuantity: 10,
      qtyRequired: 3,
      returnableQty: 2,
      leadDate: null,
      part_number_auto: true,
    });
  });
  test("create with blank stock sends 0; manual part number sends false", () => {
    const b = buildStockPayload(form({ stockQuantity: "" }), { mode: "create", partNumberAuto: false });
    assert.equal(b.stockQuantity, 0);
    assert.equal(b.part_number_auto, false);
    assert.equal("qtyRequired" in b, false);
    assert.equal("returnableQty" in b, false, "returnable off by default");
  });
  test("store create (no price) sends price 0", () => {
    const b = buildStockPayload(form({ price: "" }), { mode: "create", includePrice: false });
    assert.equal(b.price, 0);
  });
  test("store edit keeps original price", () => {
    const b = buildStockPayload(form({ price: "" }), { mode: "edit", original: item({ price: "45.50" }), includePrice: false });
    assert.equal(b.price, 45.5);
    assert.equal("part_number_auto" in b, false);
  });
  test("edit without stock change never sends a reason", () => {
    const b = buildStockPayload(form(), { mode: "edit", original: item(), stockChangeReason: "why" });
    assert.equal(b.stockQuantity, 10);
    assert.equal("stockChangeReason" in b, false);
  });
  test("edit with stock change sends trimmed reason, omits blank reason", () => {
    const b = buildStockPayload(form({ stockQuantity: "15" }), { mode: "edit", original: item(), stockChangeReason: "  recount " });
    assert.equal(b.stockQuantity, 15);
    assert.equal(b.stockChangeReason, "recount");
    const b2 = buildStockPayload(form({ stockQuantity: "15" }), { mode: "edit", original: item(), stockChangeReason: "  " });
    assert.equal("stockChangeReason" in b2, false);
  });
  test("edit with blank stock omits stockQuantity (server keeps it)", () => {
    const b = buildStockPayload(form({ stockQuantity: "" }), { mode: "edit", original: item() });
    assert.equal("stockQuantity" in b, false);
  });
  test("cleared description is sent as '' so the server clears it", () => {
    const b = buildStockPayload(form({ description: "   " }), { mode: "edit", original: item() });
    assert.equal(b.description, "");
  });
  test("returnable blank with includeReturnable is omitted", () => {
    const b = buildStockPayload(form({ returnableQty: "" }), { mode: "edit", original: item(), includeReturnable: true });
    assert.equal("returnableQty" in b, false);
    const b2 = buildStockPayload(form({ returnableQty: "0" }), { mode: "edit", original: item(), includeReturnable: true });
    assert.equal(b2.returnableQty, 0);
  });
});

describe("parseImportRows", () => {
  const existingById = new Map([[7, item()]]);
  const row = (over = {}) => ({
    "Product Name": "Shaft",
    "Product Code": "0009R1SH111",
    "Price (₹)": "₹1,250.50",
    "Stock Quantity": 5,
    "Qty Required": 2,
    ...over,
  });

  test("new row: parses ₹ and commas, defaults", () => {
    const { valid, errors } = parseImportRows([row()], { existingById });
    assert.deepEqual(errors, []);
    assert.deepEqual(valid, [
      { productId: null, body: { productName: "Shaft", productCode: "0009R1SH111", price: 1250.5, stockQuantity: 5, qtyRequired: 2 } },
    ]);
  });
  test("numeric price cell and lower-case code", () => {
    const { valid } = parseImportRows([row({ "Price (₹)": 3, "Product Code": "0009r1sh111" })]);
    assert.equal(valid[0].body.price, 3);
    assert.equal(valid[0].body.productCode, "0009R1SH111");
  });
  test("update row: existing id, reason 'Excel import'", () => {
    const { valid, errors } = parseImportRows([row({ "Product ID": 7, "Stock Quantity": "12" })], { existingById });
    assert.deepEqual(errors, []);
    assert.equal(valid[0].productId, 7);
    assert.equal(valid[0].body.stockQuantity, 12);
    assert.equal(valid[0].body.stockChangeReason, "Excel import");
  });
  test("update row without stock keeps stock and sends no reason", () => {
    const { valid } = parseImportRows([row({ "Product ID": "7", "Stock Quantity": "" })], { existingById });
    assert.equal("stockQuantity" in valid[0].body, false);
    assert.equal("stockChangeReason" in valid[0].body, false);
  });
  test("update row with blank price uses existing price", () => {
    const { valid } = parseImportRows([row({ "Product ID": 7, "Price (₹)": "" })], { existingById });
    assert.equal(valid[0].body.price, 12.5);
  });
  test("unknown / invalid Product ID is an error", () => {
    const { valid, errors } = parseImportRows([row({ "Product ID": 99 }), row({ "Product ID": "x1" })], { existingById });
    assert.equal(valid.length, 0);
    assert.match(errors[0], /^Row 2: Product ID 99 not found/);
    assert.match(errors[1], /^Row 3: invalid Product ID/);
  });
  test("store mode: price ignored, existing price or 0", () => {
    const { valid } = parseImportRows(
      [row({ "Price (₹)": "abc" }), row({ "Product ID": 7, "Price (₹)": "1" })],
      { existingById, includePrice: false },
    );
    assert.equal(valid[0].body.price, 0);
    assert.equal(valid[1].body.price, 12.5);
  });
  test("new row requires a price in admin mode", () => {
    const { errors } = parseImportRows([row({ "Price (₹)": "" })]);
    assert.match(errors[0], /Price required/);
  });
  test("field errors are collected per row and the row is skipped", () => {
    const { valid, errors } = parseImportRows([
      row({ "Product Name": "", "Product Code": "BAD", "Price (₹)": "-1", "Stock Quantity": "-3", "Qty Required": "1.5" }),
      row(),
    ]);
    assert.equal(valid.length, 1);
    assert.equal(errors.length, 5);
    errors.forEach((e) => assert.match(e, /^Row 2:/));
  });
  test("returnable only when includeReturnable", () => {
    assert.equal("returnableQty" in parseImportRows([row({ "Returnable Qty": 3 })]).valid[0].body, false);
    const r = parseImportRows([row({ "Returnable Qty": "3" })], { includeReturnable: true });
    assert.equal(r.valid[0].body.returnableQty, 3);
    const bad = parseImportRows([row({ "Returnable Qty": "-1" })], { includeReturnable: true });
    assert.match(bad.errors[0], /Returnable/);
  });
  test("description: present → trimmed, N/A → '', absent → omitted", () => {
    assert.equal(parseImportRows([row({ Description: " hi " })]).valid[0].body.description, "hi");
    assert.equal(parseImportRows([row({ Description: "N/A" })]).valid[0].body.description, "");
    assert.equal("description" in parseImportRows([row()]).valid[0].body, false);
  });
  test("empty / bad input", () => {
    assert.deepEqual(parseImportRows(null), { valid: [], errors: [] });
    assert.equal(parseImportRows([null]).errors.length > 0, true);
  });
});

describe("apiErrorMessage", () => {
  test("prefers error, then message, then details", () => {
    assert.equal(apiErrorMessage({ error: "a", message: "b" }, 400), "a");
    assert.equal(apiErrorMessage({ message: "b" }, 400), "b");
    assert.equal(apiErrorMessage({ details: [{ field: "x", message: "c" }] }, 400), "c");
    assert.equal(apiErrorMessage(null, 502), "Request failed (502)");
    assert.equal(apiErrorMessage("oops", 500), "Request failed (500)");
    assert.equal(apiErrorMessage({ details: [] }, 404), "Request failed (404)");
  });
});

describe("lead date helpers", () => {
  test("isValidLeadDate: real calendar dates in 2000..2100 only", () => {
    assert.equal(isValidLeadDate("2026-11-25"), true);
    assert.equal(isValidLeadDate("2028-02-29"), true, "leap year");
    assert.equal(isValidLeadDate("2026-02-29"), false, "non-leap year");
    assert.equal(isValidLeadDate("2100-02-29"), false, "2100 is not a leap year");
    assert.equal(isValidLeadDate("2026-13-01"), false);
    assert.equal(isValidLeadDate("2026-04-31"), false);
    assert.equal(isValidLeadDate("2026-1-5"), false);
    assert.equal(isValidLeadDate("1999-12-31"), false);
    assert.equal(isValidLeadDate("2101-01-01"), false);
    assert.equal(isValidLeadDate("2026-11-25T00:00:00Z"), false);
    assert.equal(isValidLeadDate(""), false);
    assert.equal(isValidLeadDate(null), false);
    assert.equal(isValidLeadDate(new Date()), false);
  });
  test("normalizeLeadDate keeps valid strings, everything else → null", () => {
    assert.equal(normalizeLeadDate("2026-11-25"), "2026-11-25");
    assert.equal(normalizeLeadDate("2026-11-25T00:00:00.000Z"), null);
    assert.equal(normalizeLeadDate(undefined), null);
    assert.equal(normalizeLeadDate(""), null);
  });
  test("formatLeadDate never shifts the day (no Date/timezone involved)", () => {
    assert.equal(formatLeadDate("2026-11-25"), "25-11-2026");
    assert.equal(formatLeadDate("2026-01-01"), "01-01-2026");
    assert.equal(formatLeadDate("2026-12-31"), "31-12-2026");
    assert.equal(formatLeadDate(null), "—");
    assert.equal(formatLeadDate("bad"), "—");
  });
  test("todayIso uses the local calendar date", () => {
    assert.equal(todayIso(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(todayIso(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
    assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  });
  test("isLeadDateOverdue compares against today", () => {
    assert.equal(isLeadDateOverdue("2026-11-19", "2026-11-20"), true);
    assert.equal(isLeadDateOverdue("2026-11-20", "2026-11-20"), false, "today is not overdue");
    assert.equal(isLeadDateOverdue("2026-11-21", "2026-11-20"), false);
    assert.equal(isLeadDateOverdue(null, "2026-11-20"), false);
    assert.equal(isLeadDateOverdue("garbage", "2026-11-20"), false);
  });
  test("parseLeadDateCell formats", () => {
    assert.deepEqual(parseLeadDateCell("2026-11-25"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("2026-1-5"), { value: "2026-01-05" });
    assert.deepEqual(parseLeadDateCell("25-11-2026"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("5/1/2026"), { value: "2026-01-05" });
    assert.deepEqual(parseLeadDateCell("25 Nov 2026"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("25 november 2026"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("25-Nov-2026"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("25.11.2026"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell(46351), { value: "2026-11-25" }, "Excel serial");
    assert.deepEqual(parseLeadDateCell("46351"), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell(new Date(2026, 10, 25)), { value: "2026-11-25" });
    assert.deepEqual(parseLeadDateCell("  "), { value: undefined });
    assert.deepEqual(parseLeadDateCell(undefined), { value: undefined });
    assert.deepEqual(parseLeadDateCell(null), { value: undefined });
  });
  test("parseLeadDateCell rejects nonsense", () => {
    for (const bad of ["31-02-2026", "2026-13-01", "soon", "25 Foo 2026", "1999-01-01", -5, 0, new Date("x")]) {
      assert.deepEqual(parseLeadDateCell(bad), { error: true }, String(bad));
    }
  });
});

describe("lead date in forms and payloads", () => {
  test("normalizeStockItem reads lead_date / leadDate", () => {
    assert.equal(normalizeStockItem({ lead_date: "2026-11-25" }).leadDate, "2026-11-25");
    assert.equal(normalizeStockItem({ leadDate: "2026-11-25" }).leadDate, "2026-11-25");
    assert.equal(normalizeStockItem({ lead_date: "2026-11-25T18:30:00.000Z" }).leadDate, null);
    assert.equal(normalizeStockItem({}).leadDate, null);
  });
  test("applyStockUpdate merges lead_date only when present", () => {
    const list = [item({ leadDate: "2026-11-25" })];
    const same = applyStockUpdate(list, { source: "raw_materials", product_id: 7, stock_quantity: 3 });
    assert.equal(same.items[0].leadDate, "2026-11-25");
    const cleared = applyStockUpdate(list, { source: "raw_materials", product_id: 7, lead_date: null });
    assert.equal(cleared.items[0].leadDate, null);
    const moved = applyStockUpdate(list, { source: "raw_materials", product_id: 7, lead_date: "2026-12-01" });
    assert.equal(moved.items[0].leadDate, "2026-12-01");
  });
  test("EMPTY_FORM / formFromItem", () => {
    assert.equal(EMPTY_FORM.leadDate, "");
    assert.equal(formFromItem(item({ leadDate: "2026-11-25" })).leadDate, "2026-11-25");
    assert.equal(formFromItem(item({ leadDate: null })).leadDate, "");
  });
  test("validateStockForm: optional, must be a real date when set", () => {
    assert.equal(validateStockForm(form({ leadDate: "" })).leadDate, undefined);
    assert.equal(validateStockForm(form({ leadDate: "2026-11-25" })).leadDate, undefined);
    assert.ok(validateStockForm(form({ leadDate: "2026-02-30" })).leadDate);
    assert.ok(validateStockForm(form({ leadDate: "25/11/2026" })).leadDate);
  });
  test("buildStockPayload always sends leadDate (null clears)", () => {
    assert.equal(buildStockPayload(form({ leadDate: "2026-11-25" }), { mode: "create" }).leadDate, "2026-11-25");
    assert.equal(buildStockPayload(form({ leadDate: "" }), { mode: "create" }).leadDate, null);
    const edit = buildStockPayload(form({ leadDate: "" }), { mode: "edit", original: item({ leadDate: "2026-11-25" }) });
    assert.ok("leadDate" in edit);
    assert.equal(edit.leadDate, null);
  });
  test("parseImportRows: Lead Date column", () => {
    const existingById = new Map([[7, item()]]);
    const base = { "Product Name": "Bearing", "Product Code": "0007L5BR123", "Price (₹)": "10" };
    const { valid, errors } = parseImportRows(
      [
        { ...base, "Lead Date": "25/11/2026" },
        { ...base, "Product ID": 7, "Lead Date": "" },
        { ...base, "Lead Date": "someday" },
        { ...base },
      ],
      { existingById },
    );
    assert.deepEqual(errors, ["Row 4: Invalid Lead Date"]);
    assert.equal(valid[0].body.leadDate, "2026-11-25");
    assert.equal("leadDate" in valid[1].body, false, "blank keeps stored value");
    assert.equal("leadDate" in valid[2].body, false, "missing column → omitted");
  });
});

describe("compareLeadDate", () => {
  test("orders by date and keeps blanks last in both directions", () => {
    const vals = ["2026-12-01", null, "2026-01-05", "", "2026-06-30"];
    assert.deepEqual([...vals].sort((a, b) => compareLeadDate(a, b, "asc")), ["2026-01-05", "2026-06-30", "2026-12-01", null, ""]);
    const desc = [...vals].sort((a, b) => compareLeadDate(a, b, "desc"));
    assert.deepEqual(desc.slice(0, 3), ["2026-12-01", "2026-06-30", "2026-01-05"]);
    assert.ok(!desc[3] && !desc[4]);
  });
});
