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

  const [quizRes, cureRes, notesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/quiz_results?select=user_id,email,raw_data,created_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/cure_progress?select=user_id,cure_family,cure_duration_weeks,objectif_idx,started_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/advisor_notes?select=client_user_id,next_rdv_date,created_at&order=created_at.desc`, { headers })
  ]);

  if (!quizRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur de lecture des profils." }) };
  }

  const quizRows = await quizRes.json();
  const cureRows = cureRes.ok ? await cureRes.json() : [];
  const notesRows = notesRes.ok ? await notesRes.json() : [];
  const cureByUser = {};
  cureRows.forEach(c => { cureByUser[c.user_id] = c; });
  const nextRdvByUser = {};
  notesRows.forEach(n => {
    if (n.next_rdv_date && !nextRdvByUser[n.client_user_id]) {
      nextRdvByUser[n.client_user_id] = n.next_rdv_date; // le plus récent grâce au tri desc
    }
  });

  const clients = quizRows.map(row => {
    let raw = {};
    try { raw = JSON.parse(row.raw_data); } catch (e) {}
    const cure = cureByUser[row.user_id] || null;
    let weekNumber = null;
    if (cure && cure.started_at && cure.cure_duration_weeks) {
      const started = new Date(cure.started_at);
      const now = new Date();
      const days = Math.floor((now - started) / (1000 * 60 * 60 * 24));
      weekNumber = Math.min(cure.cure_duration_weeks, Math.max(1, Math.floor(days / 7) + 1));
    }
    return {
      user_id: row.user_id,
      email: row.email,
      firstname: raw.firstname || null,
      age: raw.age || null,
      cure_family: cure ? cure.cure_family : null,
      cure_duration_weeks: cure ? cure.cure_duration_weeks : null,
      week_number: weekNumber,
      cure_started: !!cure,
      next_rdv_date: nextRdvByUser[row.user_id] || null,
      bilan_date: row.created_at
    };
  });

  return {
    statusCode: 200,
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ clients })
  };
};
