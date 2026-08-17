-- Dashboard de perda por vencimento.
--
-- Adiciona preço ao produto (base do cálculo em R$) e uma função que soma a
-- perda estimada a partir dos LOTES: produtos vencidos ainda em estoque
-- (qtd > 0) contam como perda imediata; os que vencem no período contam como
-- "perda potencial" (ação: rebaixa/retira).
--
-- Compatibilidade: campo novo é opcional (null = preço não informado, não
-- entra no cálculo de R$).

-- 1) Preço em centavos (evita float) -----------------------------------------
alter table public.products
  add column if not exists preco_cents integer
  check (preco_cents is null or preco_cents >= 0);

-- 2) Perda estimada ----------------------------------------------------------
-- Retorna a soma dos lotes vencidos (perda real) e dos que vencem até
-- p_dias (perda potencial), em centavos, para o escopo do usuário/grupo.
-- Escopo segue a mesma regra de leitura de produtos (pessoal ou grupo).
create or replace function public.perda_estimada(
  p_dias integer default 7
)
returns table (
  vencidos_centavos bigint,
  vencendo_centavos bigint,
  vencidos_itens bigint,
  vencendo_itens bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_data_base date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return query
  select
    coalesce(sum(case when l.expires_at < v_data_base then l.quantity * coalesce(p.preco_cents, 0) else 0 end), 0),
    coalesce(sum(case when l.expires_at >= v_data_base and l.expires_at <= v_data_base + p_dias then l.quantity * coalesce(p.preco_cents, 0) else 0 end), 0),
    count(*) filter (where l.expires_at < v_data_base),
    count(*) filter (where l.expires_at >= v_data_base and l.expires_at <= v_data_base + p_dias)
  from public.lots l
  join public.products p on p.id = l.product_id
  where l.quantity > 0
    and (
      (p.organization_id is null and p.user_id = auth.uid())
      or public.is_organization_member(p.organization_id)
    );
end;
$$;

-- 3) Concessões --------------------------------------------------------------
grant execute on function public.perda_estimada(integer) to authenticated;
revoke all on function public.perda_estimada(integer) from public;
