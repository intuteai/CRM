import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ArrowDownUp,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Edit2,
  X,
  Calendar,
} from "lucide-react";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const STATUS = {
  PENDING:            "Pending",
  PROCESSING:         "Processing",
  TESTING:            "Testing",
  READY_FOR_SHIPMENT: "Ready for Shipment",
  SHIPPED:            "Shipped",
  PARTIALLY_DELIVERED:"Partially Delivered",
  DELIVERED:          "Delivered",
  CANCELLED:          "Cancelled",
};

const STATUS_RANK = {
  [STATUS.PENDING]:             0,
  [STATUS.PROCESSING]:          1,
  [STATUS.TESTING]:             2,
  [STATUS.READY_FOR_SHIPMENT]:  3,
  [STATUS.SHIPPED]:             4,
  [STATUS.PARTIALLY_DELIVERED]: 5,
  [STATUS.DELIVERED]:           6,
};

const STATUS_COLORS = {
  [STATUS.PENDING]:             "bg-amber-500",
  [STATUS.PROCESSING]:          "bg-yellow-600",
  [STATUS.TESTING]:             "bg-purple-600",
  [STATUS.READY_FOR_SHIPMENT]:  "bg-teal-600",
  [STATUS.SHIPPED]:             "bg-blue-600",
  [STATUS.PARTIALLY_DELIVERED]: "bg-indigo-500",
  [STATUS.DELIVERED]:           "bg-green-600",
  [STATUS.CANCELLED]:           "bg-red-600",
};

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toISOString().split("T")[0] : "";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount,
  );

const calculateTotalAmount = (items) =>
  items.reduce(
    (sum, item) =>
      sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0),
    0,
  );

// FIXED: Fetch ALL orders like admin page does
const useFetchData = ({ userRole }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

      // Fetch ALL orders (up to 5000) for client-side filtering
      const url = `${backendUrl}/api/orders?limit=5000&offset=0&force_refresh=true`;

      const headers = { Authorization: `Bearer ${token}` };

      const [ordersRes, productsRes] = await Promise.all([
        fetch(url, { headers }).then((res) =>
          res.ok ? res.json() : { orders: [], total: 0 },
        ),
        fetch(`${backendUrl}/api/inventory/available`, { headers }).then(
          (res) => (res.ok ? res.json().then((data) => data.data || []) : []),
        ),
      ]);

      const validOrders = (ordersRes.orders || []).filter((o) => o && o.id);
      setOrders(validOrders);
      setTotalOrders(ordersRes.total || 0);
      setProducts(productsRes.filter((p) => p && p.product_id));
      setIsEmpty(validOrders.length === 0 && productsRes.length === 0);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to fetch data");
      notifyError(err.message || "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    orders,
    setOrders,
    totalOrders,
    products,
    isLoading,
    error,
    isEmpty,
    refetchData: fetchData,
  };
};

