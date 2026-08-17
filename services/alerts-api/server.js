import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  return origin && allowedOrigins.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(isoDate, today) {
  return Math.round((new Date(`${isoDate}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86_400_000);
}

function categoryAdvance(category) {
  return category === "Açougue" || category === "Frios/PAS" ? 15 : 30;
}

export function buildAlerts(products, today = todayIso(), days = 30) {
  return products
    .map((product) => ({
      ...product,
      daysUntilExpiry: daysUntil(product.expires_at, today),
      alertAtDays: categoryAdvance(product.category),
    }))
    .filter((product) => product.daysUntilExpiry <= Math.min(days, product.alertAtDays))
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
}

export async function userFromRequest(request, supabaseUrl, supabaseAnonKey) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : { supabase, user };
}

export function createApp({ supabaseUrl, supabaseAnonKey }) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias.");

  return async function app(request, response) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...cors, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization, content-type" });
      return response.end();
    }
    if (request.method !== "GET" || new URL(request.url, "http://localhost").pathname !== "/alerts") {
      return json(response, 404, { error: "Not found" }, cors);
    }

    const session = await userFromRequest(request, supabaseUrl, supabaseAnonKey);
    if (!session) return json(response, 401, { error: "Unauthorized" }, cors);

    const url = new URL(request.url, "http://localhost");
    const parsedDays = Number(url.searchParams.get("days") || 30);
    const days = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 90 ? parsedDays : 30;
    const today = todayIso();
    const { data, error } = await session.supabase
      .from("products")
      .select("id,name,category,expires_at,quantity")
      .eq("user_id", session.user.id)
      .is("organization_id", null)
      .or("archived.is.null,archived.eq.false")
      .lte("expires_at", addDays(today, days));

    if (error) return json(response, 502, { error: "Não foi possível consultar os alertas." }, cors);
    return json(response, 200, { today, alerts: buildAlerts(data || [], today, days) }, cors);
  };
}

if (process.env.NODE_ENV !== "test") {
  const app = createApp({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
  createServer(app).listen(port, () => console.log(`Alerts API listening on :${port}`));
}
