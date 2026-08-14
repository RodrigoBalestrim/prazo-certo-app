-- Permite saída voluntária de grupo sem remover o proprietário.

-- Permite membro sair de um grupo sem poder remover o proprietário.
create or replace function public.leave_company(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;

  select role into current_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = auth.uid();

  if current_role is null then raise exception 'Você não participa deste grupo'; end if;
  if current_role = 'owner' then
    raise exception 'O proprietário não pode sair do grupo. Transfira a propriedade antes.';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_company(uuid) to authenticated;