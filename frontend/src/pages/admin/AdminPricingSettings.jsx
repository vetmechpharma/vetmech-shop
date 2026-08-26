import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";

const TOGGLES = [
  ["require_approval", "Require admin approval for new registrations"],
  ["enable_otp", "Enable Mobile + OTP login"],
  ["enable_password_login", "Enable Mobile + Password login"],
  ["enable_customer_pricing", "Enable customer pricing engine (master switch)"],
  ["enable_category_pricing", "Enable customer-category pricing"],
  ["enable_customer_specific_pricing", "Enable customer-specific pricing"],
  ["enable_last_confirmed_pricing", "Enable last-confirmed-order pricing"],
  ["enable_price_protection", "Enable customer price protection"],
  ["allow_customer_price_override", "Allow admin to override customer price on orders"],
];

const BEHAVIORS = [
  { value: "keep_all", label: "Keep all customer-specific prices" },
  { value: "keep_protected", label: "Keep only protected customer prices" },
  { value: "reset_all", label: "Reset all to new category price" },
];

export default function AdminPricingSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pricing-settings"], queryFn: async () => (await api.get("/admin/pricing/settings")).data });
  const [form, setForm] = useState(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: async () => (await api.put("/admin/pricing/settings", form)).data,
    onSuccess: (r) => { qc.setQueryData(["pricing-settings"], r); toast.success("Pricing settings saved"); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading || !form) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2"><SlidersHorizontal className="w-6 h-6 text-vm-green" /><div><h1 className="font-heading text-2xl font-bold text-vm-ink">Pricing Engine</h1><p className="text-slate-500 text-sm">Accounts, login & pricing behaviour</p></div></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate()} disabled={save.isPending} data-testid="pricing-save">
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save
        </Button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#EEF2F1]">
        {TOGGLES.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-5 py-3.5">
            <Label className="text-sm text-vm-ink pr-4">{label}</Label>
            <Switch checked={form[key] !== false} onCheckedChange={(v) => set(key, v)} data-testid={`pricing-toggle-${key}`} />
          </div>
        ))}
        <div className="px-5 py-4">
          <Label className="text-sm text-vm-ink">Default behaviour when category price changes</Label>
          <Select value={form.price_change_behavior || "keep_protected"} onValueChange={(v) => set("price_change_behavior", v)}>
            <SelectTrigger className="mt-2" data-testid="pricing-behavior"><SelectValue /></SelectTrigger>
            <SelectContent>{BEHAVIORS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-slate-400 mt-2">Admins can still choose per change; this is the pre-selected option.</p>
        </div>
      </div>
    </div>
  );
}
