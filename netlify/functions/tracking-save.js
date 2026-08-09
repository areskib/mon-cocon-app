const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TRACKING_ENCRYPTION_KEY; // base64, 32 bytes
const { resolveUserTenantId } = require("./_tenant-auth");

function encrypt(plainObj) {
  const key = Buffer.from(ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plainObj), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv (12) + authTag (16) + ciphertext, le tout en base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

async function getUserFromToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY
    }
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
  const user = await getUserFromToken(accessToken);
  if (!user || !user.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "Session invalide, reconnecte-toi." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Requête invalide." }) };
  }

  const weekNumber = parseInt(body.week_number, 10);
  if (!weekNumber || weekNumber < 1 || weekNumber > 12) {
    return { statusCode: 400, body: JSON.stringify({ error: "Numéro de semaine invalide (1 à 12)." }) };
  }

  // Vérifie si cette semaine a déjà été renseignée
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/body_tracking?select=id&user_id=eq.${user.id}&week_number=eq.${weekNumber}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    }
  );
  const existing = await checkRes.json();
  if (Array.isArray(existing) && existing.length > 0) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: `Tu as déjà renseigné tes infos pour la semaine ${weekNumber} 🌸` })
    };
  }

  const tenantId = await resolveUserTenantId(user.id);
  if (!tenantId) {
    return { statusCode: 500, body: JSON.stringify({ error: "Profil incomplet, reconnecte-toi." }) };
  }

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
    bras_gauche: body.bras_gauche ?? null
  });

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/body_tracking`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      user_id: user.id,
      tenant_id: tenantId,
      week_number: weekNumber,
      encrypted_data: encryptedData
    })
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("Erreur insertion body_tracking:", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue, réessaie." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
