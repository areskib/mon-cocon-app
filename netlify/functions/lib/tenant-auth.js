const SUPABASE_URL = process.env.SUPABASE_URL || "https://gugioqxuwdktruibzisk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tenant utilisé quand le Host de la requête ne matche aucun tenants.domain
// (dev local, preview Netlify). À revoir si un 2e tenant est onboardé un jour.
const FALLBACK_TENANT_SLUG = "mon-cocon-lindsay";

function serviceHeaders() {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
}

async function resolveUserTenantId(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=tenant_id&id=eq.${userId}`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.length ? rows[0].tenant_id : null;
}

async function resolveTenantByHost(host) {
  const cleanHost = (host || "").split(":")[0].replace(/^www\./i, "").toLowerCase();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?select=id&domain=eq.${encodeURIComponent(cleanHost)}`,
    { headers: serviceHeaders() }
  );
  const rows = res.ok ? await res.json() : [];
  if (rows.length) return rows[0].id;

  const fallbackRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?select=id&slug=eq.${FALLBACK_TENANT_SLUG}`,
    { headers: serviceHeaders() }
  );
  const fallbackRows = fallbackRes.ok ? await fallbackRes.json() : [];
  return fallbackRows.length ? fallbackRows[0].id : null;
}

module.exports = { resolveUserTenantId, resolveTenantByHost, FALLBACK_TENANT_SLUG };
