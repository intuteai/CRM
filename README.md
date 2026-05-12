# Intute-AI CRM — Frontend

A multi-role ERP/CRM web application built for manufacturing and commerce operations. It serves 14 distinct roles across two organizational entities (Compage and Intute AI), each with dedicated dashboards and feature sets covering sales, production, design, stores, dispatch, HR, and customer management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build Tool | Vite 6 |
| State Management | Redux Toolkit 2 |
| Routing | React Router 7 |
| Styling | Tailwind CSS 3 + Bootstrap 5 |
| HTTP Client | Axios |
| Real-time | Socket.io Client 4 |
| Icons | Lucide React, React Icons |
| Drag & Drop | @hello-pangea/dnd |
| Date Utilities | date-fns |
| Excel Export | xlsx |
| Deployment | AWS |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Configure environment

Create a `.env` file at the project root:

```env
VITE_BACKEND_URL=http://localhost:8000
```

For production, point this to the live API.

### Run the dev server

```bash
npm run dev
```

The app runs at `http://localhost:5173`. API requests prefixed with `/api` are proxied to `VITE_BACKEND_URL`.

### Build for production

```bash
npm run build
npm start          # serves the dist/ folder
```

---

## Project Structure

```
src/
├── app/
│   └── store.js              # Redux store
├── assets/                   # Static images
├── chatbot/                  # AI chatbot widget (admin only)
├── components/
│   ├── admin/                # Admin module (30 components)
│   ├── customers/            # Customer portal
│   ├── dashboards/           # Role-specific dashboards (13)
│   ├── design/               # Design department
│   ├── employees/            # Compage employee views
│   ├── forms/                # Shared form components
│   ├── hr/                   # Compage HR module
│   ├── IA/                   # Intute AI employee & HR
│   ├── pages/                # Core pages (Navbar, Login, etc.)
│   ├── production/           # Production module
│   ├── sales/                # Sales module
│   ├── service/              # Service & repair
│   └── stores/               # Store inventory
├── features/
│   ├── auth/                 # Auth Redux slice
│   └── notifications/        # Notifications Redux slice
├── hooks/                    # Custom hooks (fetch, notify, etc.)
├── services/
│   └── socket.js             # Socket.io client
├── utils/
│   └── helpers.js            # Shared utilities
├── constants.js              # Roles, route constants
├── routeConfig.jsx           # Centralized route definitions
└── App.jsx                   # Root component
```

---

## Modules & Features

### Admin
Full system access including:
- Enquiry & lead management (Hot Lead, Follow-up, Closed, etc.)
- Order creation, tracking, and status management
- Quotation, Proforma, and Delivery Challan generation
- Purchase orders and invoices
- Bill of Materials (BOM)
- Inventory and stock management
- Part drawings (finished goods & raw materials)
- Motor / non-motor manufacturing processes and recipes
- Pre-Delivery Inspection (PDI)
- Price list management
- Work orders with status-colour coding
- Documents hub
- Customer and problem/query management
- AI chatbot widget

### Sales
- Enquiry pipeline
- Quotation and proforma creation
- Inventory view
- Issue/query tracking

### Production
- Order management with full status lifecycle
- Stock and BOM view
- Part drawings
- PDI

### Design
- Enquiry management
- Part creation

### Stores
- Inventory and stock management
- BOM view

### Dispatch
- Real-time shipment tracking with full status support

### Customer
- Order history with status and reason visibility
- Query/issue submission

### HR & Employees (Compage)
- Attendance summary and history
- Employee records
- Payroll / HR activities

### Intute AI (IA)
- IA-specific employee and HR dashboards
- Payslips, attendance, activities, orders

### Service & Repair
- Service dashboard
- Repair record tracking with multi-photo support per stage:
  - Fault / Query photos
  - Actual Issue photos
  - Chalan photos (multiple, PDF supported)
  - Delivery Challan photos (multiple, PDF supported)
  - Repaired photos (multiple)
- Inline photo deletion with confirmation overlay

---

## Order Status Lifecycle

Orders progress through the following statuses. All transitions are forward-only (no downgrade). Inventory is consumed the first time an order crosses the dispatch threshold.

```
Pending → Processing → Testing → Ready for Shipment → Shipped → Partially Delivered → Delivered
                                                               ↘ (Delivered directly, skipping Partially Delivered)
```

| Status | Colour | Meaning |
|---|---|---|
| Pending | Amber | Order created, not started |
| Processing | Yellow | Being prepared |
| Testing | Purple | Under QC / testing |
| Ready for Shipment | Teal | Cleared, waiting to ship |
| Shipped | Blue | Dispatched — inventory deducted |
| Partially Delivered | Indigo | Some items delivered; `status_reason` required |
| Delivered | Green | Fully delivered |
| Cancelled | Red | Terminal — via dedicated cancel endpoint |

**`status_reason`** is a free-text field visible on all order views. It is required when setting an order to *Partially Delivered* and is always editable.

**Payment status** (`Pending` / `Paid`) remains editable even after delivery.

---

## Role-Based Access Control

Routes and UI are gated by role. The 14 supported roles are defined in `src/constants.js`. Role assignment comes from the authenticated user object stored in Redux and persisted in `localStorage`. Unauthenticated users see a login modal; unauthorized role/path combinations redirect automatically.

---

## State Management

Two Redux slices power the global state:

- **authSlice** — current user, role, token, login/logout
- **notificationSlice** — real-time notification queue

---

## Real-time Communication

`src/services/socket.js` manages a persistent Socket.io connection. The app displays a `ConnectionBanner` when the socket is disconnected and reconnects automatically. The connection is initialized after login and torn down on logout.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Base URL for the backend API |

---

## Deployment

The app is deployed on **AWS**. The build output in `dist/` is served as a static site. For production, set `VITE_BACKEND_URL` to the live API endpoint.

Backend API: `https://api.intute.biz`
