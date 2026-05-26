-- Migration: Adiciona companyId em FinancialAuditLog para manter logs visíveis
-- mesmo quando a transação vinculada for excluída permanentemente.

-- AddColumn
ALTER TABLE "financial_audit_logs"
  ADD COLUMN "company_id" TEXT;

-- AddIndex (para filtrar logs por empresa eficientemente)
CREATE INDEX "financial_audit_logs_company_id_created_at_idx"
  ON "financial_audit_logs" ("company_id", "created_at");

-- AddForeignKey (sem onDelete: Cascade — logs devem sobreviver à empresa)
ALTER TABLE "financial_audit_logs"
  ADD CONSTRAINT "financial_audit_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
