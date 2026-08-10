const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveTenantByHost } = require("./lib/tenant-auth");

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

  // Écrit aussi quiz_results ici, côté serveur avec service_role, si des
  // données de quiz sont fournies. Fait dans LA MÊME requête que la création
  // du profil plutôt que de laisser le client réinsérer séparément juste
  // après (via supabase-js, soumis aux RLS) : ça évite toute course entre
  // "le profil vient d'être créé" et "la policy RLS de quiz_results relit
  // bien ce profil tout frais" — cause d'un vrai échec en prod (403 RLS).
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const rawData = body.raw_data;
  const email = typeof body.email === "string" ? body.email : null;

  if (rawData) {
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_results?select=id&user_id=eq.${user.id}&limit=1`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    if (!existingRows.length) {
      const quizRes = await fetch(`${SUPABASE_URL}/rest/v1/quiz_results`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ user_id: user.id, tenant_id: tenantId, email, raw_data: rawData })
      });
      if (!quizRes.ok) {
        const errText = await quizRes.text();
        console.error("Erreur insertion quiz_results:", errText);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, tenant_id: tenantId }) };
};
