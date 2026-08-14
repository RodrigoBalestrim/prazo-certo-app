-- Evita ambiguidade no RPC create_company: mantém apenas a versão completa.
drop function if exists public.create_company(text);