-- Evita que cargo de um grupo autorize ação em outro grupo.
alter table public.products enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create or replace function public.set_member_active(member_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare caller_org uuid; caller_role text; target_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  select organization_id, role into caller_org, caller_role from public.organization_members where user_id = auth.uid() and active limit 1;
  if caller_role not in ('owner','admin','manager') then raise exception 'Sem permissão para alterar participantes'; end if;
  select role into target_role from public.organization_members where organization_id = caller_org and user_id = member_user_id;
  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'O proprietário não pode ser desativado'; end if;
  update public.organization_members set active = coalesce(p_active,true) where organization_id = caller_org and user_id = member_user_id;
end; $$;

create or replace function public.update_company(p_group_name text default null,p_company_name text default null,p_sector text default null,p_logo_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare caller_org uuid; caller_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  select organization_id, role into caller_org, caller_role from public.organization_members where user_id = auth.uid() and active limit 1;
  if caller_role not in ('owner','admin','manager') then raise exception 'Sem permissão para alterar a empresa'; end if;
  update public.organizations set name=coalesce(nullif(trim(p_group_name),''),name),company_name=coalesce(nullif(trim(p_company_name),''),company_name),sector=coalesce(nullif(trim(p_sector),''),sector),company_logo_url=coalesce(nullif(trim(p_logo_url),''),company_logo_url),updated_at=now() where id=caller_org;
end; $$;

create or replace function public.remove_company_logo()
returns void language plpgsql security definer set search_path = public as $$
declare caller_org uuid; caller_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  select organization_id, role into caller_org, caller_role from public.organization_members where user_id = auth.uid() and active limit 1;
  if caller_role not in ('owner','admin','manager') then raise exception 'Sem permissão para remover a logo'; end if;
  update public.organizations set company_logo_url=null,updated_at=now() where id=caller_org;
end; $$;