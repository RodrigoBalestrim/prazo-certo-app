-- Correção de bugs de segurança e RLS (auditoria 2026-08-27).
--
-- Aplicar via `supabase db push` ou no SQL Editor (após as migrations anteriores).
--
-- Corrige:
--   🔴 1. PEPS quebrado por RLS — lotes sem política FOR UPDATE
--   🔴 2. Política RLS órfã "Equipe altera produtos" (escalada entre grupos)
--   🟡 3. Membro desativado (active=false) mantém leitura total
--   🟡 4. Autopromoção manager→admin em update_member_role
--   🟡 5. create_company bloqueia a criação de 2º grupo

-- ============================================================
-- 🔴 1) PEPS: política FOR UPDATE/INSERT em lots
-- ============================================================
-- baixar_estoque/repor_estoque são security invoker e fazem UPDATE/INSERT
-- em public.lots. Sem política de escrita, toda chamada quebra com
-- "new row violates row-level security policy".
drop policy if exists "Atualiza lote com produto acessível" on public.lots;
create policy "Atualiza lote com produto acessível"
on public.lots for update
to authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = lots.product_id
      and (
        (p.organization_id is null and p.user_id = auth.uid())
        or public.is_organization_member(p.organization_id)
      )
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = lots.product_id
      and (
        (p.organization_id is null and p.user_id = auth.uid())
        or public.is_organization_member(p.organization_id)
      )
  )
);

-- ============================================================
-- 🔴 2) Remover política órfã de UPDATE em products
-- ============================================================
-- A migration 20260814130000 dropou "Equipe edita produtos" (nome errado);
-- a política antiga "Equipe altera produtos" (com can_edit_products() no-arg,
-- limit 1 e grupo arbitrário) ficou viva e permite escalada entre grupos.
drop policy if exists "Equipe altera produtos" on public.products;

-- ============================================================
-- 🟡 3) Membro desativado não tem mais acesso de leitura
-- ============================================================
-- is_organization_member agora exige active = true. Isso faz o RLS
-- (products, lots, stock_movements, audit_logs, organizations, membros)
-- parar de vazar dados para quem foi desativado.
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
      and active
  );
$$;

-- ============================================================
-- 🟡 4) update_member_role: só o dono gerencia administradores
-- ============================================================
-- A versão da migration 13100000 permitiu manager se autopromover a admin
-- e remover a proteção "só dono gerencia admin". Restauramos a regra:
--   - owner pode tocar em qualquer cargo (exceto outro owner);
--   - admin/manager NÃO podem criar, promover ou demover admins.
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
    and active
  limit 1;

  if caller_role is null then raise exception 'Você não participa de uma empresa'; end if;
  if caller_role not in ('owner', 'admin', 'manager') then
    raise exception 'Sem permissão para alterar funções';
  end if;

  select role into target_role
  from public.organization_members
  where organization_id = caller_org and user_id = member_user_id;

  if target_role is null then raise exception 'Participante não encontrado'; end if;
  if target_role = 'owner' then raise exception 'A função do proprietário não pode ser alterada'; end if;

  -- Somente o dono cria/promove/demove administradores.
  if new_role = 'admin' or target_role = 'admin' then
    if caller_role <> 'owner' then
      raise exception 'Somente o proprietário pode gerenciar administradores';
    end if;
  end if;

  -- Só o dono pode alterar o cargo de outro admin/manager? Não: owner sempre
  -- pode; admin/manager podem gerenciar stockist/viewer/manager entre si,
  -- desde que não envolvam admins (regra acima).

  update public.organization_members
  set role = new_role
  where organization_id = caller_org and user_id = member_user_id;

  insert into public.audit_logs (user_id, organization_id, action, field_name, old_value, new_value)
  values (auth.uid(), caller_org, 'role_change', 'role', target_role, new_role);
end;
$$;

-- ============================================================
-- 🟡 5) create_company: permitir criar 2º grupo (multi-grupo)
-- ============================================================
-- A guarda "Você já participa de uma empresa" contradiz a feature de
-- múltiplos grupos (20260812000000). Removemos a checagem e inserimos
-- o novo grupo como owner.
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

-- ============================================================
-- 6) Remover overloads antigos de create_company
-- ============================================================
-- A migration 20260812000000 criou create_company(company_name text)
-- como versão de 1 argumento. A versão de 4 argumentos (da migration
-- 20260807120000) é a usada pelo app. Removemos a de 1 argumento para
-- evitar ambiguidade de resolução de função.
drop function if exists public.create_company(company_name text);

-- ============================================================
-- Notas / pendências (não alteradas nesta migration)
-- ============================================================
-- 1. products.quantity (espelho) soma lotes vencidos: deixado como está para
--    não alterar a exibição; revisar junto do produto (bug 🟡 documentado).
-- 2. Funções definer com limit 1 sem order by: exige mudança de assinatura
--    no app (passar organization_id); ficou documentado como pendente.
-- 3. Rate limiting e CORS nas Edge Functions: requer mudança em código TS.
