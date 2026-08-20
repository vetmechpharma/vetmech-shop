import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { QUOTE_STATUSES, inr } from "./quotationConstants";
import { FileText, Plus, TrendingUp, CheckCircle2, IndianRupee, Percent, Loader2 } from "lucide-react";

const KPI = ({ icon: Icon, label, value, from, to }) => (
  <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${from} ${to} shadow-sm`} data-testid={`qkpi-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-white/80 text-xs uppercase tracking-wide">{label}</p>
        <p className="font-heading text-2xl font-bold mt-1">{value}</p>
      </div>
      <Icon className="w-8 h-8 text-white/60" />
    </div>
  </div>
);

export default function QuotationDashboard() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["qtn-dashboard"], queryFn: async () => (await api.get("/admin/quotations/dashboard")).data });

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  const d = data || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Quotations</h1><p className="text-slate-500 text-sm">Overview of quotation activity & value</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => nav("/admin/quotations/new")} data-testid="qtn-new-btn"><Plus className="w-4 h-4 mr-2" /> New Quotation</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI icon={FileText} label="Total Quotes" value={d.total || 0} from="from-vm-green" to="to-emerald-600" />
        <KPI icon={TrendingUp} label="This Month" value={d.this_month || 0} from="from-blue-500" to="to-blue-600" />
        <KPI icon={IndianRupee} label="Total Value" value={inr(d.value)} from="from-indigo-500" to="to-indigo-700" />
        <KPI icon={Percent} label="Conversion" value={`${d.conversion_rate || 0}%`} from="from-amber-500" to="to-orange-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h3 className="font-heading font-semibold text-vm-ink mb-4">By Status</h3>
          <div className="space-y-2">
            {QUOTE_STATUSES.map((s) => (
              <button key={s.value} onClick={() => nav(`/admin/quotations/list?status=${s.value}`)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-vm-bg transition-colors" data-testid={`qstat-${s.value}`}>
                <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>
                <span className="font-semibold text-vm-ink">{d.counts?.[s.value] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h3 className="font-heading font-semibold text-vm-ink mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-vm-green" /> Top Customers</h3>
          {(d.top_customers || []).length === 0 ? <p className="text-slate-400 text-sm">No data yet</p> : (
            <div className="space-y-2">
              {(d.top_customers || []).map((c, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-vm-bg">
                  <span className="text-sm text-vm-ink truncate">{c.name}</span>
                  <span className="text-xs text-vm-accent font-medium">{c.value} quote{c.value > 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-[#EEF2F1]">
            <p className="text-xs text-slate-500">Accepted Value</p>
            <p className="font-heading text-xl font-bold text-vm-green">{inr(d.accepted_value)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
