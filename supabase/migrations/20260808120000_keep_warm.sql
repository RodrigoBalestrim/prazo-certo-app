-- Mantém a API de remoção de fundo (Render free) sempre acordada.
-- Requer pg_cron habilitado em Database → Extensions no dashboard do Supabase.
-- O Render free dorme após ~15 min sem tráfego; este ping a cada 10 min
-- evita o cold start (que causava erro/atraso na remoção de fundo).

create extension if not exists pg_net with schema extensions;

-- Agenda o ping a cada 10 min (só executa se o cron já estiver habilitado).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'prazo-certo-keep-warm',
      '*/10 * * * *',
      'select net.http_get(''https://prazo-certo-app.onrender.com/'')'
    );
  end if;
end $$;
