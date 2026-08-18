import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Plus, X } from "lucide-react";

export default function TicketSettings() {
  const { data, refetch } = useQuery({ queryKey: ["ticket-config"], queryFn: async () => (await api.get("/tickets/config")).data });
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setCfg(data); }, [data]);
  if (!cfg) return <div className="text-slate-400">Loading...</div>;

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await api.put("/admin/tickets/config", cfg); toast.success("Settings saved"); refetch(); }
    catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Ticket Settings</h1><p className="text-slate-500 text-sm">Types, priorities & notification channels</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={save} disabled={saving} data-testid="save-ticket-config">{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save</Button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
        <div>
          <Label>Ticket Types</Label>
          <div className="space-y-2 mt-2">
            {cfg.types.map((t, i) => (
              <div key={i} className="flex gap-2"><Input value={t.name} onChange={(e) => set("types", cfg.types.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /><Button variant="ghost" size="icon" onClick={() => set("types", cfg.types.filter((_, xi) => xi !== i))}><X className="w-4 h-4" /></Button></div>
            ))}
            <Button variant="outline" size="sm" onClick={() => set("types", [...cfg.types, { name: "New Type", icon: "Circle" }])} data-testid="add-ticket-type"><Plus className="w-4 h-4 mr-1" /> Add Type</Button>
          </div>
        </div>

        <div>
          <Label>Priorities</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {cfg.priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-1 bg-vm-bg rounded px-2 py-1"><Input className="h-7 w-24 border-0 bg-transparent p-0" value={p} onChange={(e) => set("priorities", cfg.priorities.map((x, xi) => xi === i ? e.target.value : x))} /><button onClick={() => set("priorities", cfg.priorities.filter((_, xi) => xi !== i))}><X className="w-3 h-3" /></button></div>
            ))}
          </div>
        </div>

        <div>
          <Label>Notification Channels</Label>
          <p className="text-xs text-slate-400 mb-2">Enable channels for future customer notifications (WhatsApp/Email/SMS/in-app). Delivery is simulated in demo.</p>
          <div className="grid grid-cols-2 gap-2">
            {["whatsapp", "email", "sms", "inapp"].map((ch) => (
              <label key={ch} className="flex items-center justify-between border rounded-md px-3 py-2"><span className="text-sm capitalize">{ch === "inapp" ? "In-App" : ch}</span><Switch checked={!!cfg.channels?.[ch]} onCheckedChange={(v) => set("channels", { ...cfg.channels, [ch]: v })} data-testid={`channel-${ch}`} /></label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
