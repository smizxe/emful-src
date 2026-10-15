-- Photos of the finished garment, uploaded by the shop for the seller to see
-- and download. JSON array of URLs.
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "productPhotos" TEXT NOT NULL DEFAULT '[]';
