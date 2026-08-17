# Prazo Certo Alerts API

API Node.js sem estado para alertas de validade. Mantém o Supabase como fonte de autenticação, RLS e PostgreSQL.

## Segurança

- exige `Authorization: Bearer <access-token-do-Supabase>`;
- valida o token com `supabase.auth.getUser()`;
- usa o `user.id` extraído do token, nunca um ID enviado pelo cliente;
- consulta somente produtos pessoais daquele usuário; RLS permanece ativa;
- aceita apenas `days` inteiro entre 1 e 90;
- CORS somente para origens declaradas em `ALLOWED_ORIGINS`;
- usa apenas chave `anon` pública; nunca coloque `SUPABASE_SERVICE_ROLE_KEY` aqui.

## Rodar

```bash
cd services/alerts-api
npm install
cp .env.example .env
node --env-file=.env server.js
```

## Endpoint

```http
GET /alerts?days=30
Authorization: Bearer <access-token-do-Supabase>
```

Retorna alertas de produtos pessoais não arquivados, ordenados por validade. Açougue e Frios/PAS entram até 15 dias antes; demais categorias, até 30 dias antes.

```bash
npm test
npm run check
```

`ponytail:` esta primeira versão cobre somente lista pessoal; adicionar organizações, rate limit distribuído e deploy quando o app passar a consumir a API.
