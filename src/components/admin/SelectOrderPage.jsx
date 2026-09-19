import React from "react";
import { Link, useParams } from "react-router-dom";
import { PlusCircle, Edit } from "lucide-react";

function SplitSection({ to, icon, title, desc, iconBg, iconColor }) {
  return (
    <Link
      to={to}
      className="group flex-1 flex flex-col items-center justify-center p-10 text-center bg-white hover:bg-navy-50/60 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
      aria-label={`Navigate to ${title}`}
    >
      <div className={`mb-6 p-5 rounded-full ${iconBg}`}>
        {React.cloneElement(icon, {
          className: `w-9 h-9 ${iconColor}`,
        })}
      </div>

      <h2 className="font-display text-2xl font-bold text-navy-800 mb-3">
        {title}
      </h2>

      <p className="text-gray-600 text-base leading-relaxed max-w-sm">
        {desc}
      </p>
    </Link>
  );
}

export default function SelectOrderPage() {
  const { orderId } = useParams();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-navy-100 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-navy-100 min-h-[380px]">
          <SplitSection
            to={`/processes/${orderId}`}
            icon={<PlusCircle />}
            title="Motor Process"
            desc="Track and monitor your motor production process with real-time insights"
            iconBg="bg-navy-50"
            iconColor="text-navy-800"
          />

          <SplitSection
            to={`/processes/non-motor/${orderId}`}
            icon={<Edit />}
            title="Auxiliary Process"
            desc="Manage auxiliary components and supporting systems efficiently"
            iconBg="bg-gold-400/20"
            iconColor="text-gold-600"
          />
        </div>
      </div>
    </div>
  );
}
