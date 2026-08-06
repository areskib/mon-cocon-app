const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TRACKING_ENCRYPTION_KEY;

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

function encrypt(plainObj) {
  const key = Buffer.from(ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plainObj), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

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
  if (!SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
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
  const weekNumber = parseInt(body.week_number, 10);
  if (!clientEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email de la cliente manquant." }) };
  }
  if (!weekNumber || weekNumber < 1 || weekNumber > 24) {
    return { statusCode: 400, body: JSON.stringify({ error: "Numéro de semaine invalide." }) };
  }

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

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

  const encryptedData = encrypt({
    weight: body.weight ?? null,
    ventre_nombril: body.ventre_nombril ?? null,
    taille: body.taille ?? null,
    hanches: body.hanches ?? null,
    poitrine: body.poitrine ?? null,
    cuisse_droite: body.cuisse_droite ?? null,
    cuisse_gauche: body.cuisse_gauche ?? null,
    mollet_droit: body.mollet_droit ?? null,
    mollet_gauche: body.mollet_gauche ?? null,
    bras_droit: body.bras_droit ?? null,
    bras_gauche: body.bras_gauche ?? null,
    ressenti_global: body.ressenti_global ?? null,
    filled_by_advisor: true
  });

  // Vérifie si cette semaine existe déjà pour cette cliente : on met à jour plutôt que dupliquer
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/body_tracking?select=id&user_id=eq.${clientUserId}&week_number=eq.${weekNumber}`,
    { headers }
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];

  let writeRes;
  if (existingRows.length > 0) {
    writeRes = await fetch(`${SUPABASE_URL}/rest/v1/body_tracking?id=eq.${existingRows[0].id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ encrypted_data: encryptedData })
    });
  } else {
    writeRes = await fetch(`${SUPABASE_URL}/rest/v1/body_tracking`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: clientUserId, week_number: weekNumber, encrypted_data: encryptedData })
    });
  }

  if (!writeRes.ok) {
    const errText = await writeRes.text();
    console.error("Erreur écriture body_tracking (admin):", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue, réessaie." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
