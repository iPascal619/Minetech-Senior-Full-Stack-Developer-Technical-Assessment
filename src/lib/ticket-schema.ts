import { query } from "@/lib/db";

export async function ensureTicketSchema() {
  await query(
    `ALTER TABLE tickets
       ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
       ADD COLUMN IF NOT EXISTS assignee TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  );
}