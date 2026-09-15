import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { api, mediaUrl } from "@/lib/api";
import { FileDown } from "lucide-react";

export default function CatalogButton() {
  const { data: website } = useSettings("website");
  const url = website?.catalog_url;
  if (!url) return null;
  const label = website?.catalog_label || "Download Catalog";
  const track = () => { try { api.post("/catalog/track", { page: window.location.pathname }); } catch (e) { /* non-blocking */ } };
  return (
    <a href={mediaUrl(url)} target="_blank" rel="noreferrer" onClick={track} data-testid="catalog-download-btn"
      className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-vm-green hover:bg-vm-greenhover text-white shadow-lg rounded-l-lg px-2.5 py-4 flex-col items-center gap-2 transition-colors">
      <FileDown className="w-4 h-4" />
      <span className="text-xs font-semibold tracking-wide" style={{ writingMode: "vertical-rl" }}>{label}</span>
    </a>
  );
}
