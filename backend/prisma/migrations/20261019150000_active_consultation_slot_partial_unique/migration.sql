-- A slot may be booked again after its consultation is cancelled, so the plain
-- UNIQUE(slot_id) is replaced by a partial unique index that only covers
-- consultations that still occupy the slot. This is still enforced by PostgreSQL:
-- two non-cancelled consultations can never share a slot.
DROP INDEX "consultations_slot_id_key";
CREATE INDEX "consultations_slot_id_idx" ON "consultations"("slot_id");
CREATE UNIQUE INDEX "consultations_active_slot_unique"
  ON "consultations"("slot_id")
  WHERE "status" <> 'CANCELLED';
