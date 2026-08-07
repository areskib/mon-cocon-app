const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BNtC1YOP-O0ySUY8-JpDfvXnq7kSdSf2sgeMdiaQ6BHHEdQmKiIA9w_LrBS_i6CW-q1Cma3mejyqWif3CwjsHEs";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "IititExeaZKHiOy4OQIflSlCS9kI_N9xeFJhy3yT6hg";

const ADMIN_EMAILS = ["lindsay.ag@hotmail.fr", "projet@scalyo-ai.com"];

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:contact@ma-prevention-sante.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Configuration serveur incomplète." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Requête invalide." }) };
  }
  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email manquant." }) };
  }

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  // Retrouve le user_id lié à cet email, si un compte existe (on ne révèle rien côté client dans tous les cas)
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quiz_results?select=user_id&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers }
  );
  const lookupRows = lookupRes.ok ? await lookupRes.json() : [];
  const userId = lookupRows.length ? lookupRows[0].user_id : null;

  if (userId) {
    await fetch(`${SUPABASE_URL}/rest/v1/password_reset_requests`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, email, status: "pending" })
    });

    // Notifie Lindsay et Areski par push
    try {
      const adminIds = [];
      for (const adminEmail of ADMIN_EMAILS) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/quiz_results?select=user_id&email=eq.${encodeURIComponent(adminEmail)}&limit=1`,
          { headers }
        );
        const rows = r.ok ? await r.json() : [];
        if (rows.length) adminIds.push(rows[0].user_id);
      }
      if (adminIds.length) {
        const orFilter = adminIds.map(id => `user_id.eq.${id}`).join(",");
        const subsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*&or=(${orFilter})`,
          { headers }
        );
        const subs = subsRes.ok ? await subsRes.json() : [];
        const payload = JSON.stringify({
          title: "🔑 Demande de réinitialisation",
          body: `${email} demande une réinitialisation de mot de passe.`
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
  }

  // Réponse identique que le compte existe ou non (ne pas révéler l'existence d'un email)
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
