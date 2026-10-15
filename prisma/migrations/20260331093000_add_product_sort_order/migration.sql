ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered_products AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, id ASC) AS next_sort_order
  FROM "Product"
)
UPDATE "Product" AS product
SET "sortOrder" = ordered_products.next_sort_order
FROM ordered_products
WHERE product.id = ordered_products.id
  AND product."sortOrder" = 0;
