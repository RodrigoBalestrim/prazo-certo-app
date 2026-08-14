-- Habilita rotina de manutenção para a automação keep-warm.

-- Ativa o keep-warm (ping a cada 10 min) para a API de remoção de fundo.
select cron.schedule(
  'prazo-certo-keep-warm',
  '*/10 * * * *',
  'select net.http_get(''https://prazo-certo-app.onrender.com/'')'
);
