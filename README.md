# Prazo Certo

Aplicativo mobile criado para controlar a validade de produtos, reduzir perdas
e ajudar mercados, empresas e usuários domésticos a agir antes do vencimento.

## Demonstração web

- **Acesse o aplicativo:** [prazo-certo.expo.app](https://prazo-certo.expo.app)
- Na tela inicial, selecione **Ver demonstração** para conhecer os recursos sem criar uma conta.

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
