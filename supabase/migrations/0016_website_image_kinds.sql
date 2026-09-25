-- Prompt 32: Website Builder editor completion.
-- Add 'doctor' kind for the About section portrait alongside 'hero' and 'gallery'.

ALTER TABLE public.website_images
  DROP CONSTRAINT website_images_kind_check;

ALTER TABLE public.website_images
  ADD CONSTRAINT website_images_kind_check
    CHECK (kind = ANY (ARRAY['hero'::text, 'doctor'::text, 'gallery'::text]));
