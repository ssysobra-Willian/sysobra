-- Migration: Diário de Obra — refactoring completo
-- Adiciona campos pluviométricos, condições climáticas, status DRAFT,
-- e cria tabelas DiaryStageEntry, DiaryOccurrence, DiaryRainRecord.

-- ── 1. Adicionar novos valores ao enum DiaryStatus ──────────────────────────
-- PostgreSQL não suporta DROP de enum values; adicionamos DRAFT
ALTER TYPE "DiaryStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- ── 2. Criar enums novos ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WeatherCondition" AS ENUM ('SUNNY','CLOUDY','OVERCAST','RAINY','STORMY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OccurrenceType" AS ENUM ('ACCIDENT','INCIDENT','VISIT','INSPECTION','STOPPAGE','NONCONFORMITY','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OccurrenceSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 3. Ampliar tabela diary_entries ─────────────────────────────────────────
ALTER TABLE "diary_entries"
  ADD COLUMN IF NOT EXISTS "report_number"          TEXT,
  ADD COLUMN IF NOT EXISTS "weather_morning"        "WeatherCondition",
  ADD COLUMN IF NOT EXISTS "weather_afternoon"      "WeatherCondition",
  ADD COLUMN IF NOT EXISTS "weather_night"          "WeatherCondition",
  ADD COLUMN IF NOT EXISTS "rain_morning_mm"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rain_afternoon_mm"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rain_night_mm"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_rain_mm"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workable_morning"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "workable_afternoon"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "workable_night"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "suggested_unworkable"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unworkable_confirmed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "general_activities"     TEXT,
  ADD COLUMN IF NOT EXISTS "general_notes"          TEXT,
  ADD COLUMN IF NOT EXISTS "notes_public"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dds_theme"              TEXT,
  ADD COLUMN IF NOT EXISTS "dds_done"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dds_time"               TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_by"             TEXT;

-- FK para rejected_by_id (sem CASCADE — manter log mesmo se usuário excluído)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'diary_entries_rejected_by_id_fkey'
      AND table_name = 'diary_entries'
  ) THEN
    ALTER TABLE "diary_entries"
      ADD CONSTRAINT "diary_entries_rejected_by_id_fkey"
      FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. Criar tabela diary_stage_entries ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "diary_stage_entries" (
  "id"                TEXT        NOT NULL,
  "diary_id"          TEXT        NOT NULL,
  "stage_id"          TEXT        NOT NULL,
  "previous_progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "current_progress"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "progress_delta"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activities"        TEXT        NOT NULL DEFAULT '',
  "comments"          TEXT,
  "photos"            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "diary_stage_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "diary_stage_entries_diary_id_stage_id_key" UNIQUE ("diary_id", "stage_id"),
  CONSTRAINT "diary_stage_entries_diary_id_fkey"
    FOREIGN KEY ("diary_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "diary_stage_entries_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── 5. Criar tabela diary_occurrences ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "diary_occurrences" (
  "id"              TEXT              NOT NULL,
  "diary_id"        TEXT              NOT NULL,
  "type"            "OccurrenceType"  NOT NULL DEFAULT 'OTHER',
  "severity"        "OccurrenceSeverity" NOT NULL DEFAULT 'LOW',
  "description"     TEXT              NOT NULL,
  "action"          TEXT,
  "responsible"     TEXT,
  "visitor_name"    TEXT,
  "visitor_company" TEXT,
  "visitor_purpose" TEXT,
  "photos"          TEXT[]            NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notify_manager"  BOOLEAN           NOT NULL DEFAULT false,
  "created_at"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "diary_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "diary_occurrences_diary_id_fkey"
    FOREIGN KEY ("diary_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── 6. Criar tabela diary_rain_records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "diary_rain_records" (
  "id"                TEXT         NOT NULL,
  "company_id"        TEXT         NOT NULL,
  "project_id"        TEXT         NOT NULL,
  "diary_id"          TEXT         NOT NULL,
  "date"              TIMESTAMP(3) NOT NULL,
  "morning_mm"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "afternoon_mm"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "night_mm"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_mm"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "is_unworkable"     BOOLEAN      NOT NULL DEFAULT false,
  "unworkable_reason" TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "diary_rain_records_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "diary_rain_records_diary_id_key" UNIQUE ("diary_id"),
  CONSTRAINT "diary_rain_records_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "diary_rain_records_diary_id_fkey"
    FOREIGN KEY ("diary_id")   REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "diary_rain_records_project_id_date_idx"
  ON "diary_rain_records" ("project_id", "date");
