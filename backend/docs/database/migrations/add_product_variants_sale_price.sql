-- Add sale_price to product_variants for default selling price per variant.
-- store_products.store_sale_price remains as per-store override.

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2) NULL;

COMMENT ON COLUMN product_variants.sale_price IS 'Default selling price for this variant. Per-store override in store_products.store_sale_price.';
