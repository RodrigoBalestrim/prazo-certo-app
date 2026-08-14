-- Registra aprovação de rebaixa no histórico de produtos.

alter table public.products
  add column if not exists rebaixa_aprovada boolean not null default false;

alter table public.products
  add column if not exists rebaixa_data timestamptz;