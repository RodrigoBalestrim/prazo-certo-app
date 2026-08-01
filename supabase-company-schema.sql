create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  invite_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (user_id)
);

alter table public.products
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_company(company_name text)
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

  insert into organizations (name, invite_code, owner_id)
  values (trim(company_name), new_invite_code, auth.uid())
  returning id into new_organization_id;

  insert into organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

create or replace function public.join_company(company_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if exists (select 1 from organization_members where user_id = auth.uid()) then
    raise exception 'Você já participa de uma empresa';
  end if;

  select id into target_id
  from organizations
  where invite_code = upper(trim(company_code));
  if target_id is null then raise exception 'Código de convite inválido'; end if;

  insert into organization_members (organization_id, user_id, role)
  values (target_id, auth.uid(), 'member');
  return target_id;
end;
$$;

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
    case member.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    member.joined_at;
end;
$$;

create or replace function public.remove_company_member(member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_organization_id uuid;
  caller_role text;
  target_role text;
begin
  select organization_id, role
  into caller_organization_id, caller_role
  from organization_members
  where user_id = auth.uid();

  if caller_role not in ('owner', 'admin') then
    raise exception 'Apenas administradores podem remover participantes';
  end if;
  if member_user_id = auth.uid() then
    raise exception 'O administrador não pode remover a própria conta';
  end if;

  select role into target_role
  from organization_members
  where organization_id = caller_organization_id
    and user_id = member_user_id;

  if target_role is null then
    raise exception 'Participante não encontrado';
  end if;
  if target_role = 'owner' then
    raise exception 'O proprietário da empresa não pode ser removido';
  end if;
  if caller_role = 'admin' and target_role = 'admin' then
    raise exception 'Somente o proprietário pode remover outro administrador';
  end if;

  delete from organization_members
  where organization_id = caller_organization_id
    and user_id = member_user_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.products enable row level security;

drop policy if exists "Membros visualizam a empresa" on public.organizations;
create policy "Membros visualizam a empresa"
on public.organizations for select to authenticated
using (public.is_organization_member(id));

drop policy if exists "Membros visualizam a equipe" on public.organization_members;
create policy "Membros visualizam a equipe"
on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "Usuários leem os próprios produtos" on public.products;
drop policy if exists "Usuários cadastram os próprios produtos" on public.products;
drop policy if exists "Usuários alteram os próprios produtos" on public.products;
drop policy if exists "Usuários removem os próprios produtos" on public.products;
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
    or public.is_organization_member(organization_id)
  )
);

create policy "Equipe altera produtos"
on public.products for update to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.is_organization_member(organization_id)
)
with check (
  (organization_id is null and user_id = auth.uid())
  or public.is_organization_member(organization_id)
);

create policy "Equipe remove produtos"
on public.products for delete to authenticated
using (
  (organization_id is null and user_id = auth.uid())
  or public.is_organization_member(organization_id)
);

grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
revoke all on function public.create_company(text) from public;
revoke all on function public.join_company(text) from public;
revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.create_company(text) to authenticated;
grant execute on function public.join_company(text) to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
revoke all on function public.list_company_members() from public;
revoke all on function public.remove_company_member(uuid) from public;
grant execute on function public.list_company_members() to authenticated;
grant execute on function public.remove_company_member(uuid) to authenticated;

create index if not exists organization_members_user_idx
on public.organization_members(user_id);
create index if not exists products_organization_expiry_idx
on public.products(organization_id, expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;
