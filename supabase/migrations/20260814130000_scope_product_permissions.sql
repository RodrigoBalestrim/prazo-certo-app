-- Restringe permissões de produto ao grupo da própria linha.
create or replace function public.can_add_products(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and active
      and role in ('owner', 'admin', 'manager', 'stockist')
  );
$$;

create or replace function public.can_edit_products(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and active
      and role in ('owner', 'admin', 'manager', 'stockist')
  );
$$;

create or replace function public.can_delete_products(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and active
      and role in ('owner', 'admin', 'manager')
  );
$$;

drop policy if exists "Equipe cadastra produtos" on public.products;
drop policy if exists "Equipe edita produtos" on public.products;
drop policy if exists "Equipe remove produtos" on public.products;

create policy "Equipe cadastra produtos"
on public.products for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    organization_id is null
    or public.can_add_products(organization_id)
  )
);

create policy "Equipe edita produtos"
on public.products for update to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.can_edit_products(organization_id)
)
with check (
  (organization_id is null and user_id = auth.uid())
  or public.can_edit_products(organization_id)
);

create policy "Equipe remove produtos"
on public.products for delete to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.can_delete_products(organization_id)
);

grant execute on function public.can_add_products(uuid) to authenticated;
grant execute on function public.can_edit_products(uuid) to authenticated;
grant execute on function public.can_delete_products(uuid) to authenticated;