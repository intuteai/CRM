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
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const STATUS = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  TESTING: "Testing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS = {
  [STATUS.PENDING]: "bg-amber-500",
  [STATUS.PROCESSING]: "bg-yellow-600",
  [STATUS.TESTING]: "bg-purple-600",
  [STATUS.SHIPPED]: "bg-blue-600",
  [STATUS.DELIVERED]: "bg-green-600",
  [STATUS.CANCELLED]: "bg-red-600",
};

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toISOString().split("T")[0] : "";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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

const useFetchData = ({ limit, cursor, userRole }) => {
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

      const url = cursor
        ? `${backendUrl}/api/orders?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `${backendUrl}/api/orders?limit=${limit}&force_refresh=true`;

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
      toast.error(err.message || "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, [limit, cursor]);

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
  const [cursor, setCursor] = useState(null);
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

  const {
    orders,
    setOrders,
    totalOrders,
    products,
    isLoading,
    error,
    isEmpty,
    refetchData,
  } = useFetchData({ limit: ordersPerPage, cursor, userRole });

  // ─── Get all available statuses except current and Cancelled ────────
  const getAvailableStatuses = (currentStatus) => {
    // Return all statuses except the current one and Cancelled
    return Object.values(STATUS).filter(
      status => status !== currentStatus && status !== STATUS.CANCELLED
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
      toast.info(`Order #${updatedOrder.id} updated`, { autoClose: 2500 });
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

      toast.success(`Order #${orderId} → ${updatedOrder.status}`, {
        autoClose: 2000,
      });

      // Sync with server response
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o)),
      );
    } catch (err) {
      console.error("Status update error:", err);
      toast.error(err.message || "Failed to update status");

      // Rollback optimistic UI
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: oldStatus } : o)),
      );
    }
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex flex-col items-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={refetchData}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Production Orders
      </h1>

      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search by Order ID or Customer Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
          >
            <option value="All">All Status</option>
            {Object.values(STATUS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
          >
            <option value="All">All Months</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
          >
            <option value="All">All Years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            onClick={refetchData}
            disabled={isLoading}
            className="p-3 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all shadow-md text-lg"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

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
              {filteredOrders.map((order) => {
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
                Showing {filteredOrders.length} of {totalOrders} orders
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCursor(null)}
                  disabled={!cursor}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() =>
                    setCursor(orders[orders.length - 1]?.createdAt)
                  }
                  disabled={orders.length < ordersPerPage}
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

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />
    </div>
  );
}

export default ProductionOrdersPage;
