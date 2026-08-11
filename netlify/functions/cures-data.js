// Parse une ligne CSV en tenant compte des champs entre guillemets (avec virgules/retours à la ligne)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const { resolveCuresCsvUrl } = require("./lib/tenant-auth");

exports.handler = async function (event) {
  try {
    // Le catalogue de cures (prix, liens panier, feedbacks) est propre à chaque
    // conseillère : on résout son Google Sheet à partir du domaine appelant.
    // Cette fonction est appelée sans authentification, donc pas de token à
    // exploiter — le Host est la seule source d'identification du tenant.
    const host = (event && event.headers) ? (event.headers.host || event.headers.Host || "") : "";
    const csvUrl = await resolveCuresCsvUrl({ host });
    if (!csvUrl) {
      console.error("Aucun catalogue de cures configuré pour le host:", host);
      return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({ cures: {} })
      };
    }

    const res = await fetch(csvUrl);
    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Impossible de lire le tableau des cures." }) };
    }
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    const header = rows[0];
    const idx = (name) => header.indexOf(name);

    const iVariable = idx("Variable");
    const iProblematique = idx("Problématique");
    const iPack = idx("Pack");
    const iDuree = idx("Durée");
    const iDeclencheur = idx("Déclencheur bilan");
    const iProduits = idx("Produits");
    const iLien = idx("Lien panier");
    const iFeedback = idx("Feedback");
    const iPhotos = idx("Photos");
    const iPrix = idx("Prix");
    // Colonnes L et M : nom et description destinés aux clientes. "Problématique"
    // reste le critère clinique interne (matching + vue conseillère).
    const iNomCommercial = idx("Nom Commercial");
    const iDescription = idx("Description");

    const cures = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[iVariable]) continue;
      const key = row[iVariable].trim();
      const lien = (row[iLien] || "").trim();
      if (!key || !lien || lien === "—") continue;
      cures[key] = {
        problematique: (row[iProblematique] || "").trim(),
        nom_commercial: iNomCommercial >= 0 ? (row[iNomCommercial] || "").trim() : "",
        description: iDescription >= 0 ? (row[iDescription] || "").trim() : "",
        pack: (row[iPack] || "").trim(),
        duree: (row[iDuree] || "").trim(),
        declencheur: (row[iDeclencheur] || "").trim(),
        produits: (row[iProduits] || "").trim(),
        lien: (row[iLien] || "").trim(),
        feedback: (row[iFeedback] || "").trim(),
        photo: (row[iPhotos] || "").trim(),
        prix: (row[iPrix] || "").trim()
      };
    }

    return {
      statusCode: 200,
      // Vary: Host — la réponse dépend maintenant du tenant, donc du domaine
      // appelant. Sans ça, un cache partagé pourrait servir le catalogue (et
      // les prix) d'une conseillère aux clientes d'une autre.
      headers: { "Cache-Control": "public, max-age=120", Vary: "Host" },
      body: JSON.stringify({ cures })
    };
  } catch (e) {
    console.error("Erreur cures-data:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
