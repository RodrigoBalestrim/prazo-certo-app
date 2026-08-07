// Edge Function: analyze-product
// Prazo Certo — análise de produto por foto (IA), remoção de fundo,
// descrição de estoque e comparação de duplicidade com o catálogo.
//
// Variáveis de ambiente:
//   AI_PROVIDER           (opcional)    "gemini" (padrão, gratuito) ou "openai"
//   GEMINI_API_KEY        chave gratuita do Google AI Studio (se AI_PROVIDER=gemini)
//   GEMINI_MODEL          (opcional)    gemini-2.5-flash (padrão)
//   OPENAI_API_KEY        (opcional)    chave da OpenAI (se AI_PROVIDER=openai)
//   OPENAI_MODEL          (opcional)    gpt-4o-mini (padrão)
//   REMOVE_BG_API_KEY     (opcional)    chave do remove.bg para fundo transparente
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (fornecidas pela plataforma)

import { createClient } from "npm:@supabase/supabase-js@2";

const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") || "gemini").toLowerCase();
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const REMOVE_BG_API_KEY = Deno.env.get("REMOVE_BG_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CATEGORIES = ["Mercearia", "Açougue", "Frios/PAS", "Bazar", "Saudáveis", "FLV"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ImageSource = { bytes: Uint8Array; mime: string };

type AiAnalysis = {
  name: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  packagingType: string | null;
  matches: Array<{ name: string; similarity: number }>;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function resolveImage(body: {
  imageBase64?: string;
  imageUrl?: string;
}): Promise<ImageSource | null> {
  if (body.imageBase64) {
    const raw = body.imageBase64.trim();
    const comma = raw.indexOf(",");
    if (comma >= 0 && raw.slice(0, comma).includes("base64")) {
      const mime =
        raw.slice(5, raw.indexOf(";")).trim() || "image/jpeg";
      const bytes = Uint8Array.from(atob(raw.slice(comma + 1)), (c) =>
        c.charCodeAt(0)
      );
      return { bytes, mime };
    }
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    return { bytes, mime: "image/jpeg" };
  }

  if (body.imageUrl) {
    const response = await fetch(body.imageUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const mime =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/jpeg";
    return { bytes: new Uint8Array(buffer), mime };
  }

  return null;
}

function buildSystemPrompt(): string {
  return [
    "Você é o assistente de estoque do aplicativo Prazo Certo.",
    "Analise a foto de um produto de supermercado.",
    `Escolha APENAS uma destas categorias: ${CATEGORIES.join(", ")}.`,
    "A descrição deve ser voltada para ESTOQUE (tipo de embalagem, volume/peso), não para venda.",
    "IMPORTANTE: NUNCA informe data de validade ou quantidade — o usuário preenche esses campos.",
    "Responda apenas JSON válido, sem markdown, no formato:",
    JSON.stringify({
      name: "Nome do produto (ex.: Leite Integral UHT 1L)",
      brand: "Marca ou null se não visível",
      category: "Uma das categorias listadas",
      description: "Descrição de estoque em português",
      packagingType: "Tipo de embalagem (ex.: Longa vida, Saco plástico 5kg)",
      matches: [{ name: "Nome do produto parecido já cadastrado", similarity: 98 }],
    }),
    "matches deve conter apenas produtos da lista fornecida que sejam realmente parecidos, com similarity de 0 a 100. Se nenhum for parecido, retorne [].",
  ].join("\n");
}

function buildUserPrompt(barcode: string, existingProducts: string[]): string {
  const catalogHint =
    existingProducts.length > 0
      ? `Produtos já cadastrados (compare e informe os mais parecidos):\n${existingProducts
          .map((name) => `- ${name}`)
          .join("\n")}`
      : "Não há produtos cadastrados para comparar.";
  return `Código de barras: ${barcode || "desconhecido"}\n\n${catalogHint}`;
}

// Interpreta a resposta JSON do modelo de forma tolerante: extrai o objeto
// entre a primeira "{" e a última "}" e remove caracteres invisíveis (BOM,
// espaços de largura zero, controles) que alguns modelos incluem.
function parseModelJson(content: string): AiAnalysis {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace > firstBrace
      ? content.slice(firstBrace, lastBrace + 1)
      : content;
  const cleaned = jsonText.replace(/[\u200B-\u200D\uFEFF\x00-\x1F]/g, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Não foi possível interpretar a resposta da IA (início: ${content.slice(0, 120)})`,
    );
  }

  const category = String(parsed.category || "").trim();
  const validCategory = CATEGORIES.includes(category) ? category : null;

  const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const matches = rawMatches
    .map((match) => ({
      name: String((match as { name?: unknown }).name || "").trim(),
      similarity: Number((match as { similarity?: unknown }).similarity) || 0,
    }))
    .filter((match) => match.name && match.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return {
    name: String(parsed.name || "").trim() || null,
    brand: String(parsed.brand || "").trim() || null,
    category: validCategory,
    description: String(parsed.description || "").trim() || null,
    packagingType: String(parsed.packagingType || "").trim() || null,
    matches,
  };
}

async function analyzeWithOpenAI(
  image: ImageSource,
  barcode: string,
  existingProducts: string[],
): Promise<AiAnalysis> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada (defina AI_PROVIDER=gemini ou a chave da OpenAI).");
  }

  const dataUrl = `data:${image.mime};base64,${bytesToBase64(image.bytes)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserPrompt(barcode, existingProducts) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorJson = (await response.json()) as { error?: { message?: string } };
      detail = errorJson?.error?.message || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      `Assistente de IA (OpenAI) indisponível (${response.status}): ${detail || "tente novamente mais tarde"}`,
    );
  }

  const data = (await response.json().catch(async () => {
    const rawBody = await response.text().catch(() => "");
    throw new Error(
      `Resposta inesperada da IA (status ${response.status}, corpo: ${rawBody.slice(0, 200)})`,
    );
  })) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = String(data.choices?.[0]?.message?.content || "{}");
  return parseModelJson(content);
}

async function analyzeWithGemini(
  image: ImageSource,
  barcode: string,
  existingProducts: string[],
): Promise<AiAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada na Edge Function.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}` +
    `:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: buildUserPrompt(barcode, existingProducts) },
            {
              inlineData: {
                mimeType: image.mime,
                data: bytesToBase64(image.bytes),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            brand: { type: "STRING" },
            category: { type: "STRING" },
            description: { type: "STRING" },
            packagingType: { type: "STRING" },
            matches: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  similarity: { type: "NUMBER" },
                },
              },
            },
          },
          required: ["name", "brand", "category", "description", "packagingType", "matches"],
        },
      },
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorJson = (await response.json()) as { error?: { message?: string } };
      detail = errorJson?.error?.message || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      `Assistente de IA (Gemini) indisponível (${response.status}): ${detail || "tente novamente mais tarde"}`,
    );
  }

  const data = (await response.json().catch(async () => {
    const rawBody = await response.text().catch(() => "");
    throw new Error(
      `Resposta inesperada da IA (status ${response.status}, corpo: ${rawBody.slice(0, 200)})`,
    );
  })) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  return parseModelJson(content);
}

