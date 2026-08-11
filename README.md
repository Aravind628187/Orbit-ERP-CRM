# Orbit ERP + CRM

Orbit is a production-minded operations workspace for Indian wholesale and distribution teams. It connects customer relationships, scheduled follow-ups, warehouse inventory, stock movements, sales challans, and management analytics without losing the audit trail between them.

## Problem statement

Small distribution teams often manage customer conversations, stock counts, and dispatch documents in disconnected spreadsheets. Orbit provides one role-aware source of truth while enforcing the critical rule that confirmed dispatches and inventory must stay consistent.

## Features

- Secure JWT login with Admin, Sales, Warehouse, and Accounts workspaces
- Searchable, filterable, sortable, paginated CRM with customer timelines and follow-ups
- Product catalogue, warehouse locations, stock thresholds, valuation, and immutable movements
- Multi-product Draft/Confirmed/Cancelled sales challans with printable document views
- Atomic stock deduction, row locking, negative-stock prevention, and compensating cancellation movements
- Live dashboards, customer/inventory distributions, sales trends, audit logs, notifications, and global search
- Responsive light/dark/system-aware interface, command palette, drawers, modals, toasts, and accessible focus states

## Roles and permissions

| Capability | Admin | Sales | Warehouse | Accounts |
|---|:---:|:---:|:---:|:---:|
| Dashboard and challan documents | ✓ | ✓ | ✓ | ✓ |
| Customers and follow-ups | ✓ | ✓ | — | — |
| Create/confirm/cancel challans | ✓ | ✓ | — | — |
| Product catalogue (read) | ✓ | ✓ | ✓ | — |
| Product writes and stock movements | ✓ | — | ✓ | — |
| Analytics | ✓ | — | — | ✓ |
| Audit logs | ✓ | — | — | — |

Permissions are enforced by the Express API as well as frontend route guards.

## Tech stack

- Frontend: React 19, Vite, JavaScript, React Router, Recharts, Lucide
- Backend: Express 5, TypeScript (strict mode), Zod, JWT, bcrypt
- Data: PostgreSQL 16 and `pg`
- Infrastructure: Docker Compose, Nginx, GitHub Actions

## Architecture

```mermaid
flowchart LR
  UI[React + Vite] -->|REST / JSON + JWT| API[Express + TypeScript]
  API --> AUTH[Auth and RBAC middleware]
  API --> CTRL[Controllers and validators]
  CTRL --> SVC[Services and repositories]
  SVC -->|Transactions + row locks| DB[(PostgreSQL)]
```

The server is organized under `server/src` into controllers, routes, middleware, services, repositories, validators, types, utilities, configuration, and database scripts.

## Database design

Core entities are `users`, `customers`, `customer_followups`, `products`, `stock_movements`, `challans`, `challan_items`, `notifications`, and `audit_logs`. Foreign keys and checks protect relationships, unique identifiers, non-negative stock, and monetary values.

## Critical business logic

A Draft challan never changes inventory. Confirmation runs inside one PostgreSQL transaction, locks selected products in deterministic ID order with `SELECT … FOR UPDATE`, validates all requested quantities, deducts stock, and writes movements. Any shortage returns HTTP `409 INSUFFICIENT_STOCK` with product, available, and requested values and rolls the whole transaction back. Product name, SKU, price, and customer data are snapshotted so historical documents remain stable after catalogue edits. Repeating the same status transition is rejected.

## API overview

All protected endpoints require `Authorization: Bearer <token>`. Success responses use `{ "success": true, "data": ... }`; failures use `{ "success": false, "error": { "code", "message", "details" } }`.

- Auth: `POST /api/auth/login`, `GET /api/auth/me`
- CRM: `GET|POST /api/customers`, `GET|PUT /api/customers/:id`, `POST /api/customers/:id/followups`
- Follow-ups: `GET /api/followups`, `PATCH /api/followups/:id/complete`, `POST /api/followups/:id/reschedule`
- Inventory: `GET|POST /api/products`, `GET|PUT /api/products/:id`, `GET|POST /api/products/:id/movements`, `GET /api/stock-movements`
- Sales: `GET|POST /api/challans`, `GET /api/challans/:id`, `PATCH /api/challans/:id/status`
- Intelligence: `GET /api/dashboard?range=7D|30D|90D|12M`, `/api/analytics`, `/api/audit-logs`, `/api/search`, `/api/notifications`; `PATCH /api/notifications/:id/read`, `/api/notifications/read-all`

Import `postman/Orbit-ERP.postman_collection.json`; it includes `BASE_URL` and `TOKEN` collection variables.

## Local setup

Prerequisites: Node.js 20+ (24 recommended), npm, and PostgreSQL 14+ or Docker Desktop.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`; API health is `http://localhost:4000/health`.

## Docker setup

Set a non-default `JWT_SECRET` in `.env`, then run:

```bash
docker compose up --build
```

The frontend is served at `http://localhost:8080`, the API at `:4000`, and PostgreSQL at `:5432`. All services include startup dependencies; PostgreSQL and the backend expose health checks.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | Set `true` for managed databases that require TLS |
| `JWT_SECRET` | Production signing secret; required and validated in production |
| `JWT_EXPIRES_IN` | Access-token lifetime, default `8h` |
| `JWT_ISSUER` | Expected token issuer, default `orbit-erp-api` |
| `JWT_AUDIENCE` | Expected token audience, default `orbit-erp-web` |
| `PORT` | API port, default `4000` |
| `BACKEND_PORT` | Docker host port mapped to the API container |
| `FRONTEND_PORT` | Docker host port mapped to Nginx |
| `CLIENT_URL` | Comma-separated allowed browser origins |
| `VITE_API_URL` | Public API base URL at frontend build time |

## Demo accounts

All assignment-only accounts use `Orbit@123`.

| Role | Email |
|---|---|
| Admin | `admin@orbit.local` |
| Sales | `sales@orbit.local` |
| Warehouse | `warehouse@orbit.local` |
| Accounts | `accounts@orbit.local` |

Never reuse these credentials in production.

## Testing

```bash
npm run typecheck
npm test
npm run build
```

The PostgreSQL integration suite runs when `TEST_DATABASE_URL` points to an isolated test database. It truncates that database between scenarios; never point it at development or production data.

```bash
TEST_DATABASE_URL=postgresql://orbit:password@localhost:5432/orbit_erp_test npm test
```

CI provisions PostgreSQL, installs dependencies, typechecks/builds the TypeScript API, runs unit and real-database integration tests, and builds the React client.

## Deployment

Deploy the server container with `DATABASE_URL`, a strong `JWT_SECRET`, `CLIENT_URL`, and `NODE_ENV=production`; run migrations once as a release task. Deploy the Nginx client image with `VITE_API_URL` targeting the HTTPS API. Use managed PostgreSQL backups and terminate TLS at the platform load balancer.

## Screenshots

Capture the role-aware dashboard, CRM detail, product detail, challan builder, and print document after seeding. Screenshots are intentionally not committed so they cannot drift from the current UI.

## Known limitations

- Browser print-to-PDF is used instead of server-rendered PDF storage.
- Assignment authentication uses short-lived bearer access tokens in browser storage (session storage unless “Remember me” is selected). Production should add secure, rotating, HttpOnly refresh cookies or managed identity.
- Notifications and read receipts are persistent per user, but delivery is in-app only; there is no email/SMS or background push worker.

## Future improvements

- GST invoice and payment reconciliation modules
- S3-compatible product-image storage abstraction
- Ephemeral PostgreSQL integration tests and browser end-to-end coverage
