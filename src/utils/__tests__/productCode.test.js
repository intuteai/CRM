import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_CHARTS,
  SUB_CODES,
  pad4,
  chartPair,
  buildCode,
  parseCode,
  isValidProductCode,
  suggestPartNumber,
  PRODUCT_CODE_RE,
} from "../productCode.js";

describe("pad4", () => {
  test("pads, clamps and defaults", () => {
    assert.equal(pad4("42"), "0042");
    assert.equal(pad4(7), "0007");
    assert.equal(pad4("9999"), "9999");
    assert.equal(pad4("12345"), "9999");
    assert.equal(pad4("0"), "0001");
    assert.equal(pad4("-5"), "0001");
    assert.equal(pad4(""), "0001");
    assert.equal(pad4("abc"), "0001");
    assert.equal(pad4(undefined), "0001");
  });
});

describe("chart table", () => {
  test("every chart has a unique 2-char pair", () => {
    const pairs = PRODUCT_CHARTS.map(chartPair);
    pairs.forEach((p) => assert.equal(p.length, 2, p));
    assert.equal(new Set(pairs).size, pairs.length);
    assert.deepEqual(pairs, ["L5", "R1", "W2", "A0", "S3", "CO", "GN", "MO"]);
  });
  test("chartPair of null is empty", () => assert.equal(chartPair(null), ""));
  test("sub codes are 2 chars", () => SUB_CODES.forEach((s) => assert.equal(s.abbr.length, 2)));
});

describe("buildCode / parseCode round-trip", () => {
  for (const chart of PRODUCT_CHARTS) {
    test(`chart ${chart.label} (${chartPair(chart)})`, () => {
      const segs = {
        partNum: "0042",
        chartSymbol: chart.symbol,
        chartDigit: chart.digit,
        subAbbr: chart.defaultSub || "XY",
        storeNum: "1",
        colNum: "2",
        rowNum: "3",
      };
      const code = buildCode(segs);
      assert.equal(code.length, 11);
      assert.equal(code, `0042${chartPair(chart)}${segs.subAbbr}123`);
      assert.ok(isValidProductCode(code));
      const parsed = parseCode(code);
      assert.equal(parsed.chart, chart);
      assert.equal(parsed.partNum, "0042");
      assert.equal(parsed.subAbbr, segs.subAbbr);
      assert.equal(parsed.storeNum, "1");
      assert.equal(parsed.colNum, "2");
      assert.equal(parsed.rowNum, "3");
      assert.equal(
        buildCode({ ...parsed, chartSymbol: parsed.chartSymbol, chartDigit: parsed.chartDigit }),
        code,
      );
    });
  }

  test("CO is built from symbol C with no digit", () => {
    assert.equal(
      buildCode({ partNum: "1", chartSymbol: "C", chartDigit: "", subAbbr: "AU", storeNum: "1", colNum: "1", rowNum: "1" }),
      "0001COAU111",
    );
    const p = parseCode("0001COAU111");
    assert.equal(p.chartSymbol, "C");
    assert.equal(p.chartDigit, "");
    assert.equal(p.chart.label, "CO");
  });

  test("missing sub code is padded with _ ; missing tail shortens", () => {
    const code = buildCode({ partNum: "0005", chartSymbol: "L", chartDigit: "5", subAbbr: "", storeNum: "", colNum: "", rowNum: "" });
    assert.equal(code, "0005L5__");
    assert.equal(buildCode({}), "0001__");
  });

  test("segments longer than allowed are truncated", () => {
    assert.equal(
      buildCode({ partNum: "123456", chartSymbol: "L", chartDigit: "5", subAbbr: "BRX", storeNum: "12", colNum: "34", rowNum: "56" }),
      "1234L5BR135",
    );
  });

  test("unknown chart pair parses with chart null", () => {
    const p = parseCode("0042ZZBR123");
    assert.equal(p.chart, null);
    assert.equal(p.chartSymbol, "Z");
  });

  test("parseCode rejects non-11 / non-strings", () => {
    assert.equal(parseCode(""), null);
    assert.equal(parseCode("0042L5BR12"), null);
    assert.equal(parseCode("0042L5BR1234"), null);
    assert.equal(parseCode(null), null);
    assert.equal(parseCode(42), null);
  });
});

describe("isValidProductCode", () => {
  test("accepts the stored pattern", () => {
    for (const c of ["0042L5BR123", "0001COAU111", "9999GNXY000", "0170MO12999"]) assert.ok(isValidProductCode(c), c);
  });
  test("rejects bad codes", () => {
    for (const c of ["", "0042L5BR12", "0042L5BR1234", "A042L5BR123", "0042l5br123", "0042L5B_123", "0042L5BR12A", "0042-5BR123", null, undefined, 42]) {
      assert.equal(isValidProductCode(c), false, String(c));
    }
  });
  test("regex is anchored", () => assert.equal(PRODUCT_CODE_RE.test("x0042L5BR123"), false));
});

describe("suggestPartNumber", () => {
  test("max productId + 1", () => {
    assert.equal(suggestPartNumber([{ productId: 3 }, { productId: 170 }, { productId: 12 }]), "0171");
  });
  test("accepts snake_case and numeric strings", () => {
    assert.equal(suggestPartNumber([{ product_id: "41" }]), "0042");
  });
  test("empty / bad input → 0001", () => {
    assert.equal(suggestPartNumber([]), "0001");
    assert.equal(suggestPartNumber(null), "0001");
    assert.equal(suggestPartNumber([{ productId: "abc" }, {}, null]), "0001");
  });
  test("caps at 9999", () => assert.equal(suggestPartNumber([{ productId: 9999 }]), "9999"));
});
