-- ============================================================
-- Expense Tracker App - PostgreSQL schema
-- ============================================================
-- Roles:
--   'user'  -> records their own expenses and tracks their spending
--   'admin' -> sees every user's expenses and spending insights,
--              and manages the team. Admins do not record
--              expenses of their own.
--
-- Expenses save directly - there is no approval step.
--
-- Run:  npm run db:init          (from the backend folder)
--   or: psql -U postgres -d Expense_Tracker_App -f database/schema.sql
--
-- This file is deliberately non-destructive. It can be applied again without
-- deleting registered users or expenses. Use `npm run db:reset` only when a
-- complete development reset is intentional.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(150) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,            -- bcrypt hash, never plaintext
    role        VARCHAR(20)  NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'admin')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- The API matches emails case-insensitively, so enforce uniqueness the same way.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS expenses (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         VARCHAR(150)   NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    category      VARCHAR(50)    NOT NULL DEFAULT 'Other',
    expense_date  DATE           NOT NULL DEFAULT CURRENT_DATE,
    description   TEXT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_user_id_idx      ON expenses (user_id);
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx     ON expenses (category);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
