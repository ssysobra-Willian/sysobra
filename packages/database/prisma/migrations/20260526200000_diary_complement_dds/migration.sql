-- Migration: Complemento de RDO + DDS expandido
-- Adiciona campos de complemento em diary_entries e expande dds_themes.

-- ── 1. Campos de complemento em diary_entries ────────────────────────────────
ALTER TABLE "diary_entries"
  ADD COLUMN IF NOT EXISTS "is_complement"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "parent_report_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "complement_letter" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'diary_entries_parent_report_id_fkey' AND table_name = 'diary_entries'
  ) THEN
    ALTER TABLE "diary_entries"
      ADD CONSTRAINT "diary_entries_parent_report_id_fkey"
      FOREIGN KEY ("parent_report_id") REFERENCES "diary_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 2. Enum DdsCategory ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "DdsCategory" AS ENUM (
    'HEIGHT_WORK','EXCAVATION','ELECTRICAL','SCAFFOLDING','TOOLS',
    'PPE','FIRE','CHEMICAL','ERGONOMICS','TRAFFIC','HOUSEKEEPING',
    'LIFTING','CONCRETE','MASONRY','ROOFING','CONFINED_SPACE',
    'FIRST_AID','ACCIDENT_REPORT','GENERAL_SAFETY','HEALTH',
    'ENVIRONMENT','QUALITY','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 3. Expandir dds_themes ───────────────────────────────────────────────────
ALTER TABLE "dds_themes"
  ADD COLUMN IF NOT EXISTS "tags"         TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "duration"     INTEGER      NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "order"        INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

-- Migrar category de TEXT para DdsCategory enum
-- Primeiro: renomear coluna antiga
ALTER TABLE "dds_themes" RENAME COLUMN "category" TO "category_old";
-- Criar nova coluna com enum
ALTER TABLE "dds_themes"
  ADD COLUMN "category" "DdsCategory" NOT NULL DEFAULT 'OTHER';
-- Remover is_global (substituído por companyId IS NULL)
ALTER TABLE "dds_themes" DROP COLUMN IF EXISTS "is_global";
-- Remover coluna antiga
ALTER TABLE "dds_themes" DROP COLUMN "category_old";

-- FK para created_by_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dds_themes_created_by_id_fkey' AND table_name = 'dds_themes'
  ) THEN
    ALTER TABLE "dds_themes"
      ADD CONSTRAINT "dds_themes_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Índice composto
CREATE INDEX IF NOT EXISTS "dds_themes_company_id_category_idx"
  ON "dds_themes" ("company_id", "category");
