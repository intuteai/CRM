import { ShieldCheck, Briefcase, Palette, MapPin } from "lucide-react";

const FIXED_ASSIGNEES = [
  { id: "1", label: "Admin", Icon: ShieldCheck },
  { id: "7", label: "Sales", Icon: Briefcase },
  { id: "8", label: "Design", Icon: Palette },
];

const AssigneePicker = ({ value, onChange, representatives = [] }) => {
  const options = [
    ...FIXED_ASSIGNEES,
    ...representatives.map((rep) => ({
      id: String(rep.user_id),
      label: representatives.length > 1 ? `Representative - ${rep.name}` : "Representative",
      Icon: MapPin,
    })),
  ];

  return (
    <div role="radiogroup" aria-label="Assignee" className="grid grid-cols-2 gap-2">
      {options.map(({ id, label, Icon }) => {
        const selected = String(value) === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400 ${
              selected
                ? "border-gold-400 bg-navy-50 text-navy-800"
                : "border-gray-200 bg-white text-gray-600 hover:border-navy-100 hover:bg-navy-50"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                selected ? "bg-navy-800 text-gold-400" : "bg-gray-100 text-gray-500"
              }`}
            >
              <Icon size={16} />
            </span>
            <span className="leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default AssigneePicker;
