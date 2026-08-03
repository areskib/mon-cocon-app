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

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzd8QyWoYL9HvW7ZMYFTbfv-BF1Y430m-J0t4sCYZ8TzKuSUTkwuyDDqFNw0f4lSijJakWI1m2vZL5/pub?gid=741790958&single=true&output=csv";

exports.handler = async function () {
  try {
    const res = await fetch(CSV_URL);
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

    const cures = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[iVariable]) continue;
      const key = row[iVariable].trim();
      const lien = (row[iLien] || "").trim();
      if (!key || !lien || lien === "—") continue;
      cures[key] = {
        problematique: (row[iProblematique] || "").trim(),
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
      headers: { "Cache-Control": "public, max-age=120" },
      body: JSON.stringify({ cures })
    };
  } catch (e) {
    console.error("Erreur cures-data:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
