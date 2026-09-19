import {
  Package, MessageSquare, Truck, Users, FileText, BarChart,
  PenTool, DollarSign, CheckSquare, Mail, MapPin, AlertTriangle,
  Wrench, Boxes, FileEdit,
} from 'lucide-react';

// Shared by the Sidebar (accordion menu) and the dashboard's Module Showcase
// so both stay in sync with a single source of truth for Admin navigation.
// `accent` colors the icon badge on each module card in the showcase.
export const adminNavSections = [
  {
    title: 'Sales & Customer Management',
    shortLabel: 'Sales',
    accent: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    items: [
      { to: '/orders', icon: Truck, label: 'Orders', desc: 'Track and process orders' },
      { to: '/customer-invoices', icon: FileText, label: 'Customer Invoices', desc: 'View customer invoices' },
      { to: '/customer-list', icon: Users, label: 'Customers', desc: 'View customer details' },
      { to: '/enquiries', icon: Mail, label: 'Enquiries', desc: 'Manage enquiries' },
      { to: '/queries', icon: MessageSquare, label: 'Queries', desc: 'Manage customer inquiries' },
      { to: '/quotation', icon: FileText, label: 'Quotations', desc: 'Create and manage quotations' },
      { to: '/proforma', icon: FileText, label: 'Proforma Invoices', desc: 'Create and manage proforma invoices' },
      { to: '/delivery-challan', icon: FileText, label: 'Delivery Challan', desc: 'Create and manage delivery challans' },
    ],
  },
  {
    title: 'Inventory & Materials',
    shortLabel: 'Inventory',
    accent: { bg: 'bg-amber-50', text: 'text-amber-600' },
    items: [
      { to: '/inventory', icon: Package, label: 'Finished Goods', desc: 'Manage finished goods inventory' },
      { to: '/stock', icon: Package, label: 'Raw Materials', desc: 'Monitor raw material levels' },
      { to: '/price-list', icon: DollarSign, label: 'Price List', desc: 'View pricing details' },
      { to: '/bom', icon: BarChart, label: 'Bill of Materials', desc: 'Bill of materials' },
      { to: '/part-drawings', icon: PenTool, label: 'Part Drawings', desc: 'Access part drawings' },
      { to: '/part-creation', icon: PenTool, label: 'Part Creation', desc: 'Create and manage part creation' },
    ],
  },
  {
    title: 'Production Management',
    shortLabel: 'Production',
    accent: { bg: 'bg-slate-100', text: 'text-slate-600' },
    items: [
      { to: '/work-orders', icon: Wrench, label: 'Work Orders', desc: 'Manage work orders for production' },
      { to: '/motor-recipes', icon: Wrench, label: 'Motor Recipes', desc: 'Winding specs per customer motor' },
      { to: '/ipt-kits', icon: Boxes, label: 'IPT Kit Assembly', desc: 'Record component serials for each IPT Kit' },
    ],
  },
  {
    title: 'Quality & Logistics',
    shortLabel: 'Quality',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    items: [
      { to: '/pdi', icon: CheckSquare, label: 'PDI Records', desc: 'View pre-dispatch inspection records' },
      { to: '/pdi-generator', icon: CheckSquare, label: 'PDI Generator', desc: 'Generate PDI inspection report PDFs' },
      { to: '/pdi-templates', icon: FileEdit, label: 'PDI Templates', desc: 'Author new PDI report formats' },
      { to: '/dispatch-tracking', icon: MapPin, label: 'Dispatch Tracking', desc: 'Track dispatch status' },
      { to: '/problems', icon: AlertTriangle, label: 'Problems', desc: 'Manage reported problems' },
    ],
  },
  {
    title: 'Procurement',
    shortLabel: 'Procurement',
    accent: { bg: 'bg-orange-50', text: 'text-orange-600' },
    items: [
      { to: '/purchase-order', icon: FileText, label: 'Purchase Orders', desc: 'Create and manage purchase orders' },
      { to: '/purchase-invoices', icon: FileText, label: 'Purchase Invoices', desc: 'View supplier invoices' },
    ],
  },
  {
    title: 'Service & Repair',
    shortLabel: 'Service',
    accent: { bg: 'bg-violet-50', text: 'text-violet-600' },
    items: [
      { to: '/service-repair', icon: Wrench, label: 'Repair Records', desc: 'Log and manage service & repair jobs' },
    ],
  },
];
