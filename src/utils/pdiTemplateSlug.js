// CRM/src/utils/pdiTemplateSlug.js
//
// Converts a plain-language label into the snake_case key style already
// used throughout this project's own hand-authored templates and dialect
// (customer_name, pdi_no, motor_sr_no, ...), and guarantees uniqueness
// against a set of keys already in use elsewhere. Shared between template-id
// generation (the creation form) and every field-key generation inside the
// section editors — see docs/superpowers/specs/2026-09-09-pdi-template-authoring-ux-redesign-design.md.

// lowercase, collapse any run of whitespace/non-alphanumeric characters into
// a single underscore, strip leading/trailing underscores. An empty or
// all-punctuation label correctly produces an empty string — callers should
// treat that as "no key yet" (matching a field the admin hasn't labeled yet),
// not as an error.
export function slugify(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Given a candidate key and the set of keys already used elsewhere, returns
// the candidate unchanged if it's free, or candidate_2, candidate_3, ...
// (first free suffix) if it collides. An empty candidate is returned
// unchanged (never suffixed) — see slugify's own note above.
export function dedupeKey(candidate, usedKeys) {
  if (!candidate) return candidate;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  if (!used.has(candidate)) return candidate;
  let n = 2;
  while (used.has(`${candidate}_${n}`)) n += 1;
  return `${candidate}_${n}`;
}

// Convenience: slugify then dedupe in one call — the common case everywhere
// this is used ("turn this label into a guaranteed-unique key").
export function labelToKey(label, usedKeys) {
  return dedupeKey(slugify(label), usedKeys);
}
