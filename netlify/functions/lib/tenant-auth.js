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

// Droits admin d'un email : super-admin (accès global, via SUPER_ADMIN_EMAILS)
// ou admin d'un tenant précis (email présent dans tenants.admin_emails).
// { isSuperAdmin:false, tenantId:null } = pas admin du tout.
async function resolveAdminAccess(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return { isSuperAdmin: false, tenantId: null };

  const superAdmins = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (superAdmins.includes(normalized)) {
    return { isSuperAdmin: true, tenantId: null };
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=id,admin_emails`, { headers: serviceHeaders() });
  const rows = res.ok ? await res.json() : [];
  const tenant = rows.find(t => (t.admin_emails || []).some(e => (e || "").toLowerCase() === normalized));
  return tenant ? { isSuperAdmin: false, tenantId: tenant.id } : { isSuperAdmin: false, tenantId: null };
}

// Résout un user_id à partir d'un email via l'API Admin Supabase (fiable, ne
// dépend pas de quiz_results — un admin n'a pas forcément rempli le quiz).
async function resolveUserIdByEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const users = Array.isArray(data) ? data : (data.users || []);
  return users.length ? users[0].id : null;
}

// URL du Google Sheet des cures, propre à chaque tenant : chaque conseillère a
// sa propre copie du tableau (prix, liens panier, feedbacks, noms de cures).
// Résolue par tenantId quand il est connu, sinon par le Host de la requête
// (cures-data est appelée sans authentification depuis le client).
//
// Règle de sécurité : si le tenant est identifié mais n'a pas d'URL
// configurée, on renvoie null (catalogue vide) — JAMAIS l'URL d'un autre
// tenant. Le repli sur le tenant par défaut ne vaut que pour un host inconnu
// (dev local, preview Netlify).
async function resolveCuresCsvUrl({ tenantId, host }) {
  if (tenantId) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?select=cures_csv_url&id=eq.${tenantId}`,
      { headers: serviceHeaders() }
    );
    const rows = res.ok ? await res.json() : [];
    return rows.length ? (rows[0].cures_csv_url || null) : null;
  }

  const cleanHost = (host || "").split(":")[0].replace(/^www\./i, "").toLowerCase();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?select=cures_csv_url&domain=eq.${encodeURIComponent(cleanHost)}`,
    { headers: serviceHeaders() }
  );
  const rows = res.ok ? await res.json() : [];
  if (rows.length) return rows[0].cures_csv_url || null;

  const fallbackRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?select=cures_csv_url&slug=eq.${FALLBACK_TENANT_SLUG}`,
    { headers: serviceHeaders() }
  );
  const fallbackRows = fallbackRes.ok ? await fallbackRes.json() : [];
  return fallbackRows.length ? (fallbackRows[0].cures_csv_url || null) : null;
}

module.exports = {
  resolveUserTenantId,
  resolveTenantByHost,
  resolveAdminAccess,
  resolveUserIdByEmail,
  resolveCuresCsvUrl,
  FALLBACK_TENANT_SLUG
};
