import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ClipboardList, Truck, Plus, ArrowRight,
  CheckCircle, Calendar, Building2, Sparkles, Shield,
} from 'lucide-react';

const ALL_MODULES = [
  {
    id: 'quotation',
    title: 'Quotations',
    subtitle: 'Sales Proposals',
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    btnGradient: 'from-emerald-500 to-teal-600',
    glowColor: 'hover:shadow-emerald-100',
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
    gradient: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    btnGradient: 'from-blue-500 to-indigo-600',
    glowColor: 'hover:shadow-blue-100',
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
    gradient: 'from-violet-500 to-purple-600',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    btnGradient: 'from-violet-500 to-purple-600',
    glowColor: 'hover:shadow-violet-100',
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 relative overflow-x-hidden">

      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-48 -right-48 w-[480px] h-[480px] rounded-full bg-amber-400/5 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-72 h-72 rounded-full bg-emerald-400/5 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full bg-violet-400/5 blur-3xl" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="max-w-6xl mx-auto px-6 pt-10 pb-14">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-8 select-none">
            <Building2 size={12} />
            <span className="capitalize">{isSales ? 'Sales' : 'Admin'}</span>
            <span className="text-gray-700">/</span>
            <span className="text-amber-400 font-semibold">Document Center</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10">
            {/* Left: title + subtitle */}
            <div className="flex-1 max-w-xl">
              <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 rounded-full px-4 py-1.5 mb-5">
                <Sparkles size={12} className="text-amber-400" />
                <span className="text-amber-400 text-[11px] font-bold uppercase tracking-widest">
                  Document Center
                </span>
              </div>

              <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15] mb-4">
                Create &amp; Manage
                <br />
                <span className="bg-gradient-to-r from-amber-400 to-yellow-200 bg-clip-text text-transparent">
                  Business Documents
                </span>
              </h1>

              <p className="text-gray-400 text-base leading-relaxed">
                Generate professional quotations, proforma invoices
                {!isSales && ', and delivery challans'} — all in one place
                with instant PDF export.
              </p>
            </div>

            {/* Right: stat pills */}
            <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
              {[
                { icon: Calendar,  label: 'Fiscal Year',      value: '2025–26'        },
                { icon: FileText,  label: 'Document Types',   value: `${modules.length} Available` },
                { icon: Shield,    label: 'Format',            value: 'GST Compliant'  },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5"
                >
                  <Icon size={14} className="text-amber-400 shrink-0" />
                  <div>
                    <p className="text-white text-sm font-semibold leading-none">{value}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/5" />
      </div>

      {/* ── Module Cards ─────────────────────────────────────────── */}
      <div className="relative max-w-6xl mx-auto px-6 py-12">
        <div className={`grid grid-cols-1 gap-6 ${colClass}`}>
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                onClick={() => navigate(mod.route)}
                className={`group relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-lg hover:shadow-2xl ${mod.glowColor} transition-all duration-300 hover:-translate-y-1.5 cursor-pointer`}
              >
                {/* Coloured top stripe */}
                <div className={`h-1.5 bg-gradient-to-r ${mod.gradient}`} />

                <div className="p-7">
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
                    <h2 className="text-2xl font-bold text-gray-800">{mod.title}</h2>
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

                  <div className="border-t border-gray-100 mb-5" />

                  {/* CTA button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(mod.route); }}
                    className={`w-full bg-gradient-to-r ${mod.btnGradient} text-white font-semibold py-3 px-5 rounded-xl flex items-center justify-center gap-2.5 hover:opacity-90 hover:shadow-lg transition-all duration-200`}
                  >
                    <Plus size={17} />
                    <span>Create {mod.title}</span>
                    <ArrowRight
                      size={15}
                      className="ml-auto opacity-60 group-hover:translate-x-1 transition-transform duration-200"
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info strip */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center shrink-0">
              <Calendar size={15} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold">Fiscal Year 2025–26</p>
              <p className="text-gray-500 text-xs">April 2025 – March 2026</p>
            </div>
          </div>
          <p className="text-gray-600 text-xs text-center sm:text-right">
            All documents are generated as PDF and can be downloaded instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
