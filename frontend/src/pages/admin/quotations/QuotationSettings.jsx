import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Save } from "lucide-react";

export default function QuotationSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["qtn-settings"], queryFn: async () => (await api.get("/admin/settings/quotation")).data });
  const [form, setForm] = useState({ prefix: "VMP/QTN", digits: 5, start: 1, default_validity: 15, terms: [] });

  useEffect(() => {
    if (data) setForm({ prefix: data.prefix || "VMP/QTN", digits: data.digits || 5, start: data.start || 1, default_validity: data.default_validity || 15, terms: data.terms || [] });
  }, [data]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: async () => (await api.put("/admin/settings/quotation", { ...form, digits: Number(form.digits), start: Number(form.start), default_validity: Number(form.default_validity) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qtn-settings"] }); toast.success("Settings saved"); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Quotation Settings</h1><p className="text-slate-500 text-sm">Numbering & default terms</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending} data-testid="qtn-settings-save">{save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save</Button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-5 grid sm:grid-cols-2 gap-4">
        <div><Label>Number Prefix</Label><Input value={form.prefix} onChange={(e) => set("prefix", e.target.value)} className="mt-1" data-testid="qtn-set-prefix" /><p className="text-xs text-slate-400 mt-1">e.g. {form.prefix}/{new Date().getFullYear()}/{String(form.start).padStart(Number(form.digits) || 5, "0")}</p></div>
        <div><Label>Default Validity (days)</Label><Input type="number" value={form.default_validity} onChange={(e) => set("default_validity", e.target.value)} className="mt-1" data-testid="qtn-set-validity" /></div>
        <div><Label>Sequence Digits</Label><Input type="number" value={form.digits} onChange={(e) => set("digits", e.target.value)} className="mt-1" data-testid="qtn-set-digits" /></div>
        <div><Label>Start Number</Label><Input type="number" value={form.start} onChange={(e) => set("start", e.target.value)} className="mt-1" data-testid="qtn-set-start" /></div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-vm-ink">Default Terms & Conditions</h3>
          <Button variant="outline" size="sm" onClick={() => set("terms", [...form.terms, ""])} data-testid="qtn-add-term"><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {form.terms.map((t, i) => (
            <div key={i} className="flex gap-2">
              <Input value={t} onChange={(e) => set("terms", form.terms.map((x, idx) => idx === i ? e.target.value : x))} data-testid={`qtn-set-term-${i}`} />
              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => set("terms", form.terms.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          {form.terms.length === 0 && <p className="text-sm text-slate-400">No default terms. These auto-fill on new quotations.</p>}
        </div>
      </div>
    </div>
  );
}
