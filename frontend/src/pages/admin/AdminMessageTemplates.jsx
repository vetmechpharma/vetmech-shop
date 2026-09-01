import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquareText, Loader2, Save } from "lucide-react";

export default function AdminMessageTemplates() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState({});
  const { data, isLoading } = useQuery({ queryKey: ["message-templates"], queryFn: async () => (await api.get("/admin/message-templates")).data });

  useEffect(() => {
    if (data?.templates) {
      const d = {};
      Object.entries(data.templates).forEach(([k, v]) => { d[k] = v.body; });
      setDrafts(d);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const templates = {};
      Object.entries(drafts).forEach(([k, body]) => { templates[k] = { body }; });
      return (await api.put("/admin/message-templates", { templates })).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["message-templates"] }); toast.success("Templates saved"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const placeholders = data?.placeholders || [];
  const insertPlaceholder = (key, ph) => setDrafts((d) => ({ ...d, [key]: (d[key] || "") + " " + ph }));

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;

  return (
    <div className="max-w-3xl" data-testid="message-templates-page">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-vm-green/10 grid place-items-center"><MessageSquareText className="w-5 h-5 text-vm-green" /></div>
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Message Templates</h1><p className="text-slate-500 text-sm">Editable WhatsApp / notification messages sent to customers</p></div>
      </div>

      <div className="bg-vm-bg border border-[#E2E8F0] rounded-lg p-4 mb-5">
        <p className="text-sm text-slate-600 mb-2 font-medium">Available placeholders (click to insert into the focused template):</p>
        <div className="flex flex-wrap gap-2">
          {placeholders.map((p) => <span key={p} className="text-xs font-mono bg-white border border-vm-border rounded px-2 py-1 text-vm-green">{p}</span>)}
        </div>
      </div>

      <div className="space-y-5">
        {Object.entries(data?.templates || {}).map(([key, tpl]) => (
          <div key={key} className="bg-white border border-[#E2E8F0] rounded-xl p-5" data-testid={`tpl-${key}`}>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-heading font-semibold text-vm-ink">{tpl.label}</Label>
              <div className="flex flex-wrap gap-1">
                {placeholders.map((p) => (
                  <button key={p} type="button" onClick={() => insertPlaceholder(key, p)} className="text-[10px] font-mono bg-vm-green/10 text-vm-green rounded px-1.5 py-0.5 hover:bg-vm-green/20" data-testid={`tpl-${key}-insert-${p.replace(/[{}]/g, "")}`}>{p}</button>
                ))}
              </div>
            </div>
            <Textarea rows={3} value={drafts[key] ?? tpl.body} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} data-testid={`tpl-${key}-body`} />
          </div>
        ))}
      </div>

      <Button className="mt-6 bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-templates">
        {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Templates
      </Button>
    </div>
  );
}
