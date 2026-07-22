const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.handler = async function () {
  // Ne fonctionne qu'entre 8h et 21h heure de Paris (gère l'heure d'été/hiver automatiquement)
  const parisHour = parseInt(
    new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()),
    10
  );
  if (parisHour < 8 || parisHour >= 21) {
    return { statusCode: 200, body: "Hors plage horaire (8h-21h Paris), rien envoyé." };
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: "Variables d'environnement Supabase manquantes." };
  }

  // Récupère tous les abonnements push
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`
    }
  });

  if (!res.ok) {
    return { statusCode: 500, body: `Erreur lecture Supabase: ${res.status}` };
  }

  const subscriptions = await res.json();

  const MESSAGES = [
    "Petit rappel : pense à bien t'hydrater 💧",
    "Prends un peu de temps pour toi et pense à bien t'hydrater 💧"
  ];
  const payload = JSON.stringify({
    title: "Mon Cocon 💧",
    body: MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        .catch(async (err) => {
          // Abonnement expiré ou révoqué → on le supprime pour ne pas réessayer inutilement
          if (err.statusCode === 404 || err.statusCode === 410) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
              {
                method: "DELETE",
                headers: {
                  apikey: SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${SERVICE_ROLE_KEY}`
                }
              }
            );
          }
          throw err;
        })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { statusCode: 200, body: `Envoyé à ${sent}/${subscriptions.length} abonnées.` };
};
