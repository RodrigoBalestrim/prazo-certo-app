-- Define entrada por convite com cargo inicial de visualizador.

-- Novo participante entra como visualizador; "member" não é um cargo válido.
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
  from public.organizations
  where invite_code = upper(trim(company_code));

  if target_id is null then raise exception 'Código de convite inválido'; end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (target_id, auth.uid(), 'viewer')
  on conflict (organization_id, user_id) do nothing;

  return target_id;
end;
$$;

grant execute on function public.join_company(text) to authenticated;