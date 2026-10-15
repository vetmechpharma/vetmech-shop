import { AxiosError } from "axios";
import { zipSync, strToU8 } from "fflate";
import { createDemoEngine, DemoError } from "./engine.mjs";

let engine;
export function demoEngine() {
  if (!engine) engine = createDemoEngine(window.localStorage);
  return engine;
}

export function makeDemoPdf(lines) {
  const text = lines.slice(0, 40).map(line => String(line).replace(/[^\x20-\x7E]/g, " ").replace(/([\\()])/g, "\\$1"));
  const stream = `BT /F1 11 Tf 48 790 Td 17 TL ${text.map((line, i) => `${i ? "T* " : ""}(${line}) Tj`).join("\n")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

async function uploadedFile(body) {
  const file = body?.get?.("file");
  if (!file || !file.size) throw new DemoError(400, "Choose a file.");
  if (file.size > 2 * 1024 * 1024) throw new DemoError(400, "Use a sample file smaller than 2 MB in the browser demo.");
  const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return { url, filename: file.name };
}

export function installDemoAdapter(api) {
  window.document?.documentElement?.classList.add("vm-demo-active");
  const originalFetch = window.fetch.bind(window);
  api.defaults.adapter = async config => {
    try {
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data || {};
      const token = (config.headers?.get?.("Authorization") || config.headers?.Authorization || "").replace(/^Bearer /, "");
      const path = new URL(config.url, window.location.origin).pathname;
      let data = ["/admin/upload", "/careers/upload-resume"].includes(path) ? await uploadedFile(body) : await demoEngine().handle({ method: config.method, path: config.url, params: config.params, body, token });
      if (data?.demo_pdf) data = makeDemoPdf(data.demo_pdf);
      return { data, status: 200, statusText: "OK", headers: { "x-vetmech-mode": "demo" }, config, request: {} };
    } catch (error) {
      throw new AxiosError(error.message, "ERR_DEMO_REQUEST", config, {}, { data: { detail: error.message }, status: error.status || 500, statusText: "Demo request failed", headers: {}, config });
    }
  };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.origin);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
    const token = new Headers(init.headers || (input instanceof Request ? input.headers : {})).get("Authorization")?.replace(/^Bearer /, "") || "";
    try {
      if (url.pathname === "/api/admin/backup/images") {
        if (token !== "demo-admin") throw new DemoError(401, "Enter the admin demo.");
        const files = { "README.txt": strToU8("VETMECH development demo assets. Sample catalogue illustrations only.") };
        for (const name of ["logo.svg", "hero.svg", "product-1.svg", "product-2.svg", "product-3.svg", "product-4.svg"]) {
          const response = await originalFetch(`/demo/${name}`);
          if (!response.ok) throw new Error("Demo asset was unavailable.");
          files[name] = new Uint8Array(await response.arrayBuffer());
        }
        return new Response(zipSync(files), { headers: { "Content-Type": "application/zip" } });
      }
      const data = await demoEngine().handle({ method: init.method || "GET", path: url.pathname + url.search, token, body: init.body ? JSON.parse(init.body) : {} });
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } catch (error) { return new Response(JSON.stringify({ detail: error.message }), { status: error.status || 500, headers: { "Content-Type": "application/json" } }); }
  };
}
