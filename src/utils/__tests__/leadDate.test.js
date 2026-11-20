import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  daysInMonth,
  isLeapYear,
  isoFromParts,
  partsFromIso,
  isValidIsoDate,
  formatDisplay,
  parseDisplay,
  maskDisplay,
  normaliseTyped,
  todayIso,
  clampIso,
  addDays,
  addMonths,
  addYears,
  weekdayMon,
  startOfWeek,
  endOfWeek,
  monthMatrix,
  ariaLabel,
  WEEKDAY_SHORT,
} from "../leadDate.js";

describe("calendar basics", () => {
  test("leap years", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(isLeapYear(2100), false);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 12), 31);
  });
  test("isoFromParts rejects impossible and out-of-range dates", () => {
    assert.equal(isoFromParts(2026, 11, 25), "2026-11-25");
    assert.equal(isoFromParts(2028, 2, 29), "2028-02-29");
    assert.equal(isoFromParts(2026, 2, 29), null);
    assert.equal(isoFromParts(2026, 2, 31), null);
    assert.equal(isoFromParts(2026, 13, 1), null);
    assert.equal(isoFromParts(2026, 0, 1), null);
    assert.equal(isoFromParts(2026, 1, 0), null);
    assert.equal(isoFromParts(1999, 12, 31), null);
    assert.equal(isoFromParts(2101, 1, 1), null);
    assert.equal(isoFromParts(2026.5, 1, 1), null);
  });
  test("partsFromIso / isValidIsoDate", () => {
    assert.deepEqual(partsFromIso("2026-11-25"), { year: 2026, month: 11, day: 25 });
    assert.equal(partsFromIso("2026-1-5"), null);
    assert.equal(partsFromIso("2026-02-30"), null);
    assert.equal(isValidIsoDate("2026-11-25T00:00:00Z"), false);
    assert.equal(isValidIsoDate(null), false);
  });
});

describe("display format DD-MM-YYYY", () => {
  test("formatDisplay", () => {
    assert.equal(formatDisplay("2026-11-25"), "25-11-2026");
    assert.equal(formatDisplay("2026-01-05"), "05-01-2026");
    assert.equal(formatDisplay(""), "");
    assert.equal(formatDisplay("2026-02-30"), "");
  });
  test("parseDisplay accepts typed and pasted variants", () => {
    for (const s of ["25-11-2026", "25/11/2026", "25.11.2026", "25 11 2026", "2026-11-25", "2026/11/25", "25112026", " 25-11-2026 "]) {
      assert.equal(parseDisplay(s), "2026-11-25", s);
    }
    assert.equal(parseDisplay("5-1-2026"), "2026-01-05");
  });
  test("parseDisplay rejects impossible / partial input", () => {
    for (const s of ["31-02-2026", "29-02-2026", "00-11-2026", "25-13-2026", "25-11-26", "25-11", "", null, "abc", "25-11-1999", "2026-11-25T00:00"]) {
      assert.equal(parseDisplay(s), null, String(s));
    }
    assert.equal(parseDisplay("29-02-2028"), "2028-02-29", "leap day");
  });
  test("round trip for every day of a leap year", () => {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= daysInMonth(2028, m); d++) {
        const iso = isoFromParts(2028, m, d);
        assert.equal(parseDisplay(formatDisplay(iso)), iso);
      }
    }
  });
});

describe("typing mask", () => {
  test("inserts dashes as digits arrive", () => {
    assert.equal(maskDisplay(""), "");
    assert.equal(maskDisplay("2"), "2");
    assert.equal(maskDisplay("25"), "25");
    assert.equal(maskDisplay("251"), "25-1");
    assert.equal(maskDisplay("2511"), "25-11");
    assert.equal(maskDisplay("25112"), "25-11-2");
    assert.equal(maskDisplay("25112026"), "25-11-2026");
  });
  test("ignores non-digits and caps at 8 digits", () => {
    assert.equal(maskDisplay("25-11-2026"), "25-11-2026");
    assert.equal(maskDisplay("25-11-20261"), "25-11-2026");
    assert.equal(maskDisplay("ab25cd"), "25");
    assert.equal(maskDisplay(null), "");
  });
  test("backspace over a dash removes it naturally", () => {
    // '25-11' with the last digit deleted → browser gives '25-1' → stays '25-1'
    assert.equal(maskDisplay("25-1"), "25-1");
    // '25-' (dash left alone after deleting) collapses to '25'
    assert.equal(maskDisplay("25-"), "25");
    assert.equal(maskDisplay("25-11-"), "25-11");
  });
  test("normaliseTyped: pasted full dates are reformatted", () => {
    assert.equal(normaliseTyped("25/11/2026"), "25-11-2026");
    assert.equal(normaliseTyped("25.11.2026"), "25-11-2026");
    assert.equal(normaliseTyped("2026-11-25"), "25-11-2026");
    assert.equal(normaliseTyped("5/1/2026"), "05-01-2026");
    assert.equal(normaliseTyped("2511"), "25-11");
    assert.equal(normaliseTyped("31/02/2026"), "31-02-2026", "impossible paste is just masked");
  });
});

