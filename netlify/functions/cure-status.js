const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cure_progress?select=cure_duration_weeks&user_id=eq.${user.id}`,
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
  if (rows.length > 0) {
    return { statusCode: 200, body: JSON.stringify({ started: true, duration: rows[0].cure_duration_weeks }) };
  }
  return { statusCode: 200, body: JSON.stringify({ started: false, duration: null }) };
};
