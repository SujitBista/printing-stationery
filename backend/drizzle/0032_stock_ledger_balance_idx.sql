CREATE INDEX IF NOT EXISTS "stock_ledger_store_item_unit_category_date_idx"
  ON "stock_ledger" (
    "store_id",
    "item_id",
    "unit_id",
    "stock_category",
    "transaction_date",
    "created_at"
  );
