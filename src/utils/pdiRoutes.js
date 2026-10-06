// Single source of truth for PDI form URLs. A built-in template's route
// slug isn't always its template id (autonxt_controller lives at
// /pdi-generator/autonxt-controller), so never build these URLs inline from
// a template id.
const FORM_SLUG = {
  general: 'general',
  autonxt: 'autonxt',
  autonxt_controller: 'autonxt-controller',
};

const BATCH_SLUG = {
  autonxt: 'autonxt-batch',
  autonxt_controller: 'autonxt-controller-batch',
};

export const BATCHABLE_TEMPLATE_IDS = Object.keys(BATCH_SLUG);

export function pdiFormPath(templateId, reportId) {
  const id = templateId || 'general';
  const base = `/pdi-generator/${FORM_SLUG[id] ?? id}`;
  return reportId ? `${base}?report=${reportId}` : base;
}

export function pdiBatchPath(templateId, batchId) {
  const slug = BATCH_SLUG[templateId];
  if (!slug) return null;
  const base = `/pdi-generator/${slug}`;
  return batchId ? `${base}?batch=${batchId}` : base;
}
