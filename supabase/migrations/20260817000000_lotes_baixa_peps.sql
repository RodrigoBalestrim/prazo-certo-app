-- Lotes de estoque + baixa PEPS (primeiro a vencer, primeiro a sair).
--
-- Motivação: hoje cada produto tem UMA quantidade e UMA validade. Para o
-- caixa/estoque do comerciante, o que se identifica é o LOTE (recebimento +
-- validade). Sem lote, a baixa de estoque não sabe QUAL unidade saiu (a que
-- vence amanhã deve sair primeiro). Este lote introduz:
--   lots               — unidades de um produto com validade e quantidade
--   stock_movements    — histórico de baixa/reposição (auditável)
--   função baixar_estoque() — baixa respeitando PEPS e bloqueando vencido
--
-- Compatibilidade: produtos existentes viram seu primeiro lote (id = produto).
-- O app continua lendo products normalmente; o volume por lote é a nova fonte.

-- pgcrypto p/ gen_random_uuid() (presente no Supabase por padrão).
create extension if not exists pgcrypto;

-- 1) Lotes -------------------------------------------------------------------
create table if not exists public.lots (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  received_at date not null default (now() at time zone 'America/Sao_Paulo')::date,
  expires_at date not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  -- um mesmo recebimento+validade identifica o lote; evita duplicar por engano
  unique (product_id, received_at, expires_at)
);

alter table public.lots enable row level security;

-- 2) Migração dos produtos existentes para o primeiro lote ------------------
insert into public.lots (id, product_id, user_id, organization_id, received_at, expires_at, quantity)
select
  'mig-' || products.id,   -- id derivado do produto original
  products.id,
  products.user_id,
  products.organization_id,
  (now() at time zone 'America/Sao_Paulo')::date,
  products.expires_at,
  products.quantity
from public.products
on conflict do nothing;

-- 3) Histórico de movimentação de estoque ------------------------------------
create table if not exists public.stock_movements (
  id text primary key,
  lot_id text not null references public.lots(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('sale', 'stock_in', 'adjust')),
  quantity integer not null check (quantity <> 0),
  created_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;

-- 4) Função de baixa PEPS -----------------------------------------------------
-- Baixa `quantity` unidades de um produto, do lote que vence PRIMEIRO.
-- Regras:
--  - lotes vencidos NÃO saem (bloqueia venda de vencido);
--  - se um lote não tem saldo suficiente, continua no próximo (PEPS);
--  - lança exceção se não houver saldo suficiente no total;
--  - registra cada movimentação (stock_movements) por lote.
create or replace function public.baixar_estoque(
  p_product_id text,
  p_quantity integer,
  p_type text default 'sale'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote record;
  v_restante integer := p_quantity;
  v_baixado integer := 0;
  v_saiu integer;
  v_total integer;
begin
  if p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  -- valida que o usuário tem acesso ao produto (mesma regra de leitura)
  if not exists (
    select 1 from public.products
    where products.id = p_product_id
      and (
        (products.organization_id is null and products.user_id = auth.uid())
        or public.is_organization_member(products.organization_id)
      )
  ) then
    raise exception 'Produto não encontrado';
  end if;

  -- verifica saldo total válido (ignora vencidos)
  select coalesce(sum(l.quantity), 0) into v_total
  from public.lots l
  where l.product_id = p_product_id
    and l.quantity > 0
    and l.expires_at >= (now() at time zone 'America/Sao_Paulo')::date;

  if v_total < p_quantity then
    raise exception 'Estoque insuficiente: disponível % para venda', v_total;
  end if;

  -- PEPS: processa do lote que vence primeiro até zerar a necessidade
  for v_lote in
    select id from public.lots
    where product_id = p_product_id
      and quantity > 0
      and expires_at >= (now() at time zone 'America/Sao_Paulo')::date
    order by expires_at asc, received_at asc
  loop
    exit when v_restante <= 0;

    -- quantos saem deste lote (no máximo o restante que falta)
    v_saiu := least(v_restante, (select quantity from public.lots where id = v_lote.id));

    update public.lots
    set quantity = quantity - v_saiu
    where id = v_lote.id;

    v_restante := v_restante - v_saiu;
    v_baixado := v_baixado + v_saiu;

    -- histórico
    insert into public.stock_movements (id, lot_id, product_id, user_id, type, quantity)
    values (
      gen_random_uuid()::text,
      v_lote.id,
      p_product_id,
      auth.uid(),
      p_type,
      -v_saiu
    );
  end loop;

  -- mantém products.quantity espelhando o saldo total válido (para o app
  -- ler sem join; a fonte real de saldo por lote é lots)
  update public.products
  set quantity = coalesce((
    select sum(l.quantity) from public.lots l
    where l.product_id = p_product_id
  ), 0)
  where id = p_product_id;

  return v_baixado;
end;
$$;

-- Reposição: adiciona um NOVO lote (ou soma num existente com mesmo
-- recebimento+validade). NUNCA altera o lote antigo — PEPS depende disso.
create or replace function public.repor_estoque(
  p_product_id text,
  p_quantity integer,
  p_expires_at date,
  p_received_at date default (now() at time zone 'America/Sao_Paulo')::date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote_id text;
begin
  if p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  -- valida acesso (mesma regra de leitura do produto)
  if not exists (
    select 1 from public.products
    where products.id = p_product_id
      and (
        (products.organization_id is null and products.user_id = auth.uid())
        or public.is_organization_member(products.organization_id)
      )
  ) then
    raise exception 'Produto não encontrado';
  end if;

  -- se já existe lote com mesmo recebimento+validade, soma a quantidade
  select id into v_lote_id
  from public.lots
  where product_id = p_product_id
    and received_at = p_received_at
    and expires_at = p_expires_at;

  if v_lote_id is not null then
    update public.lots
    set quantity = quantity + p_quantity
    where id = v_lote_id;
  else
    insert into public.lots (id, product_id, user_id, organization_id, received_at, expires_at, quantity)
    values (
      gen_random_uuid()::text,
      p_product_id,
      auth.uid(),
      (select organization_id from public.products where id = p_product_id),
      p_received_at,
      p_expires_at,
      p_quantity
    )
    returning id into v_lote_id;
  end if;

  -- histórico
  insert into public.stock_movements (id, lot_id, product_id, user_id, type, quantity)
  values (gen_random_uuid()::text, v_lote_id, p_product_id, auth.uid(), 'stock_in', p_quantity);

  -- espelha o saldo total no produto
  update public.products
  set quantity = coalesce((
    select sum(l.quantity) from public.lots l
    where l.product_id = p_product_id
  ), 0)
  where id = p_product_id;

  return p_quantity;
end;
$$;

-- 5) Permissões --------------------------------------------------------------
-- RLS de lotes: mesma regra do produto (pessoal ou membro do grupo).
drop policy if exists "Lote do produto acessível" on public.lots;
create policy "Lote do produto acessível"
on public.lots for select
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
);

