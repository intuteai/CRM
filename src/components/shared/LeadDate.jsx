import LeadDatePicker from "./LeadDatePicker";
import { formatLeadDate, isLeadDateOverdue } from "../../utils/stockForm";

/**
 * Table cell for a raw material's lead date (expected arrival), DD-MM-YYYY.
 * Red with an "Overdue" pill when the date has passed and stock is still
 * below the required quantity.
 */
export function LeadDateCell({ leadDate, isLow }) {
  if (!leadDate) return <span className="text-gray-400">—</span>;
  const overdue = isLow && isLeadDateOverdue(leadDate);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-sm ${overdue ? "text-red-600 font-medium" : "text-gray-700"}`}
      title={overdue ? "Expected arrival date has passed and stock is still low" : "Expected arrival date"}
    >
      {formatLeadDate(leadDate)}
      {overdue && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-red-100 text-red-700">
          Overdue
        </span>
      )}
    </span>
  );
}

/** Create/Edit form field: label + LeadDatePicker + helper text. */
export function LeadDateField({ value, onChange, error, disabled, labelClassName }) {
  return (
    <div>
      <label
        htmlFor="stock-lead-date"
        className={labelClassName || "block text-sm font-semibold text-navy-800 mb-1.5"}
      >
        Lead Date
      </label>
      <LeadDatePicker
        id="stock-lead-date"
        value={value || ""}
        onChange={onChange}
        error={error}
        disabled={disabled}
      />
      {!error && <p className="text-xs text-gray-500 mt-1">Expected arrival date of this material (DD-MM-YYYY)</p>}
    </div>
  );
}
