import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, Image as ImageIcon, Download, HardDriveDownload } from "lucide-react";

async function downloadBlob(path, filename) {
  try {
    const token = localStorage.getItem("vm_admin_token");
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Backup failed. Please check your connection and sign in again if needed.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Backup downloaded");
  } catch (error) { toast.error(error.message || "Backup failed"); }
}

export default function BackupSettings() {
  const { data: stats, isError } = useQuery({ queryKey: ["backup-stats"], queryFn: async () => (await api.get("/admin/backup/stats")).data });

  return (
    <div className="max-w-3xl">
      <div className="mb-6"><h1 className="font-heading text-2xl font-bold text-vm-ink">Backup & Migration</h1><p className="text-slate-500 text-sm">Download your complete database and uploaded files for a backup or move.</p></div>
      {isError && <p role="alert" className="text-sm text-red-600 mb-4">Backup statistics could not be loaded. Check your connection and administrator access.</p>}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4"><p className="text-2xl font-heading font-bold text-vm-ink">{stats?.total_records ?? "…"}</p><p className="text-xs text-slate-500">Database Records</p></div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4"><p className="text-2xl font-heading font-bold text-vm-ink">{stats?.image_count ?? "…"}</p><p className="text-xs text-slate-500">Uploaded Images</p></div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4"><p className="text-2xl font-heading font-bold text-vm-ink">{stats?.image_size_mb ?? "…"} MB</p><p className="text-xs text-slate-500">Image Storage</p></div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="w-11 h-11 rounded-lg bg-vm-green/10 text-vm-green grid place-items-center mb-3"><Database className="w-6 h-6" /></div>
          <h3 className="font-heading font-bold text-vm-ink">Database Backup</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Export every collection, including products, orders, quotations, customer prices, tickets, CMS content and settings.</p>
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => downloadBlob("/admin/backup/database", `vetmech-db-${Date.now()}.json`)} data-testid="backup-db"><Download className="w-4 h-4 mr-2" /> Download Database (JSON)</Button>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <div className="w-11 h-11 rounded-lg bg-vm-accent/10 text-vm-accent grid place-items-center mb-3"><ImageIcon className="w-6 h-6" /></div>
          <h3 className="font-heading font-bold text-vm-ink">Image Backup</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Download all uploaded product images, logos and documents as a single ZIP archive.</p>
          <Button className="bg-vm-accent hover:bg-[#0C8A4F]" onClick={() => downloadBlob("/admin/backup/images", `vetmech-images-${Date.now()}.zip`)} data-testid="backup-images"><HardDriveDownload className="w-4 h-4 mr-2" /> Download Images (ZIP)</Button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">Tip: schedule regular backups and store them securely off-site.</p>
    </div>
  );
}
