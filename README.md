# Expense Tracker App

Role-based expense tracking with overall admin insights.
React (Vite) frontend, Express + PostgreSQL backend, JWT auth.

---

## Roles

| Role | What they do | What they can see |
|---|---|---|
| `user` | Records expenses and tracks their own spending | Only their own rows |
| `admin` | Sees everyone's expenses and spending insights, manages user accounts | Every row |

Expenses save directly — **there is no approval step**. The two roles are still
not two labels on the same screen: an admin cannot record an expense at all
(`POST /api/expenses` returns 403 for an admin token), and a user cannot reach
any `/api/admin` route. Each sees a different dashboard with different content:

| | User dashboard | Admin dashboard |
|---|---|---|
| Figures | This month, total spent, average entry, top category | Total spend, this month, top category, people submitting |
| Main action | **New expense** — slide-over form | — (admins view, they do not add) |
| Charts | Own spend over time, own category donut | Overall spend over time, top spenders, category split |
| Table | Own expenses with period filters (last week / month / 3 / 6 / 12 months / total), edit/delete inline | Every expense with an *Added by* column (email masked), filterable by person and category |
| Extra | — | Users panel: add users and admins |

### Getting the first admin

An admin can read every user's expenses, so open admin self-registration is only
safe while there is nobody to protect. The **first** admin can sign up at
`/register/admin`; once one exists that option disappears from the register page
and further admins are created from inside the Users panel. `GET
/api/auth/setup-state` is what the register page checks.

---

## Setup

### 1. Backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env          # macOS / Linux / PowerShell
copy .env.example .env        # Windows cmd.exe
```

Set `DB_PASSWORD` to your Postgres password, then generate a real `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server refuses to start if `JWT_SECRET` is missing, under 32 characters, or
still contains the placeholder text. That is intentional, not a bug.

### 2. Database

```bash
npm run db:init
```

This creates the database if it does not exist and applies `database/schema.sql`.
It runs through the `pg` driver rather than shelling out, so it works the same on
Windows, macOS and Linux and does **not** require `psql` or `createdb` on your
PATH. Re-running it is safe and preserves existing accounts and expenses. A
destructive reset is a separate, explicit command:

```bash
npm run db:reset            # WARNING: deletes all users and expenses
```

### 3. Run the API

```bash
npm run dev               # nodemon on http://localhost:5000
```

Generate a real `JWT_SECRET` — the server refuses to boot if it is missing or
shorter than 32 characters:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # or: copy .env.example .env.local
npm run dev                   # http://localhost:5173
```

## Folder layout

The folder set matches the original project exactly:

```
backend/    config  controllers  database  middleware  models  routes
frontend/src/  assets  components  context  pages  services  styles
```

Nothing lives outside those. Shared helpers sit inside the existing folders
(`context/useAuth.js`, `services/format.js`, `scripts/init.js`) rather than in
new `hooks/` or `utils/` directories.

## Quickest possible start

```bash
npm run setup     # installs everything, sets up the database
npm start         # runs the API and the app together
```

Then open http://localhost:5173.

`npm run setup` asks for your PostgreSQL password, generates a real JWT secret,
writes both `.env` files and creates the database. If something is missing it
says which thing and how to fix it. It is safe to run more than once and does
not delete stored rows.

### Check what PostgreSQL is actually storing

From `backend/`, run:

```bash
npm run db:check
```

This read-only check prints the host, database, schema, database user, stored
user count and stored expense count used by the API. The API prints the same
connection target when it starts. If pgAdmin shows a different database name,
switch pgAdmin to the name printed by this command. You can also verify it in
pgAdmin with:

```sql
SELECT current_database(), current_schema(), current_user;
SELECT COUNT(*) AS users FROM public.users;
SELECT COUNT(*) AS expenses FROM public.expenses;
```

## Running it in VS Code

Open the **project root** (the folder containing `backend/` and `frontend/`), not
one of the subfolders — the tasks use relative paths from the root.

`.vscode/tasks.json` is committed, so `Terminal -> Run Task` gives you:

| Task | What it does |
|---|---|
| **1. Setup (run this once)** | `npm run setup` — installs everything, asks for your Postgres password, creates the database |
| **2. Run the app** | `npm start` — starts the API and Vite together |
| **Reset the database** | runs `db:reset`. Deletes all expenses and accounts |
| **Lint frontend** | `npm run lint` with results in the Problems panel |
| **Build frontend for production** | `npm run build` |

"2. Run the app" is the default build task, so <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>
starts everything.

`.vscode/launch.json` adds breakpoint debugging: **Debug backend (API)** runs
`server.js` with `.env` loaded, and **Debug backend + frontend** launches both
together.

VS Code itself does not provide Node or PostgreSQL — install those separately.
Nothing in the project is VS Code specific; the same npm commands work in any
terminal.

---

## API

All routes except `register` and `login` require `Authorization: Bearer <token>`.

### Auth
| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{name, email, password, role}` → token + user. `role: "admin"` only works while no admin exists |
| POST | `/api/auth/login` | `{email, password}` → token + user |
| GET | `/api/auth/setup-state` | `{adminExists}` — public, drives the register page |
| GET | `/api/auth/me` | Restores a session on page refresh |

### Expenses — `user` role only
An `admin` token gets 403 on everything below.

| Method | Route | Notes |
|---|---|---|
| GET | `/api/expenses` | Own rows only. Filters: `category`, `from`, `to`, `limit` |
| GET | `/api/expenses/summary` | Totals, per-category breakdown, per-month breakdown |
| POST | `/api/expenses` | Creates an expense owned by the caller. Category is free text (max 50 chars, blank becomes "Other") |
| GET | `/api/expenses/:id` | Ownership enforced |
| PUT | `/api/expenses/:id` | Owner only |
| DELETE | `/api/expenses/:id` | Owner only |

