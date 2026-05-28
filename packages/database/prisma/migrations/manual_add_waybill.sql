-- Migração manual: adiciona tabelas de Romaneio (Waybill)
-- Não altera tabelas existentes

CREATE TABLE IF NOT EXISTS "waybills" (
  "id"                          TEXT NOT NULL,
  "company_id"                  TEXT NOT NULL,
  "doc_number"                  TEXT NOT NULL,
  "category"                    TEXT NOT NULL,
  "status"                      TEXT NOT NULL DEFAULT 'DRAFT',
  "exit_type"                   TEXT NOT NULL,
  "location_id"                 TEXT NOT NULL,
  "destination_project_id"      TEXT,
  "destination_name"            TEXT,
  "driver_type"                 TEXT,
  "driver_employee_id"          TEXT,
  "driver_name"                 TEXT,
  "driver_document"             TEXT,
  "driver_phone"                TEXT,
  "vehicle_plate"               TEXT,
  "vehicle_model"               TEXT,
  "receiver_type"               TEXT,
  "receiver_employee_id"        TEXT,
  "receiver_name"               TEXT,
  "receiver_document"           TEXT,
  "receiver_phone"              TEXT,
  "receiver_role"               TEXT,
  "sender_user_id"              TEXT,
  "sender_name"                 TEXT,
  "sender_signature_url"        TEXT,
  "sender_signed_at"            TIMESTAMP(3),
  "driver_signature_url"        TEXT,
  "driver_signed_at"            TIMESTAMP(3),
  "receiver_signature_url"      TEXT,
  "receiver_signed_at"          TIMESTAMP(3),
  "signature_token"             TEXT,
  "signature_token_expires_at"  TIMESTAMP(3),
  "receiver_notes"              TEXT,
  "has_pendency"                BOOLEAN NOT NULL DEFAULT false,
  "pendency_notes"              TEXT,
  "pendency_resolved_at"        TIMESTAMP(3),
  "pendency_resolved_by"        TEXT,
  "emitted_at"                  TIMESTAMP(3),
  "dispatched_at"               TIMESTAMP(3),
  "received_at"                 TIMESTAMP(3),
  "notes"                       TEXT,
  "is_active"                   BOOLEAN NOT NULL DEFAULT true,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "waybills_signature_token_key"
  ON "waybills"("signature_token");

CREATE INDEX IF NOT EXISTS "waybills_company_id_status_idx"
  ON "waybills"("company_id", "status");

CREATE INDEX IF NOT EXISTS "waybills_company_id_category_idx"
  ON "waybills"("company_id", "category");

CREATE INDEX IF NOT EXISTS "waybills_company_id_location_id_idx"
  ON "waybills"("company_id", "location_id");

CREATE INDEX IF NOT EXISTS "waybills_signature_token_idx"
  ON "waybills"("signature_token");

ALTER TABLE "waybills"
  ADD CONSTRAINT "waybills_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_destination_project_id_fkey"
    FOREIGN KEY ("destination_project_id") REFERENCES "projects"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_driver_employee_id_fkey"
    FOREIGN KEY ("driver_employee_id") REFERENCES "employees"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_receiver_employee_id_fkey"
    FOREIGN KEY ("receiver_employee_id") REFERENCES "employees"("id") ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_sender_user_id_fkey"
    FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON UPDATE CASCADE;

-- ── WaybillItem ──

CREATE TABLE IF NOT EXISTS "waybill_items" (
  "id"             TEXT NOT NULL,
  "waybill_id"     TEXT NOT NULL,
  "item_id"        TEXT NOT NULL,
  "requested_qty"  DECIMAL(10,3) NOT NULL,
  "received_qty"   DECIMAL(10,3),
  "pending_qty"    DECIMAL(10,3),
  "unit_cost"      DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total_cost"     DECIMAL(15,2) NOT NULL DEFAULT 0,
  "serial_number"  TEXT,
  "tool_brand"     TEXT,
  "tool_model"     TEXT,
  "tool_condition" TEXT,
  "receiver_notes" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'OK',
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waybill_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waybill_items_waybill_id_idx"
  ON "waybill_items"("waybill_id");

CREATE INDEX IF NOT EXISTS "waybill_items_item_id_idx"
  ON "waybill_items"("item_id");

ALTER TABLE "waybill_items"
  ADD CONSTRAINT "waybill_items_waybill_id_fkey"
    FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "waybill_items_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON UPDATE CASCADE;

-- ── WaybillPendency ──

CREATE TABLE IF NOT EXISTS "waybill_pendencies" (
  "id"                  TEXT NOT NULL,
  "company_id"          TEXT NOT NULL,
  "waybill_id"          TEXT NOT NULL,
  "type"                TEXT NOT NULL,
  "description"         TEXT NOT NULL,
  "waybill_item_id"     TEXT,
  "item_name"           TEXT,
  "quantity_expected"   DECIMAL(10,3),
  "quantity_received"   DECIMAL(10,3),
  "assigned_to"         TEXT,
  "status"              TEXT NOT NULL DEFAULT 'OPEN',
  "resolved_at"         TIMESTAMP(3),
  "resolved_by"         TEXT,
  "resolution_notes"    TEXT,
  "alert_sent_at"       TIMESTAMP(3),
  "alert_sent_to"       TEXT,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waybill_pendencies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waybill_pendencies_company_id_status_idx"
  ON "waybill_pendencies"("company_id", "status");

CREATE INDEX IF NOT EXISTS "waybill_pendencies_waybill_id_idx"
  ON "waybill_pendencies"("waybill_id");

ALTER TABLE "waybill_pendencies"
  ADD CONSTRAINT "waybill_pendencies_waybill_id_fkey"
    FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "waybill_pendencies_waybill_item_id_fkey"
    FOREIGN KEY ("waybill_item_id") REFERENCES "waybill_items"("id") ON UPDATE CASCADE;