function ProductionOrdersPage({ socket, userRole }) {
  const [page, setPage] = useState(0);
  const [ordersPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterMonth, setFilterMonth] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const tableRef = useRef(null);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const {
    orders,
    setOrders,
    totalOrders,
    products,
    isLoading,
    error,
    isEmpty,
    refetchData,
  } = useFetchData({ userRole });

  // ─── Get all available statuses except current and Cancelled ────────
  const getAvailableStatuses = (currentStatus) => {
    const currentRank = STATUS_RANK[currentStatus] ?? -1;
    return Object.values(STATUS).filter(
      s => s !== STATUS.CANCELLED && (STATUS_RANK[s] ?? -1) > currentRank
    );
  };

  // ─── Real-time updates via socket ───────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on("orderUpdate", (updatedOrder) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o,
        ),
      );
      notifyInfo(`Order #${updatedOrder.id} updated`, { autoClose: 2500 });
    });

    return () => {
      socket.off("orderUpdate");
    };
  }, [socket]);

  const availableYears = useMemo(() => {
    const years = orders
      .map((o) => o.createdAt && new Date(o.createdAt).getFullYear())
      .filter(Boolean);
    return [...new Set(years)].sort((a, b) => b - a);
  }, [orders]);

  const sortedOrders = useMemo(() => {
    const list = [...orders];
    if (!sortConfig.key) return list;

    list.sort((a, b) => {
      let va = a[sortConfig.key];
      let vb = b[sortConfig.key];

      if (sortConfig.key === "items") {
        va = (a.items || []).length;
        vb = (b.items || []).length;
      } else if (["createdAt", "targetDeliveryDate"].includes(sortConfig.key)) {
        va = new Date(va || 0);
        vb = new Date(vb || 0);
      }

      if (va < vb) return sortConfig.direction === "asc" ? -1 : 1;
      if (va > vb) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, sortConfig]);

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter((order) => {
      const created = new Date(order.createdAt);

      return (
        (order.id.toString().includes(searchTerm) ||
          (order.customerName || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())) &&
        (filterStatus === "All" || order.status === filterStatus) &&
        (filterMonth === "All" || created.getMonth() === Number(filterMonth)) &&
        (filterYear === "All" || created.getFullYear() === Number(filterYear))
      );
    });
  }, [sortedOrders, searchTerm, filterStatus, filterMonth, filterYear]);

  // ─── Pagination on filtered results ─────────────────────────────────
  const paginatedOrders = useMemo(() => {
    const start = page * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, page, ordersPerPage]);

  // ─── Reset to page 0 when filters change ────────────────────────────
  useEffect(() => {
    setPage(0);
  }, [searchTerm, filterStatus, filterMonth, filterYear]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  // ─── Status change handler ──────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const oldStatus = order.status;

    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    );

    try {
      const token = localStorage.getItem("token");
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

      const res = await fetch(`${backendUrl}/api/orders/${orderId}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          items: order.items, // Required by backend
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Status update failed");
      }

      const updatedOrder = await res.json();

      notifySuccess(`Order #${orderId} → ${updatedOrder.status}`, {
        autoClose: 2000,
      });

      // Sync with server response
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o)),
      );
    } catch (err) {
      console.error("Status update error:", err);
      notifyError(err.message || "Failed to update status");

      // Rollback optimistic UI
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: oldStatus } : o)),
      );
    }
  };

  // Get active filter text for display
  const getFilterText = () => {
    const parts = [];
    if (filterStatus !== 'All') parts.push(filterStatus);
    if (filterMonth !== 'All') parts.push(MONTHS[Number(filterMonth)]);
    if (filterYear !== 'All') parts.push(filterYear);
    return parts.join(' • ');
  };

  const hasActiveFilters = filterStatus !== 'All' || filterMonth !== 'All' || filterYear !== 'All';

  if (isLoading && !orders.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">
          Loading orders...
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <ShoppingCart className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            No Orders Yet
          </h2>
          <p className="text-gray-600">
            No orders are available for your role.
          </p>
        </div>
      </div>
    );
  }

  if (error) return <ConnectionError onRetry={refetchData} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Production Orders
      </h1>

      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-4 flex-wrap items-center">
          {/* Search Bar */}
          <div className="relative flex-grow min-w-[300px]">
            <input
              type="text"
              placeholder="Search by Order ID or Customer Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md min-w-[140px]"
          >
            <option value="All">All Status</option>
            {Object.values(STATUS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Month-Year Combined Filter */}
          <div className="flex gap-2 items-center bg-white border border-gray-200 rounded-lg shadow-md p-2">
            <Calendar size={18} className="text-gray-400 ml-1" />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="p-1.5 border-none focus:outline-none focus:ring-0 text-base bg-transparent appearance-none cursor-pointer pr-6"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.25rem center',
              }}
            >
              <option value="All">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            
            <div className="w-px h-6 bg-gray-300"></div>
            
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="p-1.5 border-none focus:outline-none focus:ring-0 text-base bg-transparent appearance-none cursor-pointer pr-6"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.25rem center',
              }}
            >
              <option value="All">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <>
                <div className="w-px h-6 bg-gray-300"></div>
                <button
                  onClick={() => {
                    setFilterMonth('All');
                    setFilterYear('All');
                  }}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Clear date filters"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={refetchData}
            disabled={isLoading}
            className="p-3 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all shadow-md text-lg font-medium disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Active filter indicator */}
        {hasActiveFilters && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <Filter size={14} />
            <span>Filtered by: <span className="font-medium text-amber-700">{getFilterText()}</span></span>
            <button
              onClick={() => {
                setFilterStatus('All');
                setFilterMonth('All');
                setFilterYear('All');
              }}
              className="text-amber-600 hover:text-amber-700 underline ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {isLoading && orders.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse" ref={tableRef}>
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50">
                {[
                  { key: "id", label: "Order ID" },
                  { key: "customerName", label: "Customer Name" },
                  { key: "items", label: "Items" },
                  { key: "status", label: "Status" },
                  { key: "targetDeliveryDate", label: "Target Delivery" },
                  { key: "paymentStatus", label: "Payment Status" },
                  { key: "createdAt", label: "Created At (IST)" },
                ].map((item) => (
                  <th
                    key={item.key}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${
                      item.key !== "items"
                        ? "cursor-pointer hover:bg-amber-300"
                        : ""
                    } transition-all duration-200`}
                    onClick={() => item.key !== "items" && handleSort(item.key)}
                  >
                    <div className="flex items-center justify-between">
                      <span>{item.label}</span>
                      {item.key !== "items" && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 ${sortConfig.key === item.key ? "text-gray-900" : "opacity-50"}`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => {
                const availableStatuses = getAvailableStatuses(order.status);

                return (
                  <tr
                    key={order.id}
                    className="border-t hover:bg-amber-50 transition-all duration-200"
                  >
                    <td className="py-4 px-3 text-gray-600 text-base">
                      {order.id}
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      {order.customerName || "N/A"}
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      <ul className="space-y-1">
                        {(order.items || []).map((item, i) => (
                          <li key={item.product_id || i} className="text-sm">
                            {item.productName || "Unknown"} (Qty:{" "}
                            {item.quantity || 0})
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-4 px-3 text-base">
                      <div className="relative inline-block group">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value)
                          }
                          className={`
                            appearance-none px-4 py-1 pr-9 rounded-full text-white text-sm font-medium
                            cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400
                            ${STATUS_COLORS[order.status] || "bg-gray-500"}
                          `}
                          style={{
                            colorScheme: 'dark'
                          }}
                          disabled={isLoading}
                        >
                          <option value={order.status} disabled className="bg-gray-800">
                            {order.status}
                          </option>
                          {availableStatuses.map((s) => (
                            <option key={s} value={s} className="bg-gray-800">
                              {s}
                            </option>
                          ))}
                        </select>
                        <Edit2
                          size={14}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80 pointer-events-none"
                        />
                      </div>
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      {order.targetDeliveryDate
                        ? formatDate(order.targetDeliveryDate)
                        : "Not Set"}
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      {order.paymentStatus || "N/A"}
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      <div className="flex flex-col">
                        <span>
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleDateString(
                                "en-IN",
                              )
                            : "N/A"}
                        </span>
                        <span className="text-sm text-gray-500">
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleTimeString(
                                "en-IN",
                              )
                            : ""}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalOrders > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {paginatedOrders.length} of {filteredOrders.length} filtered orders (Total: {totalOrders})
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * ordersPerPage >= filteredOrders.length}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredOrders.length === 0 && !isLoading && (
            <div className="text-center py-12 text-gray-500">
              <Filter className="mx-auto mb-4 text-gray-400" size={48} />
              <p className="text-lg">No orders match your current filters</p>
            </div>
          )}
        </div>
      </div>

</div>
  );
}

export default ProductionOrdersPage;