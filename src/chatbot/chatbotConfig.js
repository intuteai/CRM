export const CHATBOT_MODULES = [
  {
    key: "orders",
    label: "Orders",
    endpoint: "orders/chatbot",
    questions: [
      { label: "Show all orders", value: "show all orders" },
      { label: "Show pending orders", value: "show pending orders" },
      { label: "Show processing orders", value: "show processing orders" },
      { label: "Show testing orders", value: "show testing orders" },
      { label: "Show shipped orders", value: "show shipped orders" },
      { label: "Show delivered orders", value: "show delivered orders" },
      { label: "Show cancelled orders", value: "show cancelled orders" },
      { label: "Show recent orders", value: "show recent orders" },
      { label: "Count orders by status", value: "count orders by status" },
    ],
  },
  {
    key: "customer-invoices",
    label: "Customer Invoices",
    endpoint: null,
    questions: [],
  },
  {
    key: "customers",
    label: "Customers",
    endpoint: null,
    questions: [],
  },
  {
    key: "inventory",
    label: "Inventory",
    endpoint: null,
    questions: [],
  },
  {
    key: "stock",
    label: "Raw Materials",
    endpoint: null,
    questions: [],
  },
  {
    key: "bom",
    label: "BOM",
    endpoint: null,
    questions: [],
  },
  {
    key: "work-orders",
    label: "Work Orders",
    endpoint: null,
    questions: [],
  },
];
