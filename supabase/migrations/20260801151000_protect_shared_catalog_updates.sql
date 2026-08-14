-- Restringe modificações do catálogo compartilhado a usuários autorizados.

create or replace function public.protect_product_catalog_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) <> old.created_by then
    if old.image_url is not null
      or new.image_url is null
      or new.barcode <> old.barcode
      or new.name <> old.name
      or new.category is distinct from old.category
      or new.created_by <> old.created_by
      or new.created_at <> old.created_at
    then
      raise exception 'Only the creator can change this catalog product';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_product_catalog_update on public.product_catalog;
create trigger protect_product_catalog_update
before update on public.product_catalog
for each row execute function public.protect_product_catalog_update();