async function analyzeImage(
  image: ImageSource,
  barcode: string,
  existingProducts: string[],
): Promise<AiAnalysis> {
  if (AI_PROVIDER === "openai") {
    return await analyzeWithOpenAI(image, barcode, existingProducts);
  }
  if (AI_PROVIDER !== "gemini") {
    throw new Error(`AI_PROVIDER inválido: ${AI_PROVIDER} (use "gemini" ou "openai")`);
  }
  return await analyzeWithGemini(image, barcode, existingProducts);
}

async function removeBackgroundWithGemini(image: ImageSource): Promise<Uint8Array | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}` +
      `:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Remova o fundo desta imagem e mantenha apenas o produto, " +
                  "com fundo transparente. Devolva apenas a imagem editada.",
              },
              {
                inlineData: {
                  mimeType: image.mime,
                  data: bytesToBase64(image.bytes),
                },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
    if (!part?.inlineData?.data) return null;
    const raw = part.inlineData.data;
    return Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function removeBackground(image: ImageSource): Promise<Uint8Array | null> {
  // remove.bg é o método mais confiável quando há chave; o Gemini (modelo de
  // imagem) é usado como alternativa quando a conta possui acesso ao modelo.
  if (REMOVE_BG_API_KEY) {
    try {
      const form = new FormData();
      form.append(
        "image_file",
        new Blob([image.bytes], { type: image.mime }),
        "product.jpg",
      );
      form.append("size", "auto");
      form.append("format", "png");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": REMOVE_BG_API_KEY },
        body: form,
      });

      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch {
      // Tenta o Gemini abaixo em caso de falha.
    }
  }

  return await removeBackgroundWithGemini(image);
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, new Blob([bytes], { type: contentType }), {
      contentType,
      upsert: true,
    });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

