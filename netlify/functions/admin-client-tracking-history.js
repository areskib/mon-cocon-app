const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TRACKING_ENCRYPTION_KEY;

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

function decrypt(b64) {
  const key = Buffer.from(ENCRYPTION_KEY, "base64");
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

async function getUserFromToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
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

  const clientEmail = ((event.queryStringParameters || {}).clientEmail || "").trim().toLowerCase();
  if (!clientEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email de la cliente manquant." }) };
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

  const [trackingRes, notesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/body_tracking?select=week_number,encrypted_data,created_at&user_id=eq.${clientUserId}&order=week_number.desc`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/advisor_notes?select=note,week_number,next_rdv_date,created_at,created_by&client_user_id=eq.${clientUserId}&order=created_at.desc`, { headers })
  ]);

  const trackingRows = trackingRes.ok ? await trackingRes.json() : [];
  const allNotes = notesRes.ok ? await notesRes.json() : [];

  // Toutes les notes (historique complet, y compris plusieurs par semaine si Lindsay
  // a fait plusieurs passages) — regroupées par semaine pour l'affichage principal,
  // mais rien n'est jamais supprimé côté base.
  const notesByWeek = {};
  allNotes.forEach(n => {
    if (n.week_number == null) return;
    if (!notesByWeek[n.week_number]) notesByWeek[n.week_number] = [];
    notesByWeek[n.week_number].push(n);
  });

  const weeks = trackingRows.map(row => {
    let parsed = {};
    try { parsed = decrypt(row.encrypted_data); } catch (e) { parsed = {}; }
    return {
      week_number: row.week_number,
      created_at: row.created_at,
      ...parsed,
      notes: notesByWeek[row.week_number] || []
    };
  });

  // Notes générales sans semaine associée (anciens comptes-rendus créés avant l'ajout du champ)
  const generalNotes = allNotes.filter(n => n.week_number == null);

  return { statusCode: 200, body: JSON.stringify({ weeks, generalNotes }) };
};
