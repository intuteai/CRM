import {
  Truck, FileText, FilePlus, Mail, MessageSquare, Package, DollarSign, MapPin,
  PenTool, CheckSquare, BarChart, Wrench, Boxes, Layers, ShoppingCart,
} from 'lucide-react';
import { adminNavSections } from './adminNav';

// One entry per role that uses the sidebar shell. A role without an entry here
// keeps the classic top Navbar (see App.jsx). Each section may carry an `accent`
// (icon badge colour on the dashboard module cards) and a `shortLabel` (tab text).
const salesNavSections = [
  {
    title: 'Sales & Customer Management',
    shortLabel: 'Sales',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/orders', icon: Truck, label: 'Orders', desc: 'Track and process orders' },
      { to: '/customer-invoices', icon: FileText, label: 'Customer Invoices', desc: 'View customer invoices' },
      { to: '/sales/quotations', icon: FilePlus, label: 'Quotations', desc: 'Generate customer quotations' },
      { to: '/proforma', icon: FileText, label: 'Proforma Invoices', desc: 'Create and manage proforma invoices' },
      { to: '/purchase-order', icon: FileText, label: 'Purchase Orders', desc: 'Create and manage purchase orders' },
      { to: '/sales/enquiries', icon: Mail, label: 'Enquiries', desc: 'Manage enquiries' },
      { to: '/sales-queries', icon: MessageSquare, label: 'Queries', desc: 'Manage customer inquiries' },
    ],
  },
  {
    title: 'Inventory & Pricing',
    shortLabel: 'Inventory',
    accent: { bg: 'bg-amber-50', text: 'text-amber-600' },
    items: [
      { to: '/sales-inventory', icon: Package, label: 'Finished Goods', desc: 'Manage finished goods inventory' },
      { to: '/price-list', icon: DollarSign, label: 'Price List', desc: 'Access product pricing' },
    ],
  },
  {
    title: 'Logistics',
    shortLabel: 'Logistics',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/dispatch-tracking', icon: MapPin, label: 'Dispatch Tracking', desc: 'Track dispatch status' },
    ],
  },
];

const productionNavSections = [
  {
    title: 'Production Management',
    shortLabel: 'Production',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/production-orders', icon: Truck, label: 'Orders', desc: 'Track and manage orders' },
      { to: '/work-orders', icon: Wrench, label: 'Work Orders', desc: 'Manage work orders for production' },
      { to: '/motor-recipes', icon: Wrench, label: 'Motor Recipes', desc: 'View and manage motor winding recipes' },
      { to: '/ipt-kits', icon: Boxes, label: 'IPT Kit Assembly', desc: 'Record component serials for each IPT Kit' },
      { to: '/production-queries', icon: MessageSquare, label: 'Queries', desc: 'Manage production queries' },
    ],
  },
  {
    title: 'Materials & Stock',
    shortLabel: 'Stock',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/production-stock', icon: Package, label: 'Raw Materials', desc: 'Monitor raw material levels' },
      { to: '/production-inventory', icon: Package, label: 'Finished Goods', desc: 'Monitor finished goods stock' },
      { to: '/production-bom-unpriced', icon: BarChart, label: 'Bill of Materials (Unpriced)', desc: 'View unpriced BOMs' },
    ],
  },
  {
    title: 'Drawings & Quality',
    shortLabel: 'Quality',
    accent: { bg: 'bg-violet-50', text: 'text-violet-600' },
    items: [
      { to: '/production-part-drawings-raw', icon: PenTool, label: 'Raw Material Drawings', desc: 'Access raw material drawings' },
      { to: '/production-part-drawings', icon: PenTool, label: 'Finished Goods Drawings', desc: 'Access finished goods drawings' },
      { to: '/production-pdi', icon: CheckSquare, label: 'PDI Records', desc: 'View pre-dispatch inspection records' },
      { to: '/pdi-generator', icon: CheckSquare, label: 'PDI Generator', desc: 'Generate PDI inspection report PDFs' },
    ],
  },
];

const storeNavSections = [
  {
    title: 'Inventory Management',
    shortLabel: 'Inventory',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/inventory', icon: Package, label: 'Inventory', desc: 'Manage and view stock items' },
      { to: '/stock', icon: Package, label: 'Raw Materials', desc: 'Monitor raw material levels' },
    ],
  },
  {
    title: 'Bill of Materials',
    shortLabel: 'BOM',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/bom', icon: Layers, label: 'BOM (Unpriced)', desc: 'View unpriced Bill of Materials' },
    ],
  },
];

