# How to push this (for whoever is doing the GitHub side)

This folder is already a git repository with one clean commit. `node_modules`
and `.env` are gitignored, so a normal `git push` will not leak anything.

**Do not run `git add -f` on `.env`.** That is the file that caused the leak.

---

## Option A — fresh repo (recommended)

The old repo's history still contains `backend/.env` and ~19 MB of committed
`node_modules`. A new commit cannot remove them from history. Starting clean is
faster and safer than rewriting.

1. On GitHub, delete `Vijitha-08/Expense-Tracker-App`
   (Settings → scroll to the bottom → Delete this repository).
2. Create a new empty repo with the same name. **Do not** add a README,
   .gitignore, or licence — this folder already has them.
3. From inside this folder:

```bash
git remote add origin https://github.com/Vijitha-08/Expense-Tracker-App.git
git branch -M main
git push -u origin main
```

## Option B — keep the repo, overwrite the branch

Keeps the repo URL and stars, but the leaked `.env` stays reachable in the old
objects until GitHub garbage-collects them. Only do this if deleting the repo is
not an option.

```bash
git remote add origin https://github.com/Vijitha-08/Expense-Tracker-App.git
git branch -M main
git push --force origin main
```

Then still read `SECURITY-ACTION-REQUIRED.md` — the credentials must be rotated
either way, because they were public.

---

## Running it after cloning

```bash
# 1. backend
cd backend
npm install
cp .env.example .env        # Windows cmd: copy .env.example .env
                            # then set DB_PASSWORD and generate a JWT_SECRET

# 2. database (no psql needed - runs through the pg driver)
npm run db:init

# 3. start the API
npm run dev                 # http://localhost:5000

# 4. frontend, in a second terminal
cd ../frontend
npm install
cp .env.example .env.local
npm run dev                 # http://localhost:5173
```

In VS Code, open the project root and use `Terminal -> Run Task`; the tasks for
install, database setup and running both servers are committed in `.vscode/`.

Generate the JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server will refuse to start if `JWT_SECRET` is missing or under 32
characters — that is intentional, not a bug.

---

## First run

On a brand-new database, open `/register` and you will see **two** options:

- **User Account** — records expenses and tracks their own spending
- **Administrator** — sees everyone's expenses and insights, manages user accounts

Create the **Administrator first**. That option only appears while no admin
exists; once you make one it disappears from the page, and any further admins
are added from the admin's own Team panel. That is deliberate — an admin can read
every user's expenses, so open admin sign-up is only safe on an empty install.

To demo the whole thing in three steps:

1. Register the admin, then log out.
2. Register a user, add two or three expenses — they save instantly and the
   charts, cards and table update straight away. Log out.
3. Log in as the admin: the Insights tab shows overall charts and top
   spenders, All expenses lists every user's spending with an *Added by*
   column (emails masked), and the Users tab manages accounts.

---

## Windows note

`npm run db:init` is a Node script, so it works in PowerShell and `cmd.exe`
without Postgres command line tools on PATH. It preserves existing users and
expenses. Use `npm run db:reset` only when you intentionally want to delete
both tables' data.

The only difference on `cmd.exe` is copying the env templates — use `copy`
instead of `cp`. PowerShell aliases `cp`, so it works there as-is.
