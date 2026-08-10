# Security: do these before pushing anything else

The public repo `github.com/Vijitha-08/Expense-Tracker-App` has
`backend/.env` committed, so these values are on the internet and in
the git history:

```
DB_PASSWORD=Vijitha@08••••   (redacted here; the full value is in the repo)
JWT_SECRET=mysecretkey123
```

Deleting the file in a new commit is **not enough** — `git log` still serves the
old version. Treat both values as compromised.

---

## 1. Change the Postgres password

```sql
-- psql, as a superuser
ALTER USER postgres WITH PASSWORD 'a-new-strong-password';
```

Then update `DB_PASSWORD` in your local `backend/.env` (which is now gitignored).

**If that password is reused for any personal account — email, GitHub, college
portal, anything — change it there too.** That is the part that actually matters;
a local Postgres password is low stakes, a reused personal password is not.

## 2. Rotate the JWT secret

A shipped `backend/.env` in this handover already contains a freshly generated
96-character secret. To make your own:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Rotating it invalidates every existing token, which is the point. `server.js`
now refuses to start if `JWT_SECRET` is missing or under 32 characters.

## 3. Get the secrets and `node_modules` out of git

`node_modules` was committed twice — 2,185 files, roughly 19 MB. A `.gitignore`
now covers both it and `.env`, but the existing history still contains them.

**Option A — recommended for a project this young.** Delete the repo on GitHub,
create a fresh one, and push this cleaned tree as the first commit. Fastest, and
guarantees nothing lingers.

**Option B — rewrite history in place.** Requires `git-filter-repo`:

```bash
pip install git-filter-repo

git clone https://github.com/Vijitha-08/Expense-Tracker-App.git etapp-clean
cd etapp-clean
git filter-repo --invert-paths \
  --path backend/.env \
  --path node_modules \
  --path backend/node_modules

git push --force origin main
```

Anyone else with a clone must re-clone afterwards; a force-push does not clean
up their copies. GitHub may also keep the old blobs reachable for a while — open
a support request if you need them purged immediately.

## 4. Untrack them locally, if you keep the repo

```bash
git rm -r --cached node_modules backend/node_modules
git rm --cached backend/.env
git add .gitignore backend/.gitignore backend/.env.example
git commit -m "Stop tracking node_modules and .env; add gitignore and env template"
```

---

## What is now enforced in code

| Risk | Before | Now |
|---|---|---|
| Secrets in git | `.env` committed, no `.gitignore` | `.gitignore` at root and in `backend/`, `.env.example` committed instead |
| Weak signing key | `mysecretkey123` | Server exits at boot if `JWT_SECRET` is under 32 chars, still contains placeholder text, or uses fewer than 12 distinct characters |
| Open API | `authMiddleware = (req,res,next) => next()` | Real JWT verification, live user lookup, 401 on failure |
| No role checks | `roleMiddleware.js` was an empty file | `requireRole(...)` implemented and used to gate role-specific routes → 403 |
| Unprotected UI routes | Any URL reachable by typing it | `ProtectedRoute` gates on auth **and** role |
| Weak passwords accepted | No validation | Minimum 8 characters, bcrypt at 12 rounds |
| User enumeration | "Invalid Email" vs "Invalid Password" | One message for both, plus a dummy compare |
| Cross-user data access | No ownership checks | Every read/update/delete verifies ownership; no role can bypass it |
| CORS wide open | `app.use(cors())` | Origin allowlist from `CORS_ORIGIN` |
| Raw errors to client | `res.json({message: err.message})` leaked SQL | Generic messages to the client, full detail to the server log |
| JWT shown to the user | `alert(JSON.stringify(res.data))` | Removed |
