# n8n — Prazo Certo

Automação local. Não altera o app mobile/web nem substitui Supabase Auth, RLS ou permissões.

## Iniciar

```powershell
Copy-Item .env.example .env
# Edite N8N_ENCRYPTION_KEY com um segredo aleatório de 32+ caracteres.
docker compose up -d
```

Abra `http://localhost:5678` e crie a conta inicial do n8n.

## Conectar alertas

Use a Edge Function `expiry-alerts`. Ela consulta produtos e destinatários no servidor; o n8n recebe apenas os alertas prontos para envio.

A credencial `Custom Auth` usa o segredo local `n8n/.expiry-alerts-secret`. Nunca use `service_role`, `sb_secret` ou outra chave administrativa do Supabase no n8n.

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
## Fluxo de alerta diário

Importe `workflows/alerta-diario-validade.json` em **Workflows > Import from File**.

O fluxo roda todos os dias às 08:00 e executa:

1. `Schedule Trigger` — inicia a rotina diária;
2. `HTTP Request` — chama a Edge Function `expiry-alerts`;
3. `Split Out` — separa um alerta por destinatário;
4. `Send an Email` — envia para `owner`, `admin` e `manager` do grupo.

Antes de publicar, crie duas credenciais no n8n:

- **Custom Auth** para `expiry-alerts`:

  ```json
  {
    "headers": {
      "x-n8n-alerts-secret": "SEU_SEGREDO"
    }
  }
  ```

  O segredo fica no arquivo local `n8n/.expiry-alerts-secret`. Nunca publique esse arquivo.

- **SMTP** do Gmail: host `smtp.gmail.com`, porta `465`, `SSL/TLS` ligado e senha de app do Gmail.

No nó `Send an Email`, troque `SEU_EMAIL_REMETENTE` pelo Gmail usado no SMTP. Os campos de destinatário, assunto e HTML devem ficar assim, sem `=` inicial:

```text
{{ $json.to }}
{{ $json.subject }}
{{ $json.html }}
```

Publique o fluxo somente após executar um teste manual e confirmar os destinatários.
