const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

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
  const adminUser = await getUserFromToken(accessToken);
  if (!adminUser || !adminUser.email || !ADMIN_EMAILS.includes(adminUser.email.toLowerCase())) {
    return { statusCode: 403, body: JSON.stringify({ error: "Accès réservé." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Requête invalide." }) };
  }

  const clientUserId = body.user_id;
  const cureFamily = typeof body.cure_family === "string" ? body.cure_family : null;
  if (!clientUserId || !cureFamily) {
    return { statusCode: 400, body: JSON.stringify({ error: "Cliente ou cure manquante." }) };
  }

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/cure_validation?user_id=eq.${clientUserId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      cure_family: cureFamily,
      status: "validated",
      validated_at: new Date().toISOString(),
      validated_by: adminUser.email
    })
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error("Erreur validation cure:", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