// Orders is deliberately absent: /orders is not in the dispatch role's allowed
// routes (constants.js / routeConfig.jsx), so the old dashboard tile bounced back.
const dispatchNavSections = [
  {
    title: 'Dispatch Management',
    shortLabel: 'Dispatch',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/queries', icon: MessageSquare, label: 'Queries', desc: 'Manage customer queries' },
      { to: '/stock', icon: Package, label: 'Stock', desc: 'Monitor stock availability' },
      { to: '/pdi', icon: FileText, label: 'PDI Reports', desc: 'View Pre-Dispatch Inspection reports' },
      { to: '/dispatch-tracking', icon: MapPin, label: 'Dispatch Tracking', desc: 'Track dispatch status and logistics' },
    ],
  },
];

const customerNavSections = [
  {
    title: 'My Account',
    shortLabel: 'Account',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/customer-orders', icon: Package, label: 'Orders', desc: 'Track your orders' },
      { to: '/customer-queries', icon: MessageSquare, label: 'Queries', desc: 'Manage your inquiries' },
    ],
  },
];

const designNavSections = [
  {
    title: 'Design & Enquiries',
    shortLabel: 'Design',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/design/enquiries', icon: Mail, label: 'Enquiries', desc: 'Manage enquiries' },
      { to: '/queries', icon: MessageSquare, label: 'Queries', desc: 'Manage customer and internal queries' },
      { to: '/design/part-creation', icon: PenTool, label: 'Part Creation', desc: 'Create and manage part creation' },
      { to: '/motor-recipes', icon: Wrench, label: 'Motor Recipes', desc: 'View and manage motor winding recipes' },
    ],
  },
  {
    title: 'Drawings & BOM',
    shortLabel: 'Drawings',
    accent: { bg: 'bg-violet-50', text: 'text-violet-600' },
    items: [
      { to: '/part-drawings/raw', icon: PenTool, label: 'Raw Part Drawings', desc: 'Access raw material drawings' },
      { to: '/part-drawings/finished', icon: PenTool, label: 'Finished Part Drawings', desc: 'Access finished good drawings' },
      { to: '/bom', icon: BarChart, label: 'Unpriced BOM', desc: 'Bill of Materials (view only)' },
    ],
  },
  {
    title: 'Quality',
    shortLabel: 'Quality',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/pdi', icon: CheckSquare, label: 'PDI Reports', desc: 'Pre-dispatch inspection details' },
    ],
  },
];

const accountsNavSections = [
  {
    title: 'Finance Management',
    shortLabel: 'Finance',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/customer-invoices', icon: FileText, label: 'Customer Invoices', desc: 'Manage customer billing and payments' },
      { to: '/purchase-invoices', icon: ShoppingCart, label: 'Purchase Invoices', desc: 'Track and manage purchase expenses' },
    ],
  },
  {
    title: 'Dispatch & Sales',
    shortLabel: 'Dispatch',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/dispatch-tracking', icon: MapPin, label: 'Dispatch Tracking', desc: 'Track dispatch status of orders' },
      { to: '/orders', icon: Truck, label: 'Orders', desc: 'Access and manage orders' },
    ],
  },
];

const serviceRepairNavSections = [
  {
    title: 'Service & Repair',
    shortLabel: 'Service',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/service-repair', icon: Wrench, label: 'Repair Records', desc: 'Log and manage service & repair jobs' },
    ],
  },
];

const representativeNavSections = [
  {
    title: 'Leads',
    shortLabel: 'Leads',
    accent: { bg: 'bg-gold-50', text: 'text-gold-600' },
    items: [
      { to: '/representative/enquiries', icon: Mail, label: 'Enquiries', desc: 'Capture and follow up on leads' },
    ],
  },
];

const roleNav = {
  admin: { dashboardPath: '/admin-dashboard', sections: adminNavSections },
  sales: { dashboardPath: '/sales-dashboard', sections: salesNavSections },
  production: { dashboardPath: '/production-dashboard', sections: productionNavSections },
  design: { dashboardPath: '/design-dashboard', sections: designNavSections },
  accounts: { dashboardPath: '/accounts-dashboard', sections: accountsNavSections },
  service_repair: { dashboardPath: '/service-repair-dashboard', sections: serviceRepairNavSections },
  store: { dashboardPath: '/store-dashboard', sections: storeNavSections },
  dispatch: { dashboardPath: '/dispatch-dashboard', sections: dispatchNavSections },
  representative: { dashboardPath: '/representative-dashboard', sections: representativeNavSections },
  customer: {
    dashboardPath: '/customer-dashboard',
    sections: customerNavSections,
    // Toasts shown while the dashboard is open (carried over from the old CustomerDashboard).
    socketToasts: [
      { event: 'orderUpdate', message: (order) => `Your order #${order.id} updated` },
      { event: 'queryUpdate', message: (query) => `Your query #${query.queryId} updated` },
    ],
  },
};

export const getRoleNav = (role) => roleNav[role] || null;
