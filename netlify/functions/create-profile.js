const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveTenantByHost } = require("./_tenant-auth");

async function getUserFromToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Configuration serveur incomplète." }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "Non authentifiée." }) };
  }
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const user = await getUserFromToken(accessToken);
  if (!user || !user.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "Session invalide, reconnecte-toi." }) };
  }

  // Le tenant est résolu côté serveur à partir du Host de la requête, jamais
  // d'une valeur envoyée par le client, pour empêcher qu'un compte s'auto-assigne un tenant.
  const host = event.headers.host || event.headers.Host || "";
  const tenantId = await resolveTenantByHost(host);
  if (!tenantId) {
    return { statusCode: 500, body: JSON.stringify({ error: "Impossible de déterminer l'espace associé à ce compte." }) };
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({ id: user.id, tenant_id: tenantId })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Erreur upsert profiles:", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue, réessaie." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, tenant_id: tenantId }) };
};
