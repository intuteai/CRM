import {
  Clock, CalendarCheck, ClipboardList, Users, Package, FileText, Wallet,
} from 'lucide-react';

// Card accent palettes. Full class strings so Tailwind can see them.
const ACCENTS = {
  amber:   { bar: 'bg-amber-500',   tile: 'bg-amber-100 text-amber-600',     link: 'text-amber-600' },
  orange:  { bar: 'bg-orange-500',  tile: 'bg-orange-100 text-orange-600',   link: 'text-orange-600' },
  purple:  { bar: 'bg-purple-500',  tile: 'bg-purple-100 text-purple-600',   link: 'text-purple-600' },
  blue:    { bar: 'bg-blue-500',    tile: 'bg-blue-100 text-blue-600',       link: 'text-blue-600' },
  teal:    { bar: 'bg-teal-500',    tile: 'bg-teal-100 text-teal-600',       link: 'text-teal-600' },
  emerald: { bar: 'bg-emerald-500', tile: 'bg-emerald-100 text-emerald-600', link: 'text-emerald-600' },
};

const card = (to, icon, title, desc, accent) => ({ to, icon, title, desc, accent: ACCENTS[accent] });

const attendanceHistory = card('/attendance-history', Clock, 'Attendance History', 'View your past attendance records', 'amber');
const iaAttendanceHistory = card('/ia-attendance-history', Clock, 'Attendance History', 'View your past attendance records', 'amber');
const dispatchOrders = card('/ia-orders', Package, 'Dispatch Orders', 'Track VCU and HMI dispatch with serial numbers', 'purple');
const invoiceGenerator = card('/ia-invoices', FileText, 'Invoice Generator', 'Generate customer invoices with auto GST and PDF download', 'blue');

// Toasts shown while the dashboard is open. `type` picks notifySuccess / notifyInfo.
const attendanceMarked = { event: 'attendanceMarked', type: 'success', message: (a) => `Attendance marked for ${a?.date}` };
const leaveRequest = { event: 'leaveRequestCreated', type: 'info', message: (d) => `New leave request from ${d?.name || 'employee'}` };
const payroll = { event: 'payrollProcessed', type: 'success', message: (d) => `Payroll for ${d?.month || 'month'} processed` };
const newOrder = { event: 'ia_orders:created', type: 'success', message: (d) => `New order: ${d?.invoice_number || ''}` };

const peopleNav = {
  hr: {
    title: 'HR · Compage',
    cards: [
      card('/attendance-summary', CalendarCheck, 'Attendance Summary', 'Daily / monthly attendance reports for all employees', 'amber'),
      card('/hr-activities', ClipboardList, 'Activities', 'Create and manage tasks assigned to Compage employees', 'orange'),
      card('/employee-details', Users, 'Employee Details', 'View, add and update employee contact and onboarding information', 'teal'),
    ],
    socketToasts: [leaveRequest, payroll],
  },
  employee: {
    title: 'Employee · Compage',
    cards: [
      attendanceHistory,
      card('/my-activities', ClipboardList, 'My Activities', 'View and update status of tasks assigned to you', 'orange'),
    ],
    socketToasts: [attendanceMarked],
  },
  ia_employee: {
    title: 'Employee · Intute AI',
    cards: [
      iaAttendanceHistory,
      card('/activities', ClipboardList, 'Activities', 'Track and manage your assigned tasks', 'orange'),
      dispatchOrders,
      invoiceGenerator,
    ],
    socketToasts: [
      attendanceMarked,
      { event: 'activities:created', type: 'info', message: (d) => `New activity assigned: ${d?.summary || ''}` },
      newOrder,
    ],
  },
  ia_hr: {
    title: 'HR · Intute AI',
    cards: [
      card('/ia-attendance-summary', CalendarCheck, 'Attendance Summary', 'Daily / monthly attendance reports for all employees', 'amber'),
      card('/activities', ClipboardList, 'Activities', 'Manage team tasks and assignments', 'orange'),
      dispatchOrders,
      card('/hr-payslips', Wallet, 'Payslip Generator', 'Generate manual payslips with PDF download', 'emerald'),
      invoiceGenerator,
    ],
    socketToasts: [
      leaveRequest,
      payroll,
      { event: 'activities:created', type: 'info', message: (d) => `New activity: ${d?.summary || ''}` },
      newOrder,
    ],
  },
};

export const getPeopleDashboard = (role) => peopleNav[role] || null;
