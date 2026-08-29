# Prazo Certo

![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Expo](https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![React Native + Expo](https://img.shields.io/badge/Android%20%26%20Web-3DDC84?style=flat-square&logo=android&logoColor=white) ![Open Source](https://img.shields.io/badge/Open_Source-%E2%9D%A4%EF%B8%8F-ff69b4?style=flat-square)

Aplicativo mobile criado para controlar a validade de produtos, reduzir perdas
e ajudar mercados, empresas e usuários domésticos a agir antes do vencimento.

## Página do projeto

- **Acesse o Prazo Certo:** [rodrigobalestrim.github.io/prazo-certo-app](https://rodrigobalestrim.github.io/prazo-certo-app/)
- Na tela inicial, selecione **Entrar para testar** para conhecer os recursos sem criar uma conta.

## Principais recursos

- leitura de códigos EAN-8, EAN-13, UPC e Code 128 pela câmera;
- busca automática do nome e da foto do produto em bases gratuitas;
- cadastro manual de produto, validade, quantidade e categoria;
- alertas antecipados conforme o setor;
- avisos para pedir rebaixa e retirar produtos vencidos da seção;
- edição, seleção e remoção de vários produtos;
- criação de PDF por categoria ou por produtos próximos do vencimento;
- PDF econômico em preto e branco, preparado para impressão;
- login com e-mail, senha ou conta Google;
- sincronização online com Supabase;
- lista pessoal privada;
- grupos de empresa com lista compartilhada entre funcionários;
- convite por código e gerenciamento de participantes pelo administrador.

## Categorias e avisos

- **Açougue e Frios/PAS:** alerta com 15 dias de antecedência;
- **Mercearia, Bazar, Saudáveis e FLV:** alerta com 1 mês de antecedência;
- todos os setores mantêm os avisos próximos à data de vencimento.

## Tecnologias

- Expo e React Native;
- TypeScript;
- Expo Router;
- Supabase Auth e PostgreSQL;
- Expo Camera, Notifications, Print e Sharing.

## Executar o projeto

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Para abrir a versão de navegador:

```bash
npm run web
```

## Configuração do Supabase

Crie um arquivo `.env` local com as variáveis públicas do projeto:

```env
EXPO_PUBLIC_SUPABASE_URL=seu_endereco
EXPO_PUBLIC_SUPABASE_KEY=sua_chave_publica
```

Depois execute, no SQL Editor do Supabase:

1. `supabase-schema.sql`;
2. `supabase-company-schema.sql`.

O arquivo `.env` não é enviado ao GitHub.

## Observação

A data de validade normalmente não faz parte do código de barras tradicional.
Por isso, o aplicativo identifica o produto pelo código, mas a validade deve ser
informada durante o cadastro.

## Melhorias com IA (nova versão)

Implementadas de acordo com o documento `Melhorias_Prazo_Certo_IA.txt`:

- **Leitor de código de barras inteligente**: ao escanear, o app primeiro consulta a lista (evita duplicidade), depois o catálogo compartilhado e as bases gratuitas. Se nada for encontrado, oferece cadastro por foto com IA.
- **Cadastro inteligente por foto**: a IA identifica nome, marca, categoria, descrição de estoque e tipo de embalagem. O usuário informa somente **validade** e **quantidade**.
- **Remoção de fundo**: gera `foto_sem_fundo` (PNG transparente) e mantém a `foto_original` no cadastro.
- **Comparação de duplicidade**: a IA compara com produtos já cadastrados e avisa quando há alta compatibilidade (ex.: 98%), evitando cadastros repetidos.
- **Auditoria do sistema**: toda criação, alteração e remoção de produto fica registrada (usuário, data, campo, antes/depois). A tabela `audit_logs` guarda o histórico.
- **Histórico de imagens**: tabela `product_image_history` registra foto original, foto processada, data e usuário responsável.
- **Controle de permissões**: papéis `owner`, `admin`, `manager` (gerente), `stockist` (estoquista) e `viewer` (visualizador). O visualizador só consulta; o estoquista cadastra e atualiza; o gerente corrige; administrador gerencia usuários e exclui.

### Passos para ativar

1. Execute no SQL Editor do Supabase (nesta ordem):
   - `supabase-schema.sql`
   - `supabase-company-schema.sql`
   - `supabase/migrations/20260807090000_ai_improvements.sql`
2. Crie o bucket público `product-cutouts` (o script já cria) e confirme os buckets `product-images` e `avatars`.
3. Implante a Edge Function de IA:

   ```bash
   supabase functions deploy analyze-product
   ```

4. Configure as variáveis de ambiente da função no painel do Supabase (Edge Functions > analyze-product > Secrets):
   - `GEMINI_API_KEY` — chave gratuita do Google AI Studio (provedor padrão `gemini`)
   - `AI_PROVIDER` — opcional (`gemini` por padrão; use `openai` se preferir)
   - `GEMINI_MODEL` — opcional (padrão: `gemini-flash-latest`)
   - `OPENAI_API_KEY` — opcional, usada apenas se `AI_PROVIDER=openai`
   - `BG_API_URL` — URL da sua API gratuita de remoção de fundo (recomendado, sem custo)
   - `REMOVE_BG_API_KEY` — chave do remove.bg (alternativa; 50 imagens/mês grátis)

### Remoção de fundo gratuita (100% sem custo)

A Edge Function tenta, nesta ordem: **API auto-hospedada gratuita (`BG_API_URL`)** → **remove.bg** → **Gemini (modelo de imagem)**.

Para hospedar a API gratuita de remoção de fundo (projeto [Background-Removal-API](https://github.com/gaelos7k/Background-Removal-API), Python + FastAPI + U²-Net):

**Opção A — Hugging Face Spaces (recomendada, 16 GB de RAM grátis):**
1. Crie uma conta em huggingface.co e um novo Space (SDK: Docker/Python, CPU).
2. Faça o upload do repositório do projeto (com Git LFS para o modelo `u2net.pth`).
3. Instale as dependências (`pip install -r requirements.txt` — use `--extra-index-url https://download.pytorch.org/whl/cpu`).
4. Rode `cd backend && python main.py` (a porta é lida de `PORT`).
5. O Space fica em `https://SEU-USUARIO-BG-API.hf.space` → use como `BG_API_URL`.

**Opção B — Render (plano gratuito):**
1. Novo *Web Service* apontando para o repositório do projeto.
2. Build: `pip install -r requirements.txt`; Start: `cd backend && python main.py`.
3. O serviço fica em `https://SEU-SERVICO.onrender.com` → use como `BG_API_URL`.

> ⚠️ O modelo U²-Net precisa de ~2–4 GB de RAM. No Render gratuito (512 MB) pode falhar; prefira o Hugging Face Spaces.

### Níveis de permissão

| Papel        | Consultar | Cadastrar entrada | Corrigir produto | Excluir | Gerenciar equipe |
| ------------ | :-------: | :---------------: | :--------------: | :-----: | :--------------: |
| Proprietário | ✅        | ✅                | ✅               | ✅      | ✅               |
| Administrador| ✅        | ✅                | ✅               | ✅      | ✅               |
| Gerente      | ✅        | ✅                | ✅               | ❌      | ❌               |
| Estoquista   | ✅        | ✅                | ✅               | ❌      | ❌               |
| Visualizador | ✅        | ❌                | ❌               | ❌      | ❌               |

> Nota: usuários de lista pessoal (sem empresa) mantêm acesso total, como antes.