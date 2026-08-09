const webpush = require("web-push");

// Fallback en dur : voir send-hydration-reminder.js pour le contexte (bug de propagation
// des variables d'environnement Netlify rencontré lors de la mise en place initiale).
const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BNtC1YOP-O0ySUY8-JpDfvXnq7kSdSf2sgeMdiaQ6BHHEdQmKiIA9w_LrBS_i6CW-q1Cma3mejyqWif3CwjsHEs";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "IititExeaZKHiOy4OQIflSlCS9kI_N9xeFJhy3yT6hg";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:contact@ma-prevention-sante.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

exports.handler = async function () {
  // Ne s'exécute que le lundi, vers 9h heure de Paris (gère l'heure d'été/hiver automatiquement)
  const parisParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    hour12: false,
    weekday: "short"
  }).formatToParts(new Date());

  const parisHour = parseInt(parisParts.find(p => p.type === "hour").value, 10);
  const parisWeekday = parisParts.find(p => p.type === "weekday").value; // "Mon", "Tue", ...

  if (parisWeekday !== "Mon" || parisHour !== 9) {
    return { statusCode: 200, body: "Pas le bon moment (lundi 9h Paris uniquement)." };
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: "Variables d'environnement Supabase manquantes." };
  }

  const dbHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  const tenantsRes = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=id`, { headers: dbHeaders });
  if (!tenantsRes.ok) {
    return { statusCode: 500, body: `Erreur lecture tenants: ${tenantsRes.status}` };
  }
  const tenants = await tenantsRes.json();

  const payload = JSON.stringify({
    title: "📊 C'est l'heure de ton suivi",
    body: "Hey, prends 2 minutes pour noter ton poids et tes mensurations de la semaine 💛",
    type: "weekly-tracking",
    tag: "weekly-tracking-reminder"
  });

  let totalSent = 0;
  let totalSubs = 0;

  for (const tenant of tenants) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*&tenant_id=eq.${tenant.id}`,
      { headers: dbHeaders }
    );
    if (!res.ok) continue;
    const subscriptions = await res.json();
    totalSubs += subscriptions.length;

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await fetch(
                `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
                { method: "DELETE", headers: dbHeaders }
              );
            }
            throw err;
          })
      )
    );
    totalSent += results.filter((r) => r.status === "fulfilled").length;
  }

  return { statusCode: 200, body: `Envoyé à ${totalSent}/${totalSubs} abonnées (${tenants.length} tenant(s)).` };
};
