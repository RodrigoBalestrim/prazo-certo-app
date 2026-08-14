-- Permite que uma conta participe de vários grupos.

-- Permite participação em mais de um grupo de lista.
-- Remove a restrição unique(user_id) e libera criar/entrar em vários grupos.
alter table public.organization_members drop constraint if exists organization_members_user_id_key;

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

  select id into target_id
  from organizations
  where invite_code = upper(trim(company_code));
  if target_id is null then raise exception 'Código de convite inválido'; end if;

  insert into organization_members (organization_id, user_id, role)
  values (target_id, auth.uid(), 'member');
  return target_id;
end;
$$;