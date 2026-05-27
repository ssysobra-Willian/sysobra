ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR NOT NULL DEFAULT 'FINANCIAL';
UPDATE audit_logs SET description = '' WHERE description IS NULL;
ALTER TABLE audit_logs ALTER COLUMN description SET NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_company_id_created_at_idx ON audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_company_id_module_idx ON audit_logs (company_id, module);
CREATE INDEX IF NOT EXISTS audit_logs_company_id_user_id_idx ON audit_logs (company_id, user_id);
