-- Add reserved_quantity to store_products for Sales Order stock reservation.
-- Available = stock_quantity - reserved_quantity

ALTER TABLE store_products ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(12,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN store_products.reserved_quantity IS 'Quantity reserved by open Sales Orders. Available = stock_quantity - reserved_quantity';
