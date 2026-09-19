import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ClipboardList, Truck, Plus, ArrowRight,
  CheckCircle, Calendar,
} from 'lucide-react';

const ALL_MODULES = [
  {
    id: 'quotation',
    title: 'Quotations',
    subtitle: 'Sales Proposals',
    icon: FileText,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    adminRoute: '/quotation',
    salesRoute: '/sales/quotations',
    description:
      'Create professional sales quotations with itemized pricing, configurable GST, and custom terms & conditions.',
    features: [
      'Itemized pricing with HSN codes',
      'Configurable GST rates',
      'Custom terms & conditions',
      'Instant PDF export',
    ],
    badge: 'FY 2025-26',
    badgeBg: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'proforma',
    title: 'Proforma Invoice',
    subtitle: 'Pre-Payment Billing',
    icon: ClipboardList,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    adminRoute: '/proforma',
    salesRoute: '/proforma',
    description:
      'Generate proforma invoices with RTGS payment details for advance billing and order confirmation.',
    features: [
      'RTGS banking details included',
      'Order reference tracking',
      'GST compliant format',
      'Instant PDF export',
    ],
    badge: 'AXIS BANK',
    badgeBg: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'challan',
    title: 'Delivery Challan',
    subtitle: 'Goods Dispatch',
    icon: Truck,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    adminRoute: '/delivery-challan',
    salesRoute: null,
    description:
      'Create delivery challans for goods dispatch with smart inventory lookup, vehicle info, and returnable item tracking.',
    features: [
      'Smart inventory search',
      'Vehicle number tracking',
      'Returnable item flags',
      'Instant PDF export',
    ],
    badge: 'Dispatch',
    badgeBg: 'bg-violet-100 text-violet-700',
  },
];

export default function DocumentsHub({ userRole }) {
  const navigate = useNavigate();
  const isSales = userRole === 'sales';

  const modules = ALL_MODULES.filter(
    (m) => !isSales || m.salesRoute !== null
  ).map((m) => ({
    ...m,
    route: isSales ? m.salesRoute : m.adminRoute,
  }));

  const colClass =
    modules.length === 3
      ? 'lg:grid-cols-3'
      : 'lg:grid-cols-2 max-w-3xl mx-auto';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <p className="text-gray-500 text-sm">
        Generate professional quotations, proforma invoices
        {!isSales && ', and delivery challans'} — all in one place with instant PDF export.
      </p>

      {/* ── Module Cards ─────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 gap-6 ${colClass}`}>
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.id}
              onClick={() => navigate(mod.route)}
              className="bg-white rounded-xl border border-navy-100 hover:border-gold-400 hover:shadow-md transition-all cursor-pointer p-6 flex flex-col"
            >
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-6">
                <div className={`${mod.iconBg} p-3.5 rounded-xl`}>
                  <Icon size={26} className={mod.iconColor} />
                </div>
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full tracking-wide ${mod.badgeBg}`}>
                  {mod.badge}
                </span>
              </div>

              {/* Title */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">
                  {mod.subtitle}
                </p>
                <h2 className="text-xl font-bold text-navy-800">{mod.title}</h2>
              </div>

              {/* Description */}
              <p className="text-gray-500 text-sm leading-relaxed mb-6">{mod.description}</p>

              {/* Feature list */}
              <ul className="space-y-2.5 mb-7">
                {mod.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle size={14} className={`${mod.iconColor} shrink-0`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-navy-100 mb-5 mt-auto" />

              {/* CTA button */}
              <button
                onClick={(e) => { e.stopPropagation(); navigate(mod.route); }}
                className="w-full bg-gold-500 text-navy-900 font-semibold py-3 px-5 rounded-lg flex items-center justify-center gap-2.5 hover:bg-gold-400 transition-colors"
              >
                <Plus size={17} />
                <span>Create {mod.title}</span>
                <ArrowRight size={15} className="ml-auto opacity-60" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer info strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-navy-50 border border-navy-100 rounded-xl px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
            <Calendar size={15} className="text-gold-600" />
          </div>
          <div>
            <p className="text-navy-800 text-sm font-semibold">Fiscal Year 2025–26</p>
            <p className="text-gray-500 text-xs">April 2025 – March 2026</p>
          </div>
        </div>
        <p className="text-gray-500 text-xs text-center sm:text-right">
          All documents are generated as PDF and can be downloaded instantly.
        </p>
      </div>
    </div>
  );
}
