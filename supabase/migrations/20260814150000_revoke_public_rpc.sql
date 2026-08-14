-- Reduz execução pública de RPCs e mantém somente concessões necessárias.

-- SECURITY DEFINER nunca deve ficar executável por PUBLIC/anon.
revoke all on function public.can_add_products() from public;
revoke all on function public.can_add_products(uuid) from public;
revoke all on function public.can_edit_products() from public;
revoke all on function public.can_edit_products(uuid) from public;
revoke all on function public.can_delete_products() from public;
revoke all on function public.can_delete_products(uuid) from public;
revoke all on function public.can_manage_company() from public;
revoke all on function public.create_company(text,text,text,text) from public;
revoke all on function public.get_my_role() from public;
revoke all on function public.insert_audit_log(text,text,text,text,text,text) from public;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.join_company(text) from public;
revoke all on function public.leave_company(uuid) from public;
revoke all on function public.list_company_members() from public;
revoke all on function public.log_product_audit() from public;
revoke all on function public.remove_company_logo() from public;
revoke all on function public.remove_company_member(uuid) from public;
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.set_member_active(uuid,boolean) from public;
revoke all on function public.update_company(text,text,text,text) from public;
revoke all on function public.update_member_role(uuid,text) from public;

grant execute on function public.can_add_products() to authenticated;
grant execute on function public.can_add_products(uuid) to authenticated;
grant execute on function public.can_edit_products() to authenticated;
grant execute on function public.can_edit_products(uuid) to authenticated;
grant execute on function public.can_delete_products() to authenticated;
grant execute on function public.can_delete_products(uuid) to authenticated;
grant execute on function public.can_manage_company() to authenticated;
grant execute on function public.create_company(text,text,text,text) to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.join_company(text) to authenticated;
grant execute on function public.leave_company(uuid) to authenticated;
grant execute on function public.list_company_members() to authenticated;
grant execute on function public.remove_company_logo() to authenticated;
grant execute on function public.remove_company_member(uuid) to authenticated;
grant execute on function public.set_member_active(uuid,boolean) to authenticated;
grant execute on function public.update_company(text,text,text,text) to authenticated;
grant execute on function public.update_member_role(uuid,text) to authenticated;