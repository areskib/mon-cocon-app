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
  if (!SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Configuration serveur incomplète." }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "Non authentifiée." }) };
  }
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const user = await getUserFromToken(accessToken);
  if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { statusCode: 403, body: JSON.stringify({ error: "Accès réservé." }) };
  }

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  const [pendingRes, quizRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/cure_validation?select=user_id,cure_family,status,created_at&status=eq.pending&order=created_at.asc`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/quiz_results?select=user_id,email,raw_data`, { headers })
  ]);

  if (!pendingRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur de lecture." }) };
  }

  const pendingRows = await pendingRes.json();
  const quizRows = quizRes.ok ? await quizRes.json() : [];
  const quizByUser = {};
  quizRows.forEach(q => { quizByUser[q.user_id] = q; });

  const pending = pendingRows.map(p => {
    const quiz = quizByUser[p.user_id] || null;
    let raw = {};
    try { raw = quiz ? JSON.parse(quiz.raw_data) : {}; } catch (e) {}
    return {
      user_id: p.user_id,
      email: quiz ? quiz.email : null,
      firstname: raw.firstname || null,
      cure_family: p.cure_family,
      created_at: p.created_at,
      raw_data: raw
    };
  });

  return {
    statusCode: 200,
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ pending })
  };
};
