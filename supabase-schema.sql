create table if not exists public.products (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text,
  category text not null default 'Mercearia',
  barcode text not null default '',
  expires_at date not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

revoke all on table public.products from anon;
grant select, insert, update, delete on table public.products to authenticated;

drop policy if exists "Usuários leem os próprios produtos" on public.products;
create policy "Usuários leem os próprios produtos"
on public.products for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuários cadastram os próprios produtos" on public.products;
create policy "Usuários cadastram os próprios produtos"
on public.products for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuários alteram os próprios produtos" on public.products;
create policy "Usuários alteram os próprios produtos"
on public.products for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuários removem os próprios produtos" on public.products;
create policy "Usuários removem os próprios produtos"
on public.products for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists products_user_id_idx on public.products(user_id);
create index if not exists products_expiry_idx on public.products(user_id, expires_at);
