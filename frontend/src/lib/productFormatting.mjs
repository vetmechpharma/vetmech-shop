// Layout helpers preserve the supplied wording, quantities and units.
export function compositionGroups(value) {
  if (/<\/?[a-z][^>]*>/i.test(String(value || ""))) return [];
  const groups = [];
  let group = { title: "", intro: [], rows: [], notes: [] }, pending = [];
  const flush = () => { group.notes.push(...pending); pending = []; if (group.title || group.intro.length || group.rows.length || group.notes.length) groups.push(group); };
  for (const line of String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (/^(?:vial|bottle|ampoule|part)\s+[a-z0-9]+\b/i.test(line)) {
      flush(); group = { title: line, intro: [], rows: [], notes: [] };
    } else if (/^each\b.*\bcontains\s*:?$/i.test(line)) {
      group.intro.push(line);
    } else {
      const match = line.match(/^(.+?)\s*(?:\.{3,}|\t+)\s*(.+)$/);
      if (match) { group.rows.push({ label: [...pending, match[1].trim()].join(" "), value: match[2].trim() }); pending = []; }
      else pending.push(line);
    }
  }
  flush();
  return groups.some(group => group.rows.length) ? groups : [];
}

export function labelledLines(value) {
  if (/<\/?[a-z][^>]*>/i.test(String(value || ""))) return [];
  const lines = String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows = lines.map(line => { const match = line.match(/^([^:]{1,90}):\s*(.+)$/); return match ? { label: match[1].trim(), value: match[2].trim() } : null; });
  return rows.length && rows.every(Boolean) ? rows : [];
}

export function safeContentUrl(value, image = false) {
  const url = String(value || "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://content.invalid");
    return (image ? ["http:", "https:"] : ["http:", "https:", "mailto:", "tel:"]).includes(parsed.protocol) ? url : null;
  } catch { return null; }
}

export function productImages(product, variant) {
  const variantImages = variant ? variant.images || [] : (product?.variants || []).flatMap(value => value.images || []);
  const images = variant ? [...variantImages, ...(product?.images || []), product?.image] : [...(product?.images || []), product?.image, ...variantImages];
  return [...new Set(images.filter(image => typeof image === "string" && image.trim()))];
}
