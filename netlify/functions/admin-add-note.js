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

  const clientEmail = (body.clientEmail || "").trim().toLowerCase();
  const note = (body.note || "").trim();
  const nextRdvDate = body.nextRdvDate || null;
  const weekNumber = Number.isInteger(body.weekNumber) ? body.weekNumber : (parseInt(body.weekNumber, 10) || null);

  if (!clientEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email de la cliente manquant." }) };
  }
  if (!note && !nextRdvDate) {
    return { statusCode: 400, body: JSON.stringify({ error: "Ajoute au moins une note ou une date de rdv." }) };
  }

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  // Retrouver le user_id à partir de l'email (via quiz_results, qui stocke déjà l'email)
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quiz_results?select=user_id&email=eq.${encodeURIComponent(clientEmail)}&limit=1`,
    { headers }
  );
  if (!lookupRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur de recherche de la cliente." }) };
  }
  const lookupRows = await lookupRes.json();
  if (!lookupRows.length) {
    return { statusCode: 404, body: JSON.stringify({ error: "Aucune cliente trouvée avec cet email." }) };
  }
  const clientUserId = lookupRows[0].user_id;

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/advisor_notes`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      client_user_id: clientUserId,
      note: note || null,
      next_rdv_date: nextRdvDate,
      week_number: weekNumber,
      created_by: adminUser.email
    })
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("Erreur insertion advisor_notes:", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue, réessaie." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
