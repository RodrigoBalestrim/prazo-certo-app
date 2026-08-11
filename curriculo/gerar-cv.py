# -*- coding: utf-8 -*-
"""Gera o currículo da vaga Dev React/React Native (Prazo Certo)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, KeepTogether,
)

OUT = "curriculo/vagas/Curriculo-Rodrigo-Balestrim-Dev-React-ReactNative.pdf"

VERDE = HexColor("#1E7A55")
CINZA = HexColor("#555555")

style_name = ParagraphStyle("nome", fontName="Helvetica-Bold", fontSize=16, leading=20, alignment=1, spaceAfter=2)
style_sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=11, leading=14, alignment=1, textColor=CINZA, spaceAfter=4)
style_contato = ParagraphStyle("contato", fontName="Helvetica", fontSize=9, leading=12, alignment=1, spaceAfter=1)
style_sec = ParagraphStyle("sec", fontName="Helvetica-Bold", fontSize=11, leading=13, textColor=VERDE, spaceBefore=10, spaceAfter=3)
style_body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=12.5, spaceAfter=2)
style_bullet = ParagraphStyle("bullet", parent=style_body, leftIndent=10, bulletIndent=0, spaceAfter=2)
style_proj = ParagraphStyle("proj", fontName="Helvetica-Bold", fontSize=10, leading=13, spaceBefore=6, spaceAfter=1)
style_stack = ParagraphStyle("stack", fontName="Helvetica", fontSize=9, leading=11.5, textColor=CINZA, spaceAfter=2)

def B(texto):
    return Paragraph(f"\u2022 {texto}", style_bullet)

doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=14*mm, rightMargin=14*mm, topMargin=12*mm, bottomMargin=12*mm,
    title="Curriculo Rodrigo Washington Balestrim - Dev React/React Native",
    author="Rodrigo Washington Balestrim",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="p", frames=[frame])])

historia = []
historia.append(Paragraph("RODRIGO WASHINGTON BALESTRIM", style_name))
historia.append(Paragraph("Desenvolvedor Front-End e Mobile \u2014 React \u00b7 React Native \u00b7 TypeScript", style_sub))
historia.append(Paragraph("Mandagua\u00e7u, Paran\u00e1 \u2014 Brasil | wbalestrim1@gmail.com | +55 44 99707-5042", style_contato))
historia.append(Paragraph("github.com/RodrigoBalestrim | linkedin.com/in/rodrigo-balestrim-9a68b3212 | prazo-certo-landing.vercel.app", style_contato))

historia.append(Paragraph("RESUMO PROFISSIONAL", style_sec))
historia.append(Paragraph(
    "Desenvolvedor Front-End com experi\u00eancia pr\u00e1tica em React, React Native e TypeScript, "
    "construindo aplica\u00e7\u00f5es web e mobile completas \u2014 do design \u00e0 publica\u00e7\u00e3o. Autor do Prazo Certo, "
    "aplicativo multiplataforma (Android e Web) com banco de dados relacional PostgreSQL "
    "(Supabase), autentica\u00e7\u00e3o, controle de permiss\u00f5es por papel e integra\u00e7\u00f5es com IA generativa. Forte "
    "senso de design: interfaces responsivas, hierarquia visual clara e componentes reutiliz\u00e1veis, "
    "trabalhando com Figma como ponte entre design e c\u00f3digo. Perfil organizado, comunicativo e com "
    "aprendizado cont\u00ednuo.", style_body))

historia.append(Paragraph("HABILIDADES T\u00c9CNICAS", style_sec))
historia.append(B("Front-end: React (componentes funcionais, hooks), JavaScript (ES6+), HTML5, CSS3, Design Responsivo, Design System (componentes reutiliz\u00e1veis)"))
historia.append(B("Mobile: React Native, Expo, Expo Router"))
historia.append(B("Dados: PostgreSQL (via Supabase), APIs REST"))
historia.append(B("Ferramentas: Git, GitHub, Figma, Vercel, VS Code"))
historia.append(B("Qualidade: Valida\u00e7\u00f5es e testes de funcionalidades em projetos pr\u00f3prios, boas pr\u00e1ticas de c\u00f3digo"))
historia.append(B("Idiomas: Portugu\u00eas (nativo), Ingl\u00eas (t\u00e9cnico), Espanhol (b\u00e1sico)"))

historia.append(Paragraph("PROJETOS", style_sec))
historia.append(Paragraph("Prazo Certo \u2014 Projeto Pessoal (em desenvolvimento)", style_proj))
historia.append(Paragraph("React Native \u00b7 TypeScript \u00b7 Expo \u00b7 Supabase/PostgreSQL \u00b7 IA Generativa", style_stack))
historia.append(B("Aplicativo multiplataforma (Android e Web) de controle de validade de produtos"))
historia.append(B("Banco de dados relacional PostgreSQL com autentica\u00e7\u00e3o e controle de permiss\u00f5es por papel"))
historia.append(B("Leitor de c\u00f3digo de barras com suporte a peso vari\u00e1vel (EAN-13 de balan\u00e7a), notifica\u00e7\u00f5es push, relat\u00f3rios em PDF e suporte offline"))
historia.append(B("Integra\u00e7\u00e3o com IA generativa (Gemini/OpenAI) via Edge Functions: identifica\u00e7\u00e3o por foto e remo\u00e7\u00e3o autom\u00e1tica de fundo com retry em segundo plano"))
historia.append(B("Pipeline de build automatizado de APK com GitHub Actions (CI/CD) \u2014 entregas test\u00e1veis a cada atualiza\u00e7\u00e3o"))
historia.append(B("Reposit\u00f3rio: github.com/RodrigoBalestrim/prazo-certo-app"))

historia.append(KeepTogether([
    Paragraph("Landing Page do Prazo Certo \u2014 Projeto Pessoal", style_proj),
    Paragraph("Next.js \u00b7 React \u00b7 TypeScript \u00b7 Tailwind CSS \u00b7 Vercel", style_stack),
    B("Site publicado em prazo-certo-landing.vercel.app com SEO t\u00e9cnico e design responsivo"),
]))
historia.append(KeepTogether([
    Paragraph("Portf\u00f3lio 3D Interativo \u2014 Projeto Pessoal", style_proj),
    Paragraph("React \u00b7 Three.js \u00b7 React Three Fiber \u00b7 Tailwind CSS", style_stack),
    B("Portf\u00f3lio com anima\u00e7\u00f5es, componentes reutiliz\u00e1veis e design responsivo, publicado na Vercel"),
]))

historia.append(Paragraph("EXPERI\u00caNCIA PROFISSIONAL", style_sec))
historia.append(KeepTogether([
    Paragraph("T\u00e9cnico de Inform\u00e1tica \u2014 Aut\u00f4nomo (2014\u20132024)", style_proj),
    B("Diagn\u00f3stico e manuten\u00e7\u00e3o de hardware e software, atendimento direto a clientes"),
    B("Rotina de resolu\u00e7\u00e3o de problemas t\u00e9cnicos e organiza\u00e7\u00e3o de suporte"),
]))

historia.append(Paragraph("CURSOS E CERTIFICA\u00c7\u00d5ES", style_sec))
historia.append(B("An\u00e1lise e Projeto de Software \u2014 IFRS (Aprenda Mais), 20h, aproveitamento de 95% (2026)"))
historia.append(B("Desenvolvimento Full Stack \u2014 Programador BR (2021)"))
historia.append(B("HTML/CSS \u2014 Curso em V\u00eddeo (2020)"))

doc.build(historia)
print("PDF gerado:", OUT)