function safeCode(barcode: string): string {
  const normalized = barcode.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return normalized || "sem-codigo";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Configuração incompleta da Edge Function" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sessão inválida" }, 401);

  try {
    const rawBodyText = await req.text();
    const body = JSON.parse(rawBodyText) as {
      barcode?: string;
      imageBase64?: string;
      imageUrl?: string;
      existingProducts?: string[];
    };

    const image = await resolveImage(body);
    if (!image) return json({ error: "Imagem não fornecida" }, 400);

    const barcode = (body.barcode || "").trim();
    const existingProducts = Array.isArray(body.existingProducts)
      ? body.existingProducts.map((name) => String(name).trim()).filter(Boolean).slice(0, 40)
      : [];

    const analysis = await analyzeImage(image, barcode, existingProducts);

    const cutoutPng = await removeBackground(image);
    const code = safeCode(barcode);

    let originalUrl: string | null = null;
    let cutoutUrl: string | null = null;

    // Sobe a foto original para o bucket público (se veio do aparelho)
    if (body.imageBase64) {
      originalUrl = await uploadToStorage(
        supabase,
        "product-images",
        `${user.id}/${code}.jpg`,
        image.bytes,
        image.mime,
      );
    } else if (body.imageUrl) {
      originalUrl = body.imageUrl;
    }

    if (cutoutPng) {
      cutoutUrl = await uploadToStorage(
        supabase,
        "product-cutouts",
        `${user.id}/${code}-cutout.png`,
        cutoutPng,
        "image/png",
      );
    }

    // Catálogo compartilhado: insere apenas se ainda não existir; para produtos
    // de outros usuários, completa somente as imagens que estão faltando
    // (o trigger protect_product_catalog_update bloqueia a alteração dos demais
    // campos por terceiros).
    if (barcode && analysis.name) {
      const { data: existingCatalog } = await supabase
        .from("product_catalog")
        .select("barcode, image_url, image_cutout_url")
        .eq("barcode", barcode)
        .maybeSingle();

      if (!existingCatalog) {
        const { error: insertError } = await supabase.from("product_catalog").insert({
          barcode,
          name: analysis.name,
          brand: analysis.brand,
          category: analysis.category,
          description: analysis.description,
          packaging_type: analysis.packagingType,
          image_url: originalUrl,
          image_cutout_url: cutoutUrl,
          created_by: user.id,
        });
        if (insertError && insertError.code !== "23505") {
          console.error("insert catalog:", insertError.message);
        }
      } else {
        const patch: Record<string, unknown> = {};
        if (!existingCatalog.image_url && originalUrl) patch.image_url = originalUrl;
        if (!existingCatalog.image_cutout_url && cutoutUrl) patch.image_cutout_url = cutoutUrl;
        if (Object.keys(patch).length > 0) {
          const { error: patchError } = await supabase
            .from("product_catalog")
            .update(patch)
            .eq("barcode", barcode);
          if (patchError) {
            console.error("patch catalog:", patchError.message);
          }
        }
      }
    }

    return json({
      processed: true,
      name: analysis.name,
      brand: analysis.brand,
      category: analysis.category,
      description: analysis.description,
      packagingType: analysis.packagingType,
      matches: analysis.matches,
      originalUrl,
      cutoutUrl,
      backgroundRemoved: Boolean(cutoutPng),
    });
  } catch (error) {
    console.error("analyze-product:", error);
    const message = error instanceof Error ? error.message : "Falha ao processar a imagem";
    const stack = error instanceof Error && error.stack ? error.stack.slice(0, 600) : "";
    return json({ error: message, stack }, 500);
  }
});
