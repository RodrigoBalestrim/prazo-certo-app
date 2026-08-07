-- Prazo Certo: Melhorias com IA
-- Permissões por nível, auditoria, histórico de imagens e campos de IA.
-- Execute no SQL Editor do Supabase (após os dois schemas atuais).

-- 1) Novos campos de produto (foto original, foto sem fundo e dados de IA)
alter table public.products
  add column if not exists brand text,
  add column if not exists description text,
  add column if not exists packaging_type text,
  add column if not exists photo_original_url text,
  add column if not exists photo_cutout_url text;

create index if not exists products_barcode_idx on public.products(barcode);

-- 2) Histórico de imagens (foto original + processada + responsável + data)
create table if not exists public.product_image_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_url text,
  cutout_url text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.product_image_history enable row level security;

drop policy if exists "Equipe consulta o histórico de imagens" on public.product_image_history;
create policy "Equipe consulta o histórico de imagens"
on public.product_image_history for select to authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and (
        (p.organization_id is null and p.user_id = auth.uid())
        or public.is_organization_member(p.organization_id)
      )
  )
);

drop policy if exists "Usuários registram o próprio processamento" on public.product_image_history;
create policy "Usuários registram o próprio processamento"
on public.product_image_history for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.products p
    where p.id = product_id
      and (
        (p.organization_id is null and p.user_id = auth.uid())
        or public.is_organization_member(p.organization_id)
      )
  )
);

-- 3) Auditoria do sistema
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  action text not null
    check (action in ('create', 'update', 'delete', 'role_change', 'config_change')),
  product_id text,
  product_name text,
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "Equipe consulta o histórico de auditoria" on public.audit_logs;
create policy "Equipe consulta o histórico de auditoria"
on public.audit_logs for select to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.is_organization_member(organization_id)
);

create index if not exists audit_logs_product_idx on public.audit_logs(product_id);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

-- 4) Níveis de permissão: owner, admin, manager (gerente), stockist (estoquista), viewer (visualizador)
do $$
begin
  begin
    alter table public.organization_members drop constraint organization_members_role_check;
  exception when undefined_object then null;
  end;
end $$;

update public.organization_members set role = 'stockist' where role = 'member';

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'manager', 'stockist', 'viewer'));

create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_company()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin'), false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_add_products()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin', 'manager', 'stockist'), false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_edit_products()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin', 'manager', 'stockist'), false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_delete_products()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin'), false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

-- 5) Políticas de produto respeitando os níveis
drop policy if exists "Equipe visualiza produtos" on public.products;
drop policy if exists "Equipe cadastra produtos" on public.products;
drop policy if exists "Equipe altera produtos" on public.products;
drop policy if exists "Equipe remove produtos" on public.products;

create policy "Equipe visualiza produtos"
on public.products for select to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.is_organization_member(organization_id)
);

create policy "Equipe cadastra produtos"
on public.products for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    organization_id is null
    or (public.is_organization_member(organization_id) and public.can_add_products())
  )
);

create policy "Equipe altera produtos"
on public.products for update to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or (public.is_organization_member(organization_id) and public.can_edit_products())
)
with check (
  (organization_id is null and user_id = auth.uid())
  or (public.is_organization_member(organization_id) and public.can_edit_products())
);

create policy "Equipe remove produtos"
on public.products for delete to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or (public.is_organization_member(organization_id) and public.can_delete_products())
);

