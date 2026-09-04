const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Lindsay - Mon Cocon <contact@ma-prevention-sante.com>";
const { resolveUserTenantId } = require("./lib/tenant-auth");

const DEFAULT_BRAND_NAME = "Mon Cocon";
const DEFAULT_LOGO_URL = "https://ma-prevention-sante.com/images/logo.png";
const DEFAULT_CALENDAR_LINK = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ183gUyUguqRr3Q9X29SXDjzezae2e3IhJ2cdalzuf5yAenlswLd5BCt6ORHpElrNCYEwQFw1rT";

function welcomeEmailHtml(prenom, tenant){
  const safeName = prenom || "";
  const brandName = (tenant && tenant.name) || DEFAULT_BRAND_NAME;
  const logoUrl = (tenant && tenant.logo_url) || DEFAULT_LOGO_URL;
  const calendarLink = (tenant && tenant.calendar_link) || DEFAULT_CALENDAR_LINK;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenue dans ton parcours</title>
</head>
<body style="margin:0; padding:0; background-color:#F0E6DD; font-family: Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0E6DD; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#F8F1E9; border-radius:20px; overflow:hidden;">

          <tr>
            <td align="center" style="background-color:#4C342E; padding:28px 24px;">
              <img src="${logoUrl}" width="64" height="64" alt="${brandName}" style="border-radius:14px; display:block; margin:0 auto 10px;">
              <span style="color:#D9B978; font-family: Georgia, serif; font-size:20px; letter-spacing:0.5px;">${brandName}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 8px;">
              <p style="margin:0 0 6px; font-family: Arial, sans-serif; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#B08D57;">Bienvenue dans ton parcours 🌿</p>
              <h1 style="margin:0 0 20px; font-family: Georgia, serif; font-size:26px; color:#4C342E; font-weight:normal;">Bonjour <em style="color:#B08D57;">${safeName}</em>,</h1>

              <p style="margin:0 0 16px; font-family: Georgia, serif; font-size:15.5px; line-height:1.7; color:#4C342E;">
                Bravo, et merci pour ta confiance ! Ton bilan est prêt, et avec lui, la première vraie étape de ton parcours vient de commencer.
              </p>

              <p style="margin:0 0 16px; font-family: Georgia, serif; font-size:15.5px; line-height:1.7; color:#4C342E;">
                Je m'appelle <strong>Lindsay</strong>, je suis ta conseillère — c'est moi qui vais t'accompagner tout au long de ce programme. Tu as maintenant accès à ton espace personnel dans <strong>${brandName}</strong>, où tu retrouveras une cure pensée spécifiquement pour toi, ton alimentation adaptée à ton profil, ton programme sportif, et un suivi ultra-personnalisé au fil des semaines.
              </p>

              <p style="margin:0 0 24px; font-family: Georgia, serif; font-size:15.5px; line-height:1.7; color:#4C342E;">
                On ne se lâche pas en cours de route : tu bénéficies d'un <strong>accompagnement hebdomadaire</strong> avec moi, pour ajuster, encourager, et avancer ensemble.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EFE2D2; border-radius:14px; margin:0 0 28px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0; font-family: Georgia, serif; font-style:italic; font-size:14.5px; line-height:1.6; color:#4C342E;">
                      La prochaine étape, c'est qu'on valide ensemble ta cure lors d'un premier rendez-vous — c'est là que tout prend vraiment forme.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="border-radius:99px; background-color:#4C342E;">
                    <a href="${calendarLink}"
                       style="display:inline-block; padding:15px 30px; font-family: Arial, sans-serif; font-size:14.5px; font-weight:bold; color:#D9B978; text-decoration:none; border-radius:99px;">
                      📅 Prendre rendez-vous avec Lindsay
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px; font-family: Georgia, serif; font-size:15.5px; line-height:1.7; color:#4C342E;">
                Tu n'as pas besoin d'être parfaite pour commencer, juste besoin de faire ce premier pas — et tu viens de le faire. Je suis vraiment contente de t'accompagner sur ce chemin. 🌸
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 36px;">
              <p style="margin:0; font-family: Georgia, serif; font-style:italic; font-size:15px; color:#4C342E;">
                À très vite,<br>
                <strong style="font-style:normal;">Lindsay</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background-color:#EFE2D2; padding:18px 24px;">
              <p style="margin:0; font-family: Arial, sans-serif; font-size:11.5px; color:#8D6F3E;">${brandName} — Construis ta liberté 🌿</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function getUserFromToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}

/** Boîte qui reçoit l'alerte d'inscription (Scalyo, pas la conseillère). */
const NOTIF_TO = process.env.NOTIF_TO || "projet@scalyo-ai.com";

/**
 * Prévient Scalyo qu'une nouvelle utilisatrice vient de s'inscrire.
 *
 * Envoyée avant le mail de bienvenue et indépendamment de lui : l'inscription
 * a eu lieu même si le mail à l'utilisatrice échoue. Toute erreur est avalée,
 * une alerte ratée ne doit jamais gêner une inscription.
 */
async function previensScalyo(user, prenom, tenant) {
  const marque = (tenant && tenant.name) || DEFAULT_BRAND_NAME;
  const lignes = [
    ["Prénom", prenom || "non renseigné"],
    ["E-mail", user.email],
    ["Espace", marque],
    ["Inscrite le", new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })],
  ];
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [NOTIF_TO],
        reply_to: [user.email],
        subject: `Mon Cocon — nouvelle inscrite : ${prenom || user.email} (${marque})`,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;
                    max-width:520px;color:#4C342E;line-height:1.6">
  <h1 style="font-size:19px;margin:0 0 16px">Nouvelle inscription sur Mon Cocon</h1>
  <table style="border-collapse:collapse;font-size:14px">${lignes
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#8a7a6f;vertical-align:top">${k}</td>
             <td style="padding:4px 0"><strong>${v}</strong></td></tr>`
    )
    .join("")}</table>
  <p style="font-size:13px;color:#8a7a6f;margin:20px 0 0">
    Répondre à cet e-mail écrit directement à l'utilisatrice.
  </p>
</div>`,
      }),
    });
    if (!r.ok) console.error("Alerte inscription non envoyée:", r.status, await r.text());
  } catch (e) {
    console.error("Alerte inscription non envoyée:", e.message);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante : mail de bienvenue non envoyé.");
    // Non-bloquant côté client : on répond OK quand même pour ne pas gêner l'inscription
    return { statusCode: 200, body: JSON.stringify({ ok: false, skipped: true }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "Non authentifiée." }) };
  }
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const user = await getUserFromToken(accessToken);
  if (!user || !user.email) {
    return { statusCode: 401, body: JSON.stringify({ error: "Session invalide." }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const prenom = (body.firstname || "").trim();

  let tenant = null;
  try {
    const tenantId = await resolveUserTenantId(user.id);
    if (tenantId) {
      const tenantRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?select=name,logo_url,calendar_link&id=eq.${tenantId}`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const rows = tenantRes.ok ? await tenantRes.json() : [];
      tenant = rows[0] || null;
    }
  } catch (e) { console.error("Erreur résolution tenant (welcome email):", e); }

  // L'inscription est acquise à ce stade : on alerte Scalyo avant d'envoyer le
  // mail de bienvenue, pour être prévenu même si cet envoi-là échoue.
  await previensScalyo(user, prenom, tenant);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [user.email],
        subject: "Bienvenue dans ton parcours 🌿",
        html: welcomeEmailHtml(prenom, tenant)
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Erreur envoi mail de bienvenue (Resend):", errText);
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }
  } catch (e) {
    console.error("Erreur envoi mail de bienvenue (Resend):", e);
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