describe("date arithmetic (DST-safe)", () => {
  test("todayIso uses local calendar fields", () => {
    assert.equal(todayIso(new Date(2026, 2, 29, 0, 30)), "2026-03-29");
    assert.equal(todayIso(new Date(2026, 9, 25, 23, 59)), "2026-10-25");
  });
  test("addDays across month, year and DST boundaries", () => {
    assert.equal(addDays("2026-03-28", 1), "2026-03-29");
    assert.equal(addDays("2026-03-29", 1), "2026-03-30");
    assert.equal(addDays("2026-10-25", 1), "2026-10-26");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-01-01", 365), "2027-01-01");
  });
  test("addMonths clamps the day; addYears", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
    assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
    assert.equal(addYears("2028-02-29", 1), "2029-02-28");
    assert.equal(addYears("2026-06-01", -2), "2024-06-01");
  });
  test("range clamping at 2000 / 2100", () => {
    assert.equal(addDays("2000-01-01", -1), "2000-01-01");
    assert.equal(addDays("2100-12-31", 1), "2100-12-31");
    assert.equal(addMonths("2000-01-15", -1), "2000-01-01");
    assert.equal(addYears("2100-06-01", 1), "2100-12-31");
    assert.equal(clampIso("1990-05-05"), "2000-01-01");
  });
  test("week helpers (Monday first)", () => {
    assert.equal(weekdayMon("2026-11-23"), 0, "Monday");
    assert.equal(weekdayMon("2026-11-29"), 6, "Sunday");
    assert.equal(startOfWeek("2026-11-25"), "2026-11-23");
    assert.equal(endOfWeek("2026-11-25"), "2026-11-29");
    assert.equal(startOfWeek("2026-11-23"), "2026-11-23");
    assert.equal(endOfWeek("2026-11-29"), "2026-11-29");
  });
});

describe("monthMatrix", () => {
  test("6×7, Monday first, flags in-month days", () => {
    const m = monthMatrix(2026, 11); // 1 Nov 2026 is a Sunday
    assert.equal(m.length, 6);
    m.forEach((row) => assert.equal(row.length, 7));
    assert.equal(m[0][0].iso, "2026-10-26");
    assert.equal(m[0][0].inMonth, false);
    assert.equal(m[0][6].iso, "2026-11-01");
    assert.equal(m[0][6].inMonth, true);
    const inMonth = m.flat().filter((c) => c.inMonth);
    assert.equal(inMonth.length, 30);
    for (const row of m) assert.equal(weekdayMon(row[0].iso), 0);
    assert.deepEqual(WEEKDAY_SHORT, ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });
  test("month starting on Monday has no leading days", () => {
    const m = monthMatrix(2026, 6); // 1 Jun 2026 is a Monday
    assert.equal(m[0][0].iso, "2026-06-01");
    assert.equal(m.flat().filter((c) => c.inMonth).length, 30);
  });
  test("February in leap and non-leap years", () => {
    assert.equal(monthMatrix(2028, 2).flat().filter((c) => c.inMonth).length, 29);
    assert.equal(monthMatrix(2026, 2).flat().filter((c) => c.inMonth).length, 28);
  });
  test("days outside 2000..2100 have no iso", () => {
    const m = monthMatrix(2000, 1); // leading days fall in Dec 1999
    assert.equal(m[0][0].iso, null);
    assert.ok(m.flat().some((c) => c.iso === "2000-01-01"));
  });
  test("every cell is consecutive", () => {
    const cells = monthMatrix(2026, 3).flat();
    for (let i = 1; i < cells.length; i++) assert.equal(addDays(cells[i - 1].iso, 1), cells[i].iso);
  });
});

test("ariaLabel", () => {
  assert.equal(ariaLabel("2026-11-25"), "Wednesday, 25 November 2026");
  assert.equal(ariaLabel("bad"), "");
});
