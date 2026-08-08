const crypto = require("crypto");
const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TRACKING_ENCRYPTION_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BNtC1YOP-O0ySUY8-JpDfvXnq7kSdSf2sgeMdiaQ6BHHEdQmKiIA9w_LrBS_i6CW-q1Cma3mejyqWif3CwjsHEs";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "IititExeaZKHiOy4OQIflSlCS9kI_N9xeFJhy3yT6hg";

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:contact@ma-prevention-sante.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function encrypt(plainObj) {
  const key = Buffer.from(ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plainObj), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

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

  // Vérifie si cette semaine existe déjà pour cette cliente : on met à jour plutôt que dupliquer
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/body_tracking?select=id,encrypted_data&user_id=eq.${clientUserId}&week_number=eq.${weekNumber}`,
    { headers }
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];

  // Important : on FUSIONNE avec les données déjà enregistrées plutôt que de tout
  // remplacer. Avant ce fix, soumettre juste un "Retours globaux" (sans retaper les
  // mensurations) écrasait silencieusement le poids/mensurations/ressenti déjà
  // enregistrés pour cette semaine avec des valeurs vides — une cliente pouvait ainsi
  // perdre tout son suivi de la semaine simplement parce que Lindsay ajoutait une note.
  let existingParsed = {};
  if (existingRows.length > 0) {
    try { existingParsed = decrypt(existingRows[0].encrypted_data); } catch (e) { existingParsed = {}; }
  }
  const MEASURE_FIELDS = ["weight","ventre_nombril","taille","hanches","poitrine","cuisse_droite","cuisse_gauche","mollet_droit","mollet_gauche","bras_droit","bras_gauche"];
  const merged = {};
  MEASURE_FIELDS.forEach(key => {
    merged[key] = (body[key] !== undefined && body[key] !== null) ? body[key] : (existingParsed[key] ?? null);
  });
  merged.ressenti_global = (body.ressenti_global !== undefined && body.ressenti_global !== null && body.ressenti_global !== "")
    ? body.ressenti_global
    : (existingParsed.ressenti_global ?? null);
  merged.filled_by_advisor = true;

  const encryptedData = encrypt(merged);

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

  // Notifie la cliente qu'un nouveau compte-rendu est disponible
  try {
    const subsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*&user_id=eq.${clientUserId}`,
      { headers }
    );
    const subs = subsRes.ok ? await subsRes.json() : [];
    if (subs.length) {
      const payload = JSON.stringify({
        title: "🌿 Nouveau compte-rendu",
        body: `Ta conseillère a mis à jour ton suivi de la semaine ${weekNumber}. Va voir Mon Évolution 🌸`
      });
      await Promise.allSettled(
        subs.map(sub =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        )
      );
    }
  } catch (e) {
    console.error("Erreur notification push cliente:", e);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
