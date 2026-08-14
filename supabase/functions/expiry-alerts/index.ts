/** Gera e-mails de validade para responsáveis autorizados de cada grupo. */
import { createClient } from "npm:@supabase/supabase-js@2";

type Product = {
  id: string;
  name: string;
  category: string;
  expires_at: string;
  quantity: number;
  organization_id: string | null;
  user_id: string;
};

type Member = {
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "stockist" | "viewer";
  active: boolean;
};

type Recipient = {
  email: string;
  name: string;
  groups: Map<string, Product[]>;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const n8nAlertsSecret = Deno.env.get("N8N_ALERTS_SECRET") || "";
// Apenas cargos responsáveis recebem e-mail de grupo.
const notifierRoles = new Set(["owner", "admin", "manager"]);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
  })[character] || character);
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

// Mantém no e-mail a mesma regra de antecedência exibida no aplicativo.
function thresholdFor(product: Product): number {
  return product.category === "Açougue" || product.category === "Frios/PAS" ? 15 : 30;
}

async function fetchProducts(client: ReturnType<typeof createClient>, today: string, maxDate: string): Promise<Product[]> {
  const products: Product[] = [];
  for (let start = 0; start < 10_000; start += 1_000) {
    const { data, error } = await client
      .from("products")
      .select("id,name,category,expires_at,quantity,organization_id,user_id")
      .gte("expires_at", today)
      .lte("expires_at", maxDate)
      .order("expires_at", { ascending: true })
      .range(start, start + 999);
    if (error) throw error;
    products.push(...((data || []) as Product[]));
    if (!data || data.length < 1_000) break;
  }
  return products.filter((product) => {
    const now = new Date(`${today}T00:00:00Z`).getTime();
    const expiry = new Date(`${product.expires_at}T00:00:00Z`).getTime();
    return expiry - now <= thresholdFor(product) * 86_400_000;
  });
}

// auth.users não é exposta pelo Data API; a função usa a chave interna apenas no servidor.
async function fetchUsers(client: ReturnType<typeof createClient>, userIds: Set<string>) {
  const users = new Map<string, { email: string; name: string }>();
  for (let page = 1; page <= 10 && users.size < userIds.size; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1_000 });
    if (error) throw error;
    for (const user of data.users) {
      if (!user.email || !userIds.has(user.id)) continue;
      const metadata = user.user_metadata || {};
      users.set(user.id, {
        email: user.email,
        name: typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : user.email.split("@")[0],
      });
    }
    if (data.users.length < 1_000) break;
  }
  return users;
}

Deno.serve(async (request) => {
  // A função é pública no gateway, mas exige segredo próprio do n8n; nunca aceita JWT de usuário.
  if (request.method !== "GET") return response({ error: "Método não permitido" }, 405);
  if (!supabaseUrl || !serviceRoleKey || !n8nAlertsSecret) return response({ error: "Configuração indisponível" }, 500);
  const suppliedSecret = request.headers.get("x-n8n-alerts-secret") || request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (suppliedSecret !== n8nAlertsSecret) return response({ error: "Não autorizado" }, 401);

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  try {
    const products = await fetchProducts(client, today, maxDate);
    const groupIds = [...new Set(products.map((product) => product.organization_id).filter(Boolean))] as string[];
    const { data: members, error } = groupIds.length
      ? await client.from("organization_members").select("organization_id,user_id,role,active").in("organization_id", groupIds).eq("active", true)
      : { data: [], error: null };
    if (error) throw error;

    const recipients = new Map<string, Recipient>();
    const memberRows = (members || []) as Member[];
    const userIds = new Set(products.filter((product) => !product.organization_id).map((product) => product.user_id));
    for (const member of memberRows) if (notifierRoles.has(member.role)) userIds.add(member.user_id);
    const users = await fetchUsers(client, userIds);

    const addProduct = (userId: string, groupId: string, product: Product) => {
      const user = users.get(userId);
      if (!user) return;
      const recipient = recipients.get(user.email) || { email: user.email, name: user.name, groups: new Map<string, Product[]>() };
      recipient.groups.set(groupId, [...(recipient.groups.get(groupId) || []), product]);
      recipients.set(user.email, recipient);
    };

    for (const product of products) {
      if (!product.organization_id) {
        addProduct(product.user_id, "Pessoal", product);
        continue;
      }
      for (const member of memberRows) {
        if (member.organization_id === product.organization_id && notifierRoles.has(member.role)) addProduct(member.user_id, member.organization_id, product);
      }
    }

    // Um item por destinatário permite ao n8n disparar exatamente um e-mail por responsável.
    const alerts = [...recipients.values()].map((recipient) => {
      const rows = [...recipient.groups.values()].flat().map((product) => `<li><strong>${escapeHtml(product.name)}</strong> — vence em ${formatDate(product.expires_at)} (${escapeHtml(product.category)}, qtd. ${product.quantity})</li>`).join("");
      return {
        to: recipient.email,
        subject: `Prazo Certo: ${[...recipient.groups.values()].flat().length} produto(s) próximo(s) da validade`,
        html: `<p>Olá, ${escapeHtml(recipient.name)}.</p><p>Produtos que exigem atenção:</p><ul>${rows}</ul><p>Abra o Prazo Certo para agir.</p>`,
      };
    });

    return response({ generated_at: new Date().toISOString(), alerts });
  } catch (error) {
    console.error(error);
    return response({ error: "Falha ao gerar alertas" }, 500);
  }
});