-- 6) Auditoria automática de produtos (quem, o quê, quando, antes/depois)
create or replace function public.log_product_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_org uuid;
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    return coalesce(new, old);
  end if;

  select organization_id into acting_org
  from public.organization_members
  where user_id = acting_user
  limit 1;

  if TG_OP = 'INSERT' then
    insert into public.audit_logs
      (user_id, organization_id, action, product_id, product_name)
    values
      (acting_user, acting_org, 'create', new.id, new.name);
    return new;
  end if;

  if TG_OP = 'DELETE' then
    insert into public.audit_logs
      (user_id, organization_id, action, product_id, product_name)
    values
      (acting_user, acting_org, 'delete', old.id, old.name);
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    if new.name is distinct from old.name then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'name', old.name, new.name);
    end if;
    if new.quantity is distinct from old.quantity then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'quantity', old.quantity::text, new.quantity::text);
    end if;
    if new.expires_at is distinct from old.expires_at then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'expires_at', old.expires_at::text, new.expires_at::text);
    end if;
    if new.category is distinct from old.category then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'category', old.category, new.category);
    end if;
    if new.image_url is distinct from old.image_url then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'image_url', old.image_url, new.image_url);
    end if;
    if new.photo_cutout_url is distinct from old.photo_cutout_url then
      insert into public.audit_logs
        (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
      values (acting_user, acting_org, 'update', new.id, new.name, 'photo_cutout_url', old.photo_cutout_url, new.photo_cutout_url);
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists log_product_audit on public.products;
create trigger log_product_audit
after insert or update or delete on public.products
for each row execute function public.log_product_audit();

-- 7) Registro manual de auditoria pelo app (função segura)
create or replace function public.insert_audit_log(
  p_action text,
  p_product_id text default null,
  p_product_name text default null,
  p_field_name text default null,
  p_old_value text default null,
  p_new_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_org uuid;
  acting_user uuid := auth.uid();
begin
  if acting_user is null then return; end if;
  if p_action not in ('create', 'update', 'delete', 'role_change', 'config_change') then
    raise exception 'Ação inválida para auditoria';
  end if;

  select organization_id into acting_org
  from public.organization_members
  where user_id = acting_user
  limit 1;

  insert into public.audit_logs
    (user_id, organization_id, action, product_id, product_name, field_name, old_value, new_value)
  values
    (acting_user, acting_org, p_action, p_product_id, p_product_name, p_field_name, p_old_value, p_new_value);
end;
$$;

-- 8) Gestão de funções (owner/admin gerenciam a equipe)
create or replace function public.update_member_role(member_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
  caller_role text;
  target_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if new_role not in ('admin', 'manager', 'stockist', 'viewer') then
    raise exception 'Função inválida';
  end if;

  select organization_id, role into caller_org, caller_role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if caller_role is null then raise exception 'Você não participa de uma empresa'; end if;
  if caller_role not in ('owner', 'admin') then
    raise exception 'Apenas administradores podem alterar funções';
  end if;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'A função do proprietário não pode ser alterada'; end if;
  if caller_role = 'admin' and (new_role = 'admin' or target_role = 'admin') then
    raise exception 'Somente o proprietário pode gerenciar administradores';
  end if;

  update public.organization_members set role = new_role
  where organization_id = caller_org and user_id = member_user_id;

  insert into public.audit_logs
    (user_id, organization_id, action, field_name, old_value, new_value)
  values
    (auth.uid(), caller_org, 'role_change', 'role', target_role, new_role);
end;
$$;

-- 9) Atualiza listagem de membros para as novas funções
create or replace function public.list_company_members()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_organization_id uuid;
begin
  select organization_id into caller_organization_id
  from public.organization_members
  where organization_members.user_id = auth.uid();

  if caller_organization_id is null then
    raise exception 'Você não participa de uma empresa';
  end if;

  return query
  select
    member.user_id,
    coalesce(
      account.raw_user_meta_data ->> 'full_name',
      account.raw_user_meta_data ->> 'name',
      split_part(account.email, '@', 1)
    ),
    account.email::text,
    member.role,
    member.joined_at
  from public.organization_members member
  join auth.users account on account.id = member.user_id
  where member.organization_id = caller_organization_id
  order by
    case member.role
      when 'owner' then 1
      when 'admin' then 2
      when 'manager' then 3
      when 'stockist' then 4
      else 5
    end,
    member.joined_at;
end;
$$;

-- 10) Catálogo compartilhado com dados da IA
alter table public.product_catalog
  add column if not exists brand text,
  add column if not exists description text,
  add column if not exists packaging_type text,
  add column if not exists image_cutout_url text;

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
      or new.brand is distinct from old.brand
      or new.description is distinct from old.description
      or new.packaging_type is distinct from old.packaging_type
      or (old.image_cutout_url is not null and new.image_cutout_url is distinct from old.image_cutout_url)
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

-- 11) Bucket para fotos sem fundo (PNG transparente)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-cutouts',
  'product-cutouts',
  true,
  5242880,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public cutout images are readable" on storage.objects;
create policy "Public cutout images are readable"
on storage.objects for select
using (bucket_id = 'product-cutouts');

drop policy if exists "Users upload their own cutout images" on storage.objects;
create policy "Users upload their own cutout images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-cutouts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their own cutout images" on storage.objects;
create policy "Users update their own cutout images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-cutouts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-cutouts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 12) Permissões das novas funções
revoke all on function public.get_my_role() from public;
revoke all on function public.can_manage_company() from public;
revoke all on function public.can_add_products() from public;
revoke all on function public.can_edit_products() from public;
revoke all on function public.can_delete_products() from public;
revoke all on function public.insert_audit_log(text, text, text, text, text, text) from public;
revoke all on function public.update_member_role(uuid, text) from public;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.can_manage_company() to authenticated;
grant execute on function public.can_add_products() to authenticated;
grant execute on function public.can_edit_products() to authenticated;
grant execute on function public.can_delete_products() to authenticated;
grant execute on function public.insert_audit_log(text, text, text, text, text, text) to authenticated;
grant execute on function public.update_member_role(uuid, text) to authenticated;
