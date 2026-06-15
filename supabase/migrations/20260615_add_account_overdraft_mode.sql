ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS overdraft_mode TEXT DEFAULT 'allow';

ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_overdraft_mode_check;

ALTER TABLE accounts
ADD CONSTRAINT accounts_overdraft_mode_check CHECK (overdraft_mode IN ('allow', 'warn', 'block'));
