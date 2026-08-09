const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BNtC1YOP-O0ySUY8-JpDfvXnq7kSdSf2sgeMdiaQ6BHHEdQmKiIA9w_LrBS_i6CW-q1Cma3mejyqWif3CwjsHEs";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "IititExeaZKHiOy4OQIflSlCS9kI_N9xeFJhy3yT6hg";

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];
const { resolveUserTenantId } = require("./_tenant-auth");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:contact@ma-prevention-sante.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

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
  const user = await getUserFromToken(accessToken);
  if (!user || !user.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "Session invalide." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Requête invalide." }) };
  }
  const cureFamily = typeof body.cure_family === "string" ? body.cure_family : null;
  console.log("submit-cure-validation: user_id=" + user.id + " cure_family=" + cureFamily);

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  // Si une validation existe déjà pour cette utilisatrice, on ne fait rien (pas de doublon, pas de notif renvoyée)
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/cure_validation?select=id,status&user_id=eq.${user.id}`,
    { headers }
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];
  console.log("submit-cure-validation: existingRes.ok=" + existingRes.ok + " existingRows.length=" + existingRows.length);
  if (existingRows.length > 0) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: existingRows[0].status, already: true }) };
  }

  const tenantId = await resolveUserTenantId(user.id);
  if (!tenantId) {
    return { statusCode: 500, body: JSON.stringify({ error: "Profil incomplet, reconnecte-toi." }) };
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/cure_validation`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, tenant_id: tenantId, cure_family: cureFamily, status: "pending" })
  });
  console.log("submit-cure-validation: insertRes.status=" + insertRes.status + " insertRes.ok=" + insertRes.ok);

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("Erreur création cure_validation:", errText);
    return { statusCode: 500, body: JSON.stringify({ error: "Une erreur est survenue." }) };
  }

  // Notifie Lindsay (et Areski) par push, si iels ont un abonnement actif
  try {
    // Prénom de la cliente pour personnaliser la notif (repli sur "Une championne" si introuvable)
    let clientFirstname = "";
    try {
      const qrRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_results?select=raw_data&user_id=eq.${user.id}&order=created_at.desc&limit=1`,
        { headers }
      );
      const qrRows = qrRes.ok ? await qrRes.json() : [];
      if (qrRows.length) {
        clientFirstname = JSON.parse(qrRows[0].raw_data).firstname || "";
      }
    } catch (e) {}

    const adminIds = [];
    for (const adminEmail of ADMIN_EMAILS) {
      const lookupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_results?select=user_id&email=eq.${encodeURIComponent(adminEmail)}&limit=1`,
        { headers }
      );
      const rows = lookupRes.ok ? await lookupRes.json() : [];
      if (rows.length) adminIds.push(rows[0].user_id);
    }
    if (adminIds.length) {
      const orFilter = adminIds.map(id => `user_id.eq.${id}`).join(",");
      const subsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*&or=(${orFilter})`,
        { headers }
      );
      const subs = subsRes.ok ? await subsRes.json() : [];
      const nameLabel = clientFirstname ? clientFirstname : "Une championne";
      const payload = JSON.stringify({
        title: "🏆 Nouvelle cure à valider",
        body: `${nameLabel} a répondu au questionnaire, sa cure est en attente de validation.`
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
    console.error("Erreur notification push admin:", e);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, status: "pending" }) };
};
