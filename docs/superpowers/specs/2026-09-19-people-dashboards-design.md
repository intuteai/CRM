# People dashboards (HR / Employee / IA) — design

Date: 2026-09-19. Status: approved by the user in conversation; not committed (user reviews first).

## Goal
Give the four people-management roles — `hr`, `employee` (Compage) and `ia_hr`, `ia_employee` (Intute) — a
dashboard that is deliberately *not* the sidebar/ERP module launcher used by the other roles, while keeping
the app's dark navbar and warm cream page.

## Design
- One shared component, `src/components/dashboards/PeopleDashboard.jsx`, driven by
  `src/config/peopleNav.js` (one entry per role). It replaces `HRDashboard`, `EmployeeDashboard`,
  `Iaemployeedashboard` and `Iahrdashboard`, which are deleted (recoverable from git).
- Layout: personal greeting (time-of-day greeting + user name from `state.auth.userName`, long date,
  "Role · Company"), then a row of colour-coded cards. Card = white, 1px cream border, 3px accent top border,
  tinted icon tile, title, description, "Open →". No icon badge / pill / giant title.
- Background: the original amber-to-gray gradient and the three soft animated colour blobs behind the
  content are kept (the user asked for them explicitly).
- Cards are each role's real links, in the current order, with the current titles and descriptions.
  Accents: attendance amber, activities orange, dispatch purple, invoices blue, employee details teal,
  payslips emerald. Grid: up to 4 cards in one row on wide screens; 5 cards wrap 3 + 2; 1–2 cards stay
  in a narrower container so they do not stretch.
- No invented data (no clock-in button, leave balance, etc.) — those need backend work that does not exist.

## Behaviour carried over
Socket toasts the old dashboards showed (`attendanceMarked`, `activities:created`, `ia_orders:created`,
`leaveRequestCreated`, `payrollProcessed`) are kept, declared per role in `peopleNav.js`.

## Fixes made on the way
- Removed the fake 1.2s skeleton in the Employee / IA Employee dashboards.
- Old cleanup called `socket.off(event)` with no handler, removing *every* listener for that event on the
  shared socket; the new component removes only its own handlers.

## Inner pages (added later, same day)
The 11 pages behind the links now share `src/components/shared/PeoplePage.jsx` (backdrop with the same gradient + blobs, compact left-aligned page title, optional right-side actions) and use the ERP pages' sizing and colour rules (navy-50 table heads, gold create buttons, navy secondary, soft-tint chips). HR/IA duplicates (attendance summary/history, activities) were restyled once and copied. Sizes were deliberately kept compact after the user said these pages looked bigger than the ERP ones.

## Out of scope
The top `Navbar` and login. They keep their current look.

## Verification
`eslint src` scan for undefined identifiers, `vite build`. Not run against a live login.
