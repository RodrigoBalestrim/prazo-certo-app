-- Prazo Certo: correções de segurança (aplicar no SQL Editor do Supabase)
-- 1) Catálogo: só o criador pode completar a imagem
-- 2) Buckets: usuários podem apagar apenas as próprias imagens
-- 3) Produtos da empresa: exclusão só para owner/admin

-- 1) Catálogo: só o criador completa a imagem
drop policy if exists "Users can complete a missing catalog image" on public.product_catalog;
create policy "Users can complete a missing catalog image"
on public.product_catalog for update
to authenticated
using ((select auth.uid()) = created_by and image_url is null)
with check ((select auth.uid()) = created_by and image_url is not null);

-- 2a) product-images: delete apenas das próprias fotos
drop policy if exists "Users delete their own product images" on storage.objects;
create policy "Users delete their own product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 2b) product-cutouts: delete apenas das próprias fotos
drop policy if exists "Users delete their own cutout images" on storage.objects;
create policy "Users delete their own cutout images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-cutouts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Produtos da empresa: exclusão restrita a owner/admin
drop policy if exists "Equipe remove produtos" on public.products;
create policy "Equipe remove produtos"
on public.products for delete
to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or (
    public.is_organization_member(organization_id)
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = products.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  )
);