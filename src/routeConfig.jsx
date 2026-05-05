import { Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

// Dashboards
import AdminDashboard from "./components/dashboards/AdminDashboard";
import SalesDashboard from "./components/dashboards/SalesDashboard";
import ProductionDashboard from "./components/dashboards/ProductionDashboard";
import DesignDashboard from "./components/dashboards/DesignDashboard";
import StoreDashboard from "./components/dashboards/StoreDashboard";
import AccountsDashboard from "./components/dashboards/AccountsDashboard";
import CustomerDashboard from "./components/dashboards/CustomerDashboard";
import DispatchDashboard from "./components/dashboards/DispatchDashboard";

// Compage
import EmployeeDashboard from "./components/dashboards/EmployeeDashboard";
import HRDashboard from "./components/dashboards/HRDashboard";

// Intute
import IAEmployeeDashboard from "./components/dashboards/Iaemployeedashboard";
import IAHRDashboard from "./components/dashboards/Iahrdashboard";

// Service & Repair
import ServiceRepairDashboard from "./components/dashboards/ServiceRepairDashboard";
import ServiceRepairPage from "./components/service/ServiceRepairPage";
import IAOrdersPage from "./components/IA/IAOrdersPage";

// Admin
import EnquiryPage from "./components/admin/EnquiryPage";
import ProblemsPage from "./components/admin/ProblemsPage";
import ProformaForm from "./components/admin/ProformaForm";
import QueriesPage from "./components/admin/QueriesPage";
import QuotationForm from "./components/admin/QuotationForm";
import WorkOrderPage from "./components/admin/WorkOrderPage";
import BOMPage from "./components/admin/BOMPage";
import CustomerList from "./components/admin/CustomerList";
import InventoryPage from "./components/admin/InventoryPage";
import StockPage from "./components/admin/StockPage";
import PriceListPage from "./components/admin/PriceListPage";
import PdiPage from "./components/admin/PdiPage";
import CustomerInvoicesPage from "./components/admin/CustomerInvoicesPage";
import PartDrawingsSelector from "./components/admin/PartDrawingsSelector";
import PartDrawingsPage from "./components/admin/PartDrawingsPage";
import PartDrawingsRawPage from "./components/admin/PartDrawingsRawPage";
import PurchaseInvoicesPage from "./components/admin/PurchaseInvoicesPage";
import SelectOrderPage from "./components/admin/SelectOrderPage";
import CreateMotorProcess from "./components/admin/CreateMotorProcess";
import CreateNonMotorProcess from "./components/admin/CreateNonMotorProcess";
import PartCreation from "./components/admin/PartCreation";
import DeliveryChallanForm from "./components/admin/DeliveryChallanForm";
import MotorRecipesPage from "./components/admin/MotorRecipesPage";
import DocumentsHub from "./components/admin/DocumentsHub";
import PurchaseOrderForm from "./components/admin/PurchaseOrderForm";

// Sales
import SalesQueriesPage from "./components/sales/SalesQueriesPage";
import SalesEnquiryPage from "./components/sales/SalesEnquiryPage";
import SalesQuotationForm from "./components/sales/SalesQuotationForm";
import SalesProformaForm from "./components/sales/SalesProformaForm";
import SalesInventoryPage from "./components/sales/SalesInventoryPage";

// Design
import DesignEnquiryPage from "./components/design/DesignEnquiryPage";
import DesignPartCreation from "./components/design/DesignPartCreation";

// Production
import ProductionQueriesPage from "./components/production/ProductionQueriesPage";
import ProductionOrdersPage from "./components/production/ProductionOrdersPage";
import ProductionStockPage from "./components/production/ProductionStockPage";
import ProductionPartDrawingsRawPage from "./components/production/ProductionPartDrawingsRawPage";
import ProductionPartDrawingsPage from "./components/production/ProductionPartDrawingsPage";
import ProductionPDIPage from "./components/production/ProductionPDIPage";
import ProductionBOMPage from "./components/production/ProductionBOMPage";
import ProductionInventoryPage from "./components/production/ProductionInventoryPage";

// Customers
import CustomerOrdersPage from "./components/customers/CustomerOrdersPage";
import CustomerQueriesPage from "./components/customers/CustomerQueriesPage";

// Stores
import StoreStockPage from "./components/stores/StoreStockPage";
import StoreInventoryPage from "./components/stores/StoreInventoryPage";
import StoreBOMPage from "./components/stores/StoreBOMPage";

// Pages
import OrdersPage from "./components/pages/OrdersPage";
import EditProfile from "./components/pages/EditProfile";
import DispatchTrackingPage from "./components/pages/DispatchTrackingPage";

// ── Compage HR ───────────────────────────────────────────────
import AttendanceSummary from "./components/hr/AttendanceSummary";
import CompageActivitiesPage from "./components/hr/CompageActivitiesPage";
import EmployeeDetailsPage from "./components/hr/EmployeeDetailsPage";

// ── Compage Employee ─────────────────────────────────────────
import AttendanceHistory from "./components/employees/AttendanceHistory";
import CompageEmployeeActivitiesPage from "./components/employees/CompageEmployeeActivitiesPage";

// ── Intute (IA) ──────────────────────────────────────────────
import IAActivitiesPage from "./components/IA/IAActivitiesPage";
import IAHRPayslipForm from "./components/IA/IAHRPayslipForm";
import IAAttendanceSummary from "./components/IA/IAAttendanceSummary";
import IAAttendanceHistory from "./components/IA/IAAttendanceHistory";

// Route configuration array
export const routeConfig = [

  // ── Compage HR Routes ────────────────────────────────────────
  {
    path: "/hr-dashboard",
    allowedRoles: ["hr"],
    component: HRDashboard,
  },
  {
    path: "/attendance-summary",
    allowedRoles: ["hr"],
    component: AttendanceSummary,
  },
  {
    path: "/hr-activities",
    allowedRoles: ["hr"],
    component: CompageActivitiesPage,
  },
  {
    path: "/employee-details",
    allowedRoles: ["hr"],
    component: EmployeeDetailsPage,
  },

  // ── Compage Employee Routes ──────────────────────────────────
  {
    path: "/employee-dashboard",
    allowedRoles: ["employee"],
    component: EmployeeDashboard,
  },
  {
    path: "/attendance-history",
    allowedRoles: ["employee"],
    component: AttendanceHistory,
  },
  {
    path: "/my-activities",
    allowedRoles: ["employee"],
    component: CompageEmployeeActivitiesPage,
  },

  // ── Intute HR Routes ─────────────────────────────────────────
  {
    path: "/ia-hr-dashboard",
    allowedRoles: ["ia_hr"],
    component: IAHRDashboard,
  },
  {
    path: "/ia-attendance-summary",
    allowedRoles: ["ia_hr"],
    component: IAAttendanceSummary,
  },
  {
    path: "/hr-payslips",
    allowedRoles: ["ia_hr"],
    component: IAHRPayslipForm,
  },

  // ── Intute Employee Routes ───────────────────────────────────
  {
    path: "/ia-employee-dashboard",
    allowedRoles: ["ia_employee"],
    component: IAEmployeeDashboard,
  },
  {
    path: "/ia-attendance-history",
    allowedRoles: ["ia_employee"],
    component: IAAttendanceHistory,
  },

  // ── Intute Shared Routes ─────────────────────────────────────
  {
    path: "/activities",
    allowedRoles: ["ia_employee", "ia_hr"],
    component: IAActivitiesPage,
  },
  {
    path: "/ia-orders",
    allowedRoles: ["ia_employee", "ia_hr"],
    component: IAOrdersPage,
  },

  // ── Admin Routes ─────────────────────────────────────────────
  {
    path: "/admin-dashboard",
    allowedRoles: ["admin"],
    component: AdminDashboard,
  },
  {
    path: "/documents",
    allowedRoles: ["admin", "sales"],
    component: DocumentsHub,
  },
  {
    path: "/purchase-order",
    allowedRoles: ["admin", "sales"],
    component: PurchaseOrderForm,
  },
  {
    path: "/quotation",
    allowedRoles: ["admin"],
    component: QuotationForm,
  },
  {
    path: "/delivery-challan",
    allowedRoles: ["admin"],
    component: DeliveryChallanForm,
  },
  {
    path: "/part-creation",
    allowedRoles: ["admin"],
    component: PartCreation,
  },
  {
    path: "/customer-list",
    allowedRoles: ["admin"],
    component: CustomerList,
  },
  {
    path: "/part-drawings",
    allowedRoles: ["admin"],
    component: PartDrawingsSelector,
  },
  {
    path: "/enquiries",
    allowedRoles: ["admin"],
    component: EnquiryPage,
  },
  {
    path: "/problems",
    allowedRoles: ["admin"],
    component: ProblemsPage,
  },

  // ── Sales Routes ─────────────────────────────────────────────
  {
    path: "/sales-dashboard",
    allowedRoles: ["sales"],
    component: SalesDashboard,
  },
  {
    path: "/sales/quotations",
    allowedRoles: ["sales"],
    component: SalesQuotationForm,
  },
  {
    path: "/sales/enquiries",
    allowedRoles: ["sales"],
    component: SalesEnquiryPage,
  },
  {
    path: "/sales-queries",
    allowedRoles: ["sales"],
    component: SalesQueriesPage,
  },
  {
    path: "/sales-inventory",
    allowedRoles: ["sales"],
    component: SalesInventoryPage,
  },

  // ── Design Routes ─────────────────────────────────────────────
  {
    path: "/design-dashboard",
    allowedRoles: ["design"],
    component: DesignDashboard,
  },
  {
    path: "/design/enquiries",
    allowedRoles: ["design"],
    component: DesignEnquiryPage,
  },
  {
    path: "/design/part-creation",
    allowedRoles: ["design"],
    component: DesignPartCreation,
  },

  // ── Production Routes ─────────────────────────────────────────
  {
    path: "/production-dashboard",
    allowedRoles: ["production"],
    component: ProductionDashboard,
  },
  {
    path: "/production-queries",
    allowedRoles: ["production"],
    component: ProductionQueriesPage,
  },
  {
    path: "/production-orders",
    allowedRoles: ["production"],
    component: ProductionOrdersPage,
  },
  {
    path: "/production-stock",
    allowedRoles: ["production"],
    component: ProductionStockPage,
  },
  {
    path: "/production-part-drawings-raw",
    allowedRoles: ["production"],
    component: ProductionPartDrawingsRawPage,
  },
  {
    path: "/production-part-drawings",
    allowedRoles: ["production"],
    component: ProductionPartDrawingsPage,
  },
  {
    path: "/production-pdi",
    allowedRoles: ["production"],
    component: ProductionPDIPage,
  },
  {
    path: "/production-bom-unpriced",
    allowedRoles: ["production"],
    component: ProductionBOMPage,
  },
  {
    path: "/production-inventory",
    allowedRoles: ["production"],
    component: ProductionInventoryPage,
  },

  // ── Store Routes ──────────────────────────────────────────────
  {
    path: "/store-dashboard",
    allowedRoles: ["store"],
    component: StoreDashboard,
  },

  // ── Dispatch Routes ───────────────────────────────────────────
  {
    path: "/dispatch-dashboard",
    allowedRoles: ["dispatch"],
    component: DispatchDashboard,
  },

  // ── Accounts Routes ───────────────────────────────────────────
  {
    path: "/accounts-dashboard",
    allowedRoles: ["accounts"],
    component: AccountsDashboard,
  },

  // ── Customer Routes ───────────────────────────────────────────
  {
    path: "/customer-dashboard",
    allowedRoles: ["customer"],
    component: CustomerDashboard,
  },
  {
    path: "/customer-orders",
    allowedRoles: ["customer"],
    component: CustomerOrdersPage,
  },
  {
    path: "/customer-queries",
    allowedRoles: ["customer"],
    component: CustomerQueriesPage,
  },

  // ── Service & Repair Routes ──────────────────────────────────
  {
    path: "/service-repair-dashboard",
    allowedRoles: ["service_repair"],
    component: ServiceRepairDashboard,
  },
  {
    path: "/service-repair",
    allowedRoles: ["service_repair", "admin"],
    component: ServiceRepairPage,
  },

  // ── Shared Routes (multiple roles) ───────────────────────────
  {
    path: "/edit-profile",
    allowedRoles: [
      "admin", "customer", "sales", "design", "production",
      "store", "dispatch", "accounts", "employee", "hr",
      "ia_employee", "ia_hr", "service_repair",
    ],
    component: EditProfile,
  },
  {
    path: "/motor-recipes",
    allowedRoles: ["admin", "design", "production"],   // ← design + production added
    component: MotorRecipesPage,
  },
  {
    path: "/orders",
    allowedRoles: ["admin", "sales", "accounts", "production"],
    component: (props) =>
      props.userRole === "production" ? (
        <ProductionOrdersPage {...props} />
      ) : (
        <OrdersPage {...props} />
      ),
  },
  {
    path: "/queries",
    allowedRoles: ["admin", "design", "dispatch"],
    component: QueriesPage,
  },
  {
    path: "/inventory",
    allowedRoles: ["admin", "store", "production", "sales"],
    component: (props) =>
      props.userRole === "store" ? (
        <StoreInventoryPage {...props} />
      ) : props.userRole === "production" ? (
        <ProductionInventoryPage {...props} />
      ) : (
        <InventoryPage {...props} />
      ),
  },
  {
    path: "/stock",
    allowedRoles: ["admin", "sales", "dispatch", "store", "production"],
    component: (props) =>
      props.userRole === "store" ? (
        <StoreStockPage {...props} />
      ) : props.userRole === "production" ? (
        <ProductionStockPage {...props} />
      ) : (
        <StockPage {...props} />
      ),
  },
  {
    path: "/price-list",
    allowedRoles: ["admin", "sales"],
    component: PriceListPage,
  },
  {
    path: "/pdi",
    allowedRoles: ["admin", "design", "dispatch"],
    component: PdiPage,
  },
  {
    path: "/dispatch-tracking",
    allowedRoles: ["admin", "sales", "dispatch", "accounts"],
    component: DispatchTrackingPage,
  },
  {
    path: "/customer-invoices",
    allowedRoles: ["admin", "sales", "accounts"],
    component: CustomerInvoicesPage,
  },
  {
    path: "/part-drawings/finished",
    allowedRoles: ["admin", "design"],
    component: PartDrawingsPage,
  },
  {
    path: "/part-drawings/raw",
    allowedRoles: ["admin", "design"],
    component: PartDrawingsRawPage,
  },
  {
    path: "/purchase-invoices",
    allowedRoles: ["admin", "accounts"],
    component: PurchaseInvoicesPage,
  },
  {
    path: "/bom",
    allowedRoles: ["admin", "design", "store", "production"],
    component: (props) =>
      props.userRole === "store" ? (
        <StoreBOMPage {...props} />
      ) : props.userRole === "production" ? (
        <ProductionBOMPage {...props} />
      ) : (
        <BOMPage {...props} />
      ),
  },
  {
    path: "/work-orders",
    allowedRoles: ["admin", "production"],
    component: WorkOrderPage,
  },
  {
    path: "/select-component/:orderId/:action",
    allowedRoles: ["admin", "production"],
    component: SelectOrderPage,
  },
  {
    path: "/processes/:orderId",
    allowedRoles: ["admin", "production"],
    component: CreateMotorProcess,
  },
  {
    path: "/processes/non-motor/:orderId",
    allowedRoles: ["admin", "production"],
    component: CreateNonMotorProcess,
  },
  {
    path: "/proforma",
    allowedRoles: ["admin", "sales"],
    component: (props) =>
      props.userRole === "sales" ? <SalesProformaForm /> : <ProformaForm />,
  },

  // ── Redirect (typo handling) ──────────────────────────────────
  {
    path: "/account-dashboard",
    allowedRoles: [
      "admin", "customer", "sales", "design", "production",
      "store", "dispatch", "accounts", "employee", "hr",
      "ia_employee", "ia_hr",
    ],
    isRedirect: true,
    redirectTo: "/accounts-dashboard",
  },
];

// Helper to render routes
export const renderRoute = (route, userRole, socket) => {
  if (route.isRedirect) {
    return <Navigate to={route.redirectTo} replace />;
  }

  const Component = route.component;
  const isAllowed = route.allowedRoles.includes(userRole);

  return (
    <ErrorBoundary key={route.path}>
      {isAllowed ? (
        <Component socket={socket} userRole={userRole} />
      ) : (
        <Navigate to="/" replace />
      )}
    </ErrorBoundary>
  );
};