# 📱 Checklist — Publicar o Prazo Certo na Google Play Store

> Passo a passo para publicar o **Prazo Certo v2.0.0** na Play Store.
> Status atual: APK `build32` pronto · conta do Google Play **a criar** (R$ 25 taxa única).

---

## 1️⃣ Conta do Google Play Developer

| # | Tarefa | Status | Obs. |
|---|--------|--------|------|
| 1.1 | Criar conta em [play.google.com/console](https://play.google.com/console) | ⬜ | Use o email do desenvolvedor (wbalestrim1@gmail.com) |
| 1.2 | Pagar a taxa de R$ 25 (única) | ⬜ | Cartão de crédito |
| 1.3 | Preencher dados da conta (nome, endereço, site) | ⬜ | |
| 1.4 | Criar usuário de testes / conta do desenvolvedor | ⬜ | |

> ⏳ Aprovação da conta: de 1 a 7 dias úteis.

---

## 2️⃣ Preparar o APK (assinatura)

| # | Tarefa | Status | Obs. |
|---|--------|--------|------|
| 2.1 | Gerar **App Signing Key** | ✅ | `debug.keystore` existe, mas para produção usar EAS |
| 2.2 | Build de produção com **EAS Build** | ⬜ | `eas build -p android --profile production` |
| 2.3 | Obter o **.aab** (Android App Bundle) | ⬜ | A Play Store exige `.aab`, não `.apk` |
| 2.4 | Testar o build antes de enviar | ⬜ | Instalar em 1-2 aparelhos |

> ⚠️ O APK `build32` serve para testes; para a Play Store você precisa de um **`.aab`** gerado com EAS (assinatura de produção). Eu posso te guiar no comando.

---

## 3️⃣ Assets da ficha da Play Store

| # | Asset | Requisito da Google | Status |
|---|-------|--------------------|--------|
| 3.1 | **Ícone do app** (512×512) | PNG, sem transparência | ⬜ gerar |
| 3.2 | **Ícone adaptativo** | Já configurado em `app.json` | ✅ |
| 3.3 | **Screenshots** (pelo menos 2) | 2 a 8, formato JPG/PNG 30-bit, min 320px | ⬜ capturar |
| 3.4 | **Banner de destaque** (1.024×500) | Opcional, mas recomendado | ⬜ |
| 3.5 | **Logotipo** (16:9, 512×512) | Opcional | ⬜ |

> 💡 Posso te ajudar a capturar screenshots ou gerar o ícone 512×512.

---

## 4️⃣ Informações da ficha

| # | Campo | Conteúdo sugerido | Status |
|---|-------|-------------------|--------|
| 4.1 | **Nome do app** | Prazo Certo | ✅ |
| 4.2 | **Descrição curta** (80 chars) | "Controle a validade do seu estoque" | ⬜ |
| 4.3 | **Descrição completa** | Use o texto do README-VENDA.md (adaptar) | ⬜ |
| 4.4 | **Categoria** | Ferramentas / Negócios | ⬜ |
| 4.5 | **Classificação etária** | Todos (sem conteúdo adulto) | ⬜ |
| 4.6 | **Idiomas** | Português (Brasil) | ✅ |
| 4.7 | **Link de suporte** | Precisa de um (GitHub Issues ou email) | ⬜ criar |
| 4.8 | **Política de privacidade** | **OBRIGATÓRIA** — app coleta email/nome/fotos | ⬜ criar |

---

## 5️⃣ Política de Privacidade (obrigatória)

O Prazo Certo coleta:
- Nome, email (conta)
- Fotos de produtos e avatar
- Dados de estoque

**Preciso criar um documento** com:
- O que coletamos
- Para que usamos
- Como o usuário pode excluir os dados
- Contato de suporte

> 💡 Posso gerar a política de privacidade para você. Pode hospedar em GitHub Pages (grátis) ou numa página simples.

---

## 6️⃣ Enviar o app

| # | Tarefa | Status |
|---|--------|--------|
| 6.1 | Criar app no Play Console | ⬜ |
| 6.2 | Enviar o `.aab` | ⬜ |
| 6.3 | Preencher ficha (seção 4) | ⬜ |
| 6.4 | Declarar classificação de conteúdo | ⬜ |
| 6.5 | **Teste interno** (fechado) | ⬜ — recomendo testar antes |
| 6.6 | Teste fechado (opcional) | ⬜ |
| 6.7 | **Produção** — publicar | ⬜ |

---

## 7️⃣ Testes antes de publicar

| # | Teste | Status |
|---|-------|--------|
| 7.1 | Login com email | ⬜ |
| 7.2 | Login Google | ⬜ |
| 7.3 | Cadastrar produto com câmera | ⬜ |
| 7.4 | Ler código de barras | ⬜ |
| 7.5 | Cadastro por IA (foto) | ⬜ |
| 7.6 | Notificações push | ⬜ |
| 7.7 | Baixa/reposição de estoque (PEPS) | ⬜ |
| 7.8 | Gerar PDF | ⬜ |
| 7.9 | Criar/entrar em grupo | ⬜ |
| 7.10 | Modo offline → reconectar | ⬜ |

---

## 💰 Custo total para publicar

| Item | Custo |
|------|-------|
| Conta Google Play Developer | R$ 25 (taxa única) |
| Supabase (plano Free) | R$ 0 |
| Google Gemini (IA) | R$ 0 (limite gratuito) |
| **Total** | **R$ 25** |

---

*Gerado em 2026-08-27 · Prazo Certo v2.0.0*