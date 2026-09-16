import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, Copy, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Stat = ({ label, value, tone = "ink", testid }) => (
  <div className="border border-[#E2E8F0] rounded-lg p-4 bg-white" data-testid={testid}>
    <p className={`text-2xl font-bold ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-green-600" : "text-vm-ink"}`}>{value}</p>
    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
  </div>
);

export default function AdminSeoAudit() {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["seo-audit"], queryFn: async () => (await api.get("/admin/seo/audit")).data });
  const autofill = useMutation({
    mutationFn: async () => (await api.post("/admin/seo/autofill-all")).data,
    onSuccess: (d) => { toast.success(`Auto-filled SEO for ${d.updated} product(s)`); refetch(); },
    onError: () => toast.error("Auto-fill failed"),
  });

  if (isLoading) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  const s = data?.summary || {};

  return (
    <div data-testid="seo-audit-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-vm-ink">SEO Health Check</h1>
          <p className="text-slate-500 text-sm">Missing titles, duplicate descriptions and missing schema across your catalog.</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => autofill.mutate()} disabled={autofill.isPending} data-testid="seo-autofill-all">
            {autofill.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Auto-fill missing SEO
          </Button>
          <Button variant="outline" onClick={() => refetch()} data-testid="seo-audit-refresh">
            {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Re-scan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Products OK" value={s.products_ok ?? 0} tone="green" testid="stat-ok" />
        <Stat label="Products with issues" value={s.products_with_issues ?? 0} tone={s.products_with_issues ? "amber" : "green"} testid="stat-issues" />
        <Stat label="Duplicate titles" value={s.duplicate_titles ?? 0} tone={s.duplicate_titles ? "red" : "green"} testid="stat-dup-titles" />
        <Stat label="Duplicate descriptions" value={s.duplicate_descriptions ?? 0} tone={s.duplicate_descriptions ? "red" : "green"} testid="stat-dup-desc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6 text-sm">
        <div className="border border-[#E2E8F0] rounded-lg p-3 bg-vm-bg/40">
          <p className="font-semibold text-vm-ink mb-1">Sitemap</p>
          <a href={s.sitemap} target="_blank" rel="noreferrer" className="text-vm-green break-all hover:underline">{s.sitemap}</a>
        </div>
        <div className="border border-[#E2E8F0] rounded-lg p-3 bg-vm-bg/40">
          <p className="font-semibold text-vm-ink mb-1">Google Merchant Feed (MRP)</p>
          <a href={s.feed} target="_blank" rel="noreferrer" className="text-vm-green break-all hover:underline">{s.feed}</a>
        </div>
      </div>

      {/* Product issues */}
      <div className="border border-[#E2E8F0] rounded-lg bg-white mb-6">
        <div className="px-4 py-3 border-b font-heading font-semibold text-vm-ink">Products needing attention ({(data?.products || []).length})</div>
        {(data?.products || []).length === 0 ? (
          <div className="p-6 text-center text-green-600 flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5" /> All active products have complete SEO.</div>
        ) : (
          <div className="divide-y">
            {data.products.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-4" data-testid={`audit-product-${p.slug}`}>
                <div>
                  <Link to="/admin/products" className="font-medium text-vm-ink hover:text-vm-green">{p.name}</Link>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {p.issues.map((i) => (
                      <span key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {i}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`text-sm font-bold shrink-0 ${p.score >= 80 ? "text-green-600" : p.score >= 50 ? "text-amber-600" : "text-red-600"}`}>{p.score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(data?.duplicate_titles?.length > 0 || data?.duplicate_descriptions?.length > 0) && (
        <div className="border border-[#E2E8F0] rounded-lg bg-white mb-6">
          <div className="px-4 py-3 border-b font-heading font-semibold text-vm-ink flex items-center gap-2"><Copy className="w-4 h-4" /> Duplicates</div>
          <div className="p-4 space-y-3 text-sm">
            {(data.duplicate_titles || []).map((d, i) => (
              <div key={`t${i}`}><span className="text-red-600 font-medium">Duplicate title:</span> "{d.value}" — <span className="text-slate-500">{d.products.join(", ")}</span></div>
            ))}
            {(data.duplicate_descriptions || []).map((d, i) => (
              <div key={`d${i}`}><span className="text-red-600 font-medium">Duplicate description:</span> "{d.value.slice(0, 60)}…" — <span className="text-slate-500">{d.products.join(", ")}</span></div>
            ))}
          </div>
        </div>
      )}

      {(data?.categories?.length > 0 || data?.news?.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="border border-[#E2E8F0] rounded-lg bg-white">
            <div className="px-4 py-3 border-b font-heading font-semibold text-vm-ink">Categories ({(data.categories || []).length})</div>
            <div className="p-4 space-y-2 text-sm">{(data.categories || []).map((c, i) => <div key={i}>{c.name} — <span className="text-amber-700">{c.issues.join(", ")}</span></div>)}
              {(data.categories || []).length === 0 && <p className="text-green-600">All good.</p>}</div>
          </div>
          <div className="border border-[#E2E8F0] rounded-lg bg-white">
            <div className="px-4 py-3 border-b font-heading font-semibold text-vm-ink">News ({(data.news || []).length})</div>
            <div className="p-4 space-y-2 text-sm">{(data.news || []).map((n, i) => <div key={i}>{n.name} — <span className="text-amber-700">{n.issues.join(", ")}</span></div>)}
              {(data.news || []).length === 0 && <p className="text-green-600">All good.</p>}</div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-4">Guidance only — helps you complete on-page SEO. Google does not use these exact checks.</p>
    </div>
  );
}
