import * as XLSX from "xlsx";

export function exportRows(rows, filename, type = "csv") {
  if (!rows || rows.length === 0) { return; }
  if (type === "pdf") {
    const cols = Object.keys(rows[0]);
    const w = window.open("", "_blank");
    const html = `<html><head><title>${filename}</title><style>
      body{font-family:sans-serif;padding:24px} h2{color:#045D3A}
      table{width:100%;border-collapse:collapse;font-size:12px} th{background:#F4F7F5;text-align:left}
      th,td{border:1px solid #E2E8F0;padding:6px}</style></head><body>
      <h2>VETMECH — ${filename}</h2>
      <table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    w.document.write(html); w.document.close();
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.${type === "xlsx" ? "xlsx" : "csv"}`, { bookType: type === "xlsx" ? "xlsx" : "csv" });
}
