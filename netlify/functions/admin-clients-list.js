const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CURES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzd8QyWoYL9HvW7ZMYFTbfv-BF1Y430m-J0t4sCYZ8TzKuSUTkwuyDDqFNw0f4lSijJakWI1m2vZL5/pub?gid=741790958&single=true&output=csv";

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\r') {}
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function getCureFamilyNames() {
  try {
    const res = await fetch(CURES_CSV_URL);
    if (!res.ok) return {};
    const rows = parseCSV(await res.text());
    const header = rows[0];
    const iVariable = header.indexOf("Variable");
    const iProblematique = header.indexOf("Problématique");
    const names = {};
    for (let r = 1; r < rows.length; r++) {
      const key = (rows[r][iVariable] || "").trim();
      const fam = key.replace(/_(starter|standard|premium)$/, "");
      if (fam && !names[fam]) names[fam] = (rows[r][iProblematique] || "").trim();
    }
    return names;
  } catch (e) {
    return {};
  }
}

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

  const [quizRes, cureRes, notesRes, cureNames] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/quiz_results?select=user_id,email,raw_data,created_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/cure_progress?select=user_id,cure_family,cure_duration_weeks,objectif_idx,started_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/advisor_notes?select=client_user_id,next_rdv_date,created_at&order=created_at.desc`, { headers }),
    getCureFamilyNames()
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
  const lastRdvByUser = {};
  notesRows.forEach(n => {
    if (n.next_rdv_date && !nextRdvByUser[n.client_user_id]) {
      nextRdvByUser[n.client_user_id] = n.next_rdv_date; // le plus récent grâce au tri desc
    }
    if (!lastRdvByUser[n.client_user_id]) {
      lastRdvByUser[n.client_user_id] = n.created_at; // premier rencontré = le plus récent (tri desc)
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
      cure_name: cure && cure.cure_family ? (cureNames[cure.cure_family] || cure.cure_family) : null,
      cure_duration_weeks: cure ? cure.cure_duration_weeks : null,
      week_number: weekNumber,
      cure_started: !!cure,
      next_rdv_date: nextRdvByUser[row.user_id] || null,
      last_rdv_date: lastRdvByUser[row.user_id] || null,
      bilan_date: row.created_at
    };
  });

  return {
    statusCode: 200,
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify({ clients })
  };
};
