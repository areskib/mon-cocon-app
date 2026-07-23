const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TRACKING_ENCRYPTION_KEY; // base64, 32 bytes

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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY
    }
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async function (event) {
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

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/body_tracking?select=week_number,encrypted_data&user_id=eq.${user.id}&order=week_number.asc`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    }
  );

  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur de lecture." }) };
  }

  const rows = await res.json();
  const result = rows.map((row) => {
    try {
      const data = decrypt(row.encrypted_data);
      return { week_number: row.week_number, ...data };
    } catch (e) {
      console.error("Erreur déchiffrement ligne:", e);
      return { week_number: row.week_number };
    }
  });

  return { statusCode: 200, body: JSON.stringify({ data: result }) };
};