### Admin — `admin` role only
A `user` token gets 403 on all of these.

| Method | Route | Notes |
|---|---|---|
| GET | `/api/admin/overview` | Overall totals, categories, months, per-person spend, headcount. Emails masked |
| GET | `/api/admin/expenses` | Every expense. Filters: `category`, `userId`, `from`, `to`, `limit` |
| GET | `/api/admin/team` | Users with their spend rolled up, plus the admin list. Emails are masked server-side |
| POST | `/api/admin/team` | `{name, email, password, role}` — adds a user or another admin |

### Profile
`GET /api/users/profile`, `PUT /api/users/password`

---

## Project layout

```
backend/
  config/db.js            pooled pg client, exits on connection failure
  database/schema.sql     users + expenses, indexes, updated_at triggers
  middleware/
    authMiddleware.js     verifies the JWT and loads the live user row
    roleMiddleware.js     requireRole("admin"), requireRole("user")
  models/                 all SQL lives here (parameterised)
    expenseModel.js       one query builder for "mine" and "everyone's"
    userModel.js          + countAdmins() for the bootstrap rule
  controllers/            validation + authorisation + responses
    expenseController.js  the submitter's own expenses
    adminController.js    overview, all expenses, team
  routes/                 thin route wiring
  scripts/init.js         safe database setup (`db:init`) and explicit reset
  scripts/check.js        read-only connection target and persisted row counts
  server.js               env checks, CORS, JSON errors, 404 handler

frontend/src/
  services/api.js         axios instance, attaches token, normalises errors
  services/authService.js register/login/me/logout + dashboardPath()
  services/expenseService.js   the user's own expenses
  services/adminService.js     the admin's org-wide views
  services/format.js      money, moneyShort, monthLabel, waitingFor, percent
  context/AuthContext.jsx session state, restored via /auth/me
  context/useAuth.js      context accessor
  components/ProtectedRoute.jsx  auth + role gate
  components/DashboardLayout.jsx shared shell, optional section tabs
  components/MonthlyTrend.jsx    hand-rolled column chart, no chart library
  components/CategoryDonut.jsx   SVG donut via stroke-dasharray
  components/ExpenseDrawer.jsx   slide-over add/edit form
  components/TopSpenders.jsx     admin only
  components/TeamPanel.jsx       admin only
  pages/RegisterForm.jsx         one form, one wrapper per role
  pages/UserDashboard.jsx        record and track
  pages/AdminDashboard.jsx       insights, all expenses, team
  components/AuthShell.jsx       shared login/register chrome
  index.css                      palette tokens - change here, everything follows
```

---

## Notes on the design

- **Passwords** are bcrypt hashed at 12 rounds. Login returns the same
  "Invalid email or password" for an unknown email and a wrong password, and runs
  a dummy compare in the unknown-email branch, so the endpoint does not leak
  which addresses are registered.
- **The token is not trusted for role checks.** `authMiddleware` re-reads the
  user row on every request, so a deleted account or a changed role takes effect
  immediately instead of at token expiry.
- **The role check sits on the router, not on each handler** (`router.use(auth,
  requireRole("admin"))`), so a route added later cannot ship without it.
- **Submitter routes are scoped by `user_id` in SQL**, not by filtering in
  JavaScript after the fact. The admin views are the same query builder with the
  `userId` argument left off, which is the only difference between "my expenses"
  and "every expense".
- Money is `NUMERIC(12,2)` in Postgres — never a float — and is formatted for
  display only.
- **"Remember me"** is real, not decoration: checked stores the token in
  `localStorage`, unchecked uses `sessionStorage` so it dies with the tab.

## UI

Design tokens live in `src/index.css` — change the palette there and the landing
page, auth pages and dashboards all follow.

- `src/components/AuthShell.jsx` / `AuthIntro.jsx` — shared chrome for login,
  register and the account-type chooser, so those pages cannot drift apart.
- `src/styles/Login.css` — one stylesheet shared by all three auth pages,
  replacing the original `Login.css` / `UserRegister.css` / `RegisterPage.css`
  split. That split is what hid an unclosed brace in `UserRegister.css` which
  silently swallowed every stylesheet loaded after it.
- All icons are inline SVG via `react-icons` (Feather set). There are **no
  emojis** anywhere in the UI.
- Both charts are hand-written SVG/CSS. A single dimension over six months does
  not justify another dependency, and it keeps the install small.
- Deleting a row uses an **inline Confirm / Keep pair in the row**, not
  `window.confirm()`. A native dialog blocks the page, cannot be styled and is
  awkward to drive in a test.
- Type is Plus Jakarta Sans from Google Fonts, with a system-font fallback stack
  if that request is blocked.

Note: `App.css` deliberately does **not** set `font-family` on the universal
`*` selector. `*` matches every element directly, which beats inheritance from a
container — a global `* { font-family: ... }` silently overrides the font on
`.auth` and `.dash`. It is set on `body` instead.

For the same reason, the landing page's `.stat-card` rules are scoped to
`.stats .stat-card`. As a bare `.stat-card` they set `width: 120px; height:
100px; align-items: center`, and those leaked straight through `.dash
.stat-card` for every property the dashboard block had no reason to re-declare —
squashing the dashboard tiles into small boxes with clipped text. The dashboard
block now also states `width`, `height` and alignment explicitly, so a future
stray global cannot do it again.
