// Motor serial helpers for the General PDI form. generateSerialBatch is a
// straight port of pdi-erp-app/src/services/motorSerials.ts so the web form
// and the mobile app build identical serials from the same input. Any change
// to the serial rules must be made in both places.

export const MAX_BATCH_MOTORS = 200;

const normalizeSerial = (value) => String(value ?? '').trim().toUpperCase();

// Row indexes whose Motor Sr. No. is also used by another row. Blank serials
// are ignored; comparison ignores case and surrounding spaces, like the app.
export function findDuplicateSerialIndexes(rows) {
  const indexesBySerial = new Map();
  rows.forEach((row, index) => {
    const serial = normalizeSerial(row?.motor_sr_no);
    if (serial) {
      indexesBySerial.set(serial, [...(indexesBySerial.get(serial) || []), index]);
    }
  });

  const duplicates = new Set();
  indexesBySerial.forEach((indexes) => {
    if (indexes.length > 1) indexes.forEach((index) => duplicates.add(index));
  });
  return duplicates;
}

export function listDuplicateSerials(rows) {
  const seen = new Set();
  const duplicates = new Set();
  rows.forEach((row) => {
    const serial = normalizeSerial(row?.motor_sr_no);
    if (!serial) return;
    if (seen.has(serial)) duplicates.add(serial);
    seen.add(serial);
  });
  return [...duplicates];
}

// Builds consecutive serials by incrementing the trailing number of the first
// serial and keeping its prefix and zero padding: MTR-0098 → MTR-0099, MTR-0100.
// Returns { serials } or { error }. maxQuantity defaults to the app's limit;
// the web form passes its own (smaller) row cap.
export function generateSerialBatch(firstSerial, quantity, maxQuantity = MAX_BATCH_MOTORS) {
  const start = String(firstSerial ?? '').trim();
  const match = /^(.*?)(\d+)$/.exec(start);
  if (!match) {
    return { error: 'The first serial number must end with a number.' };
  }

  const quantityText = String(quantity ?? '').trim();
  const count = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
  if (!Number.isInteger(count) || count < 1 || count > maxQuantity) {
    return { error: `Enter a quantity between 1 and ${maxQuantity}.` };
  }

  const [, prefix, digits] = match;
  const first = BigInt(digits);
  return {
    serials: Array.from(
      { length: count },
      (_, offset) => `${prefix}${(first + BigInt(offset)).toString().padStart(digits.length, '0')}`,
    ),
  };
}

// A row nobody has typed into yet (Mounting PCD / Key Dim. still on their
// default GO). Batch generation replaces these instead of leaving empty motors
// in the report — same rule as the app's isBlankMotorRow.
export function isBlankMotorRow(row) {
  const resultWasEntered = (value) => {
    const text = String(value ?? '').trim().toUpperCase();
    return text && text !== 'GO' ? text : '';
  };
  return [
    row?.motor_sr_no,
    row?.voltage,
    row?.current_measured,
    row?.rpm_measured,
    row?.electrical_remarks,
    row?.motor_length,
    row?.shaft_length,
    row?.shaft_diameter,
    row?.mtg,
    row?.locating_dia_result,
    row?.mechanical_remarks,
    resultWasEntered(row?.key_dim_result),
    resultWasEntered(row?.mounting_pcd),
  ].every((value) => !String(value ?? '').trim());
}
