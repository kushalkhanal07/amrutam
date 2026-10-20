-- Check constraints Prisma cannot express in the schema file.

-- A slot must end after it starts.
ALTER TABLE "availability_slots"
  ADD CONSTRAINT "availability_slots_time_order_check" CHECK ("ends_at" > "starts_at");

-- A consultation must end after it starts.
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_time_order_check" CHECK ("scheduled_ends_at" > "scheduled_starts_at");

-- Money is never negative.
ALTER TABLE "doctors"
  ADD CONSTRAINT "doctors_fee_non_negative_check" CHECK ("consultation_fee_minor" >= 0);
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative_check" CHECK ("amount_minor" >= 0);

-- Currency codes are 3 upper-case letters (ISO 4217).
ALTER TABLE "doctors"
  ADD CONSTRAINT "doctors_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');

-- Prescription items must have a positive duration.
ALTER TABLE "prescription_items"
  ADD CONSTRAINT "prescription_items_duration_positive_check" CHECK ("duration_days" > 0);
