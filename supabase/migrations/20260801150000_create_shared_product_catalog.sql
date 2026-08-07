create table if not exists public.product_catalog (
  barcode text primary key,
  name text not null check (char_length(name) between 2 and 160),
  image_url text,
  category text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_catalog enable row level security;

grant select, insert, update on table public.product_catalog to authenticated;
revoke all on table public.product_catalog from anon;

drop policy if exists "Authenticated users read product catalog" on public.product_catalog;
create policy "Authenticated users read product catalog"
on public.product_catalog for select
to authenticated
using (true);

drop policy if exists "Users contribute catalog products" on public.product_catalog;
create policy "Users contribute catalog products"
on public.product_catalog for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists "Creators update catalog products" on public.product_catalog;
create policy "Creators update catalog products"
on public.product_catalog for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

drop policy if exists "Users can complete a missing catalog image" on public.product_catalog;
create policy "Users can complete a missing catalog image"
on public.product_catalog for update
to authenticated
using (image_url is null)
with check (image_url is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public product images are readable" on storage.objects;
create policy "Public product images are readable"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "Users upload their own product images" on storage.objects;
create policy "Users upload their own product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their own product images" on storage.objects;
create policy "Users update their own product images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