drop policy if exists "Insere lote com produto acessível" on public.lots;
create policy "Insere lote com produto acessível"
on public.lots for insert
to authenticated
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

-- Atualização/remoção de lote: apenas via funções RPC (baixar_estoque) —
-- o app não altera lote direto pela tabela. Mantemos apenas select/insert.
drop policy if exists "Sem update/delete direto em lotes" on public.lots;

-- Histórico de movimentações: leitura restrita ao dono/grupo.
drop policy if exists "Movimento acessível" on public.stock_movements;
create policy "Movimento acessível"
on public.stock_movements for select
to authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = stock_movements.product_id
      and (
        (p.organization_id is null and p.user_id = auth.uid())
        or public.is_organization_member(p.organization_id)
      )
  )
);

-- Histórico é escrito APENAS pela função baixar_estoque (via insert direto
-- dentro dela). Para não abrir inserção arbitrária, a policy de insert exige
-- que o movimento seja do próprio usuário autenticado — a função é security
-- invoker, então quem chama tem que respeitar a mesma regra.
drop policy if exists "Insere movimento do próprio usuário" on public.stock_movements;
create policy "Insere movimento do próprio usuário"
on public.stock_movements for insert
to authenticated
with check (user_id = auth.uid());

-- índices úteis
create index if not exists lots_product_expiry_idx on public.lots(product_id, expires_at);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id, created_at desc);

-- 6) Concessões --------------------------------------------------------------
-- As funções são security invoker: quem chama precisa de EXECUTE, e
-- internamente leem products/lots e inserem em stock_movements conforme as
-- policies acima.
grant execute on function public.baixar_estoque(text, integer, text) to authenticated;
revoke all on function public.baixar_estoque(text, integer, text) from public;

grant execute on function public.repor_estoque(text, integer, date, date) to authenticated;
revoke all on function public.repor_estoque(text, integer, date, date) from public;
