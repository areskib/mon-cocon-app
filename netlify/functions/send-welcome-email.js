const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_uZVRKxk0FOjuTFhGGFLGwQ_ktAqXHC5";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Lindsay - Mon Cocon <contact@ma-prevention-sante.com>";

function welcomeEmailHtml(prenom){
  const safeName = prenom || "";
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
              <img src="https://ma-prevention-sante.com/images/logo.png" width="64" height="64" alt="Mon Cocon" style="border-radius:14px; display:block; margin:0 auto 10px;">
              <span style="color:#D9B978; font-family: Georgia, serif; font-size:20px; letter-spacing:0.5px;">Mon Cocon</span>
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
                Je m'appelle <strong>Lindsay</strong>, je suis ta conseillère — c'est moi qui vais t'accompagner tout au long de ce programme. Tu as maintenant accès à ton espace personnel dans <strong>Mon Cocon</strong>, où tu retrouveras une cure pensée spécifiquement pour toi, ton alimentation adaptée à ton profil, ton programme sportif, et un suivi ultra-personnalisé au fil des semaines.
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
                    <a href="https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ183gUyUguqRr3Q9X29SXDjzezae2e3IhJ2cdalzuf5yAenlswLd5BCt6ORHpElrNCYEwQFw1rT"
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
              <p style="margin:0; font-family: Arial, sans-serif; font-size:11.5px; color:#8D6F3E;">Mon Cocon — Construis ta liberté 🌿</p>
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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [user.email],
        subject: "Bienvenue dans ton parcours 🌿",
        html: welcomeEmailHtml(prenom)
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
