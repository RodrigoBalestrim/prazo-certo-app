# n8n — Prazo Certo

Automação local. Não altera o app mobile/web nem substitui Supabase Auth, RLS ou permissões.

## Iniciar

```powershell
Copy-Item .env.example .env
# Edite N8N_ENCRYPTION_KEY com um segredo aleatório de 32+ caracteres.
docker compose up -d
```

Abra `http://localhost:5678` e crie a conta inicial do n8n.

## Conectar Supabase

No n8n, crie uma credencial HTTP Header Auth com:

- `apikey`: chave `service_role`;
- `Authorization`: `Bearer <service_role>`.

Guarde essa credencial somente no n8n. Nunca no Expo, site, Git ou `.env` público.

## Fluxos recomendados

1. Diário, 08:00: consultar produtos com vencimento nos próximos 30 dias; enviar resumo ao responsável.
2. Diário, 08:15: consultar produtos vencidos; enviar alerta de retirada.
3. Segunda-feira, 08:00: gerar relatório semanal por grupo.
4. Diário, 03:00: backup lógico/validação de disponibilidade.

E-mail exige SMTP. WhatsApp exige provedor/API próprio, normalmente pago. Não ative ambos sem definir destinatários e consentimento.

## Segurança

- Porta limitada a `127.0.0.1`; não acessível pela internet.
- Para acesso externo, usar domínio HTTPS, proxy reverso e autenticação antes de alterar a porta.
- Use uma chave `service_role` exclusiva no n8n, se possível; revogue ao trocar servidor.
- Não exponha webhooks sem autenticação.