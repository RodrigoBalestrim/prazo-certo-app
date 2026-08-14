-- Completa estrutura de grupos, configurações e sincronização de produtos.

-- Prazo Certo: Atualização completa
-- Campos faltantes do app + logo da empresa + usuário ativo.
-- Execute no SQL Editor (após as migrações anteriores) ou via supabase db push.

-- 1) Produtos: observações e arquivamento (campos já usados pelo app)
alter table public.products
  add column if not exists notes text,
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- 2) Empresa/grupo: nome da empresa, setor e logo
alter table public.organizations
  add column if not exists company_name text,
  add column if not exists sector text,
  add column if not exists company_logo_url text,
  add column if not exists updated_at timestamptz not null default now();

-- 3) Usuários do grupo: ativo/inativo
alter table public.organization_members
  add column if not exists active boolean not null default true;

-- 4) Bucket para logos de empresa
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public company logos are readable" on storage.objects;
create policy "Public company logos are readable"
on storage.objects for select
using (bucket_id = 'company-logos');

drop policy if exists "Users upload their own company logos" on storage.objects;
create policy "Users upload their own company logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their own company logos" on storage.objects;
create policy "Users update their own company logos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own company logos" on storage.objects;
create policy "Users delete their own company logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 5) Permissões respeitam usuário ativo
create or replace function public.can_manage_company()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin') and active, false)
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
  select coalesce(role in ('owner', 'admin', 'manager', 'stockist') and active, false)
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
  select coalesce(role in ('owner', 'admin', 'manager', 'stockist') and active, false)
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
  select coalesce(role in ('owner', 'admin') and active, false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

-- 6) create_company com dados da empresa (nome, setor, logo)
create or replace function public.create_company(
  company_name text,
  business_name text default null,
  company_sector text default null,
  company_logo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  new_invite_code text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if exists (select 1 from organization_members where user_id = auth.uid()) then
    raise exception 'Você já participa de uma empresa';
  end if;
  if char_length(trim(company_name)) < 2 then raise exception 'Informe um nome válido'; end if;

  loop
    new_invite_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from organizations where invite_code = new_invite_code);
  end loop;

  insert into organizations (name, company_name, sector, company_logo_url, invite_code, owner_id)
  values (
    trim(company_name),
    nullif(trim(coalesce(business_name, company_name)), ''),
    nullif(trim(company_sector), ''),
    nullif(trim(company_logo_url), ''),
    new_invite_code,
    auth.uid()
  )
  returning id into new_organization_id;

  insert into organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

-- 7) Atualizar dados da empresa (somente admin)
create or replace function public.update_company(
  p_group_name text default null,
  p_company_name text default null,
  p_sector text default null,
  p_logo_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
begin
  if not public.can_manage_company() then
    raise exception 'Apenas administradores podem alterar a empresa';
  end if;

  select organization_id into caller_org
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  update public.organizations
  set
    name = coalesce(nullif(trim(p_group_name), ''), name),
    company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
    sector = coalesce(nullif(trim(p_sector), ''), sector),
    company_logo_url = coalesce(nullif(trim(p_logo_url), ''), company_logo_url),
    updated_at = now()
  where id = caller_org;
end;
$$;

-- 8) Remover logo da empresa (somente admin)
create or replace function public.remove_company_logo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
begin
  if not public.can_manage_company() then
    raise exception 'Apenas administradores podem remover a logo';
  end if;

  select organization_id into caller_org
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  update public.organizations
  set company_logo_url = null, updated_at = now()
  where id = caller_org;
end;
$$;

-- 9) Ativar/desativar usuário (somente admin)
create or replace function public.set_member_active(member_user_id uuid, p_active boolean)
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
  if not public.can_manage_company() then
    raise exception 'Apenas administradores podem alterar participantes';
  end if;

  select organization_id, role into caller_org, caller_role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'O proprietário não pode ser desativado'; end if;
  if caller_role = 'admin' and target_role = 'admin' then
    raise exception 'Somente o proprietário pode gerenciar administradores';
  end if;

  update public.organization_members
  set active = coalesce(p_active, true)
  where organization_id = caller_org and user_id = member_user_id;

  insert into public.audit_logs
    (user_id, organization_id, action, field_name, old_value, new_value)
  values
    (auth.uid(), caller_org, 'config_change', 'active',
     case when coalesce(p_active, true) then 'false' else 'true' end,
     case when coalesce(p_active, true) then 'true' else 'false' end);
end;
$$;

-- 10) Listagem de membros com status ativo
drop function if exists public.list_company_members();
create or replace function public.list_company_members()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  joined_at timestamptz,
  active boolean
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
    member.joined_at,
    member.active
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

-- 11) Permissões das novas funções
revoke all on function public.create_company(text, text, text, text) from public;
revoke all on function public.update_company(text, text, text, text) from public;
revoke all on function public.remove_company_logo() from public;
revoke all on function public.set_member_active(uuid, boolean) from public;
revoke all on function public.list_company_members() from public;
grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.update_company(text, text, text, text) to authenticated;
grant execute on function public.remove_company_logo() to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.list_company_members() to authenticated;
