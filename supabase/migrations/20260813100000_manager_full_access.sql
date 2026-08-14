-- Concede ao gerente as permissões operacionais definidas pelo produto.

-- Gerente com acesso total ao grupo, exceto alterar/remover proprietário.
create or replace function public.can_manage_company()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(role in ('owner', 'admin', 'manager') and active, false)
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
  select coalesce(role in ('owner', 'admin', 'manager') and active, false)
  from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

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
  if new_role not in ('admin', 'manager', 'stockist', 'viewer') then raise exception 'Função inválida'; end if;

  select organization_id, role into caller_org, caller_role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if caller_role not in ('owner', 'admin', 'manager') then
    raise exception 'Sem permissão para alterar funções';
  end if;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'A função do proprietário não pode ser alterada'; end if;

  update public.organization_members
  set role = new_role
  where organization_id = caller_org and user_id = member_user_id;

  insert into public.audit_logs (user_id, organization_id, action, field_name, old_value, new_value)
  values (auth.uid(), caller_org, 'role_change', 'role', target_role, new_role);
end;
$$;

create or replace function public.set_member_active(member_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
  target_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if not public.can_manage_company() then raise exception 'Sem permissão para alterar participantes'; end if;

  select organization_id into caller_org
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'O proprietário não pode ser desativado'; end if;

  update public.organization_members
  set active = coalesce(p_active, true)
  where organization_id = caller_org and user_id = member_user_id;
end;
$$;

create or replace function public.remove_company_member(member_user_id uuid)
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

  select organization_id, role into caller_org, caller_role
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if caller_role not in ('owner', 'admin', 'manager') then raise exception 'Sem permissão para remover participantes'; end if;
  if member_user_id = auth.uid() then raise exception 'Você não pode remover a própria conta'; end if;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'O proprietário não pode ser removido'; end if;

  delete from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;
end;
$$;

grant execute on function public.can_manage_company() to authenticated;
grant execute on function public.can_delete_products() to authenticated;
grant execute on function public.update_member_role(uuid, text) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.remove_company_member(uuid) to authenticated;