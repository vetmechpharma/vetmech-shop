import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { Loader2, Save, Plus, X } from "lucide-react";

function useSettingForm(id) {
  const { data, refetch } = useQuery({ queryKey: ["admin-setting", id], queryFn: async () => (await api.get(`/admin/settings/${id}`)).data });
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await api.put(`/admin/settings/${id}`, form); toast.success("Settings saved"); refetch(); }
    catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };
  return { form, set, setForm, save, saving };
}

const Wrap = ({ title, subtitle, children, onSave, saving }) => (
  <div>
    <div className="flex items-center justify-between mb-6">
      <div><h1 className="font-heading text-2xl font-bold text-vm-ink">{title}</h1>{subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}</div>
      <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={onSave} disabled={saving} data-testid="save-settings">{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save</Button>
    </div>
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 max-w-3xl space-y-4">{children}</div>
  </div>
);
const F = ({ label, value, onChange, textarea, ...p }) => (
  <div><Label>{label}</Label>{textarea ? <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} {...p} /> : <Input value={value || ""} onChange={(e) => onChange(e.target.value)} {...p} />}</div>
);

export function CompanySettings() {
  const { form, set, save, saving } = useSettingForm("company");
  const social = form.social || {};
  const setSocial = (k, v) => set("social", { ...social, [k]: v });
  return (
    <Wrap title="Company Settings" subtitle="Business identity & contact info" onSave={save} saving={saving}>
      <F label="Company Name" value={form.name} onChange={(v) => set("name", v)} />
      <F label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
      <ImageUpload label="Logo" value={form.logo} onChange={(v) => set("logo", v)} />
      <F label="Address" value={form.address} onChange={(v) => set("address", v)} textarea />
      <div className="grid sm:grid-cols-2 gap-4">
        <F label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
        <F label="WhatsApp Number (with country code)" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />
        <F label="Email" value={form.email} onChange={(v) => set("email", v)} />
        <F label="GST Number" value={form.gst_number} onChange={(v) => set("gst_number", v)} />
      </div>
      <F label="Business Hours" value={form.business_hours} onChange={(v) => set("business_hours", v)} />
      <div className="grid sm:grid-cols-2 gap-4">
        {["facebook", "instagram", "linkedin", "youtube"].map((s) => <F key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} value={social[s]} onChange={(v) => setSocial(s, v)} />)}
      </div>
    </Wrap>
  );
}

export function WhatsAppSettings() {
  const { form, set, save, saving } = useSettingForm("whatsapp");
  const nums = form.admin_numbers || [];
  const [testNum, setTestNum] = useState("");
  const [testing, setTesting] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["wa-status"],
    queryFn: async () => (await api.get("/admin/whatsapp/status")).data,
    refetchInterval: 15000,
  });

  const live = !!(form.api_key && form.session_id);
  const webhookUrl = `${process.env.REACT_APP_BACKEND_URL}/api/whatsapp/webhook${form.webhook_token ? `?token=${form.webhook_token}` : ""}`;
  const connected = status?.connected;
  const sendOnly = status?.status === "send_only";
  const dot = status?.status === "error" ? "bg-red-500" : sendOnly ? "bg-sky-500" : connected ? "bg-green-500" : "bg-amber-500";
  const statusLabel = !status ? "Checking…" : !status.configured ? "Not configured" : sendOnly ? "Active (send-only key)" : status.status || (connected ? "connected" : "disconnected");

  const sendTest = async () => {
    if (!testNum.trim()) return toast.error("Enter a number to test");
    setTesting(true);
    try {
      const { data } = await api.post("/admin/whatsapp/test", { to: testNum });
      if (data.status === "sent") toast.success(`Test sent (id ${data.message_id || "ok"})`);
      else if (data.status === "simulated") toast.info("Simulated — add API Key + Session and Save first");
      else toast.error(`Failed: ${data.error || "unknown"}`);
    } catch (e) { toast.error(apiError(e)); }
    setTesting(false);
  };

  return (
    <Wrap title="WhatsApp Settings" subtitle="wa.animitra.in API configuration & live session status" onSave={save} saving={saving}>
      <div className="rounded-lg border p-4 flex items-center justify-between flex-wrap gap-3" data-testid="wa-status-card">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${dot} ${connected ? "" : "animate-pulse"}`} />
          <div>
            <p className="font-heading font-semibold text-vm-ink">Session: <span className="capitalize" data-testid="wa-status-label">{statusLabel}</span></p>
            <p className="text-xs text-slate-500">{status?.phone ? `Number: +${status.phone}${status.name ? " · " + status.name : ""}` : status?.note ? status.note : status?.error ? status.error : live ? "Waiting for session…" : "Add API Key + Session ID below to go live"}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${live ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{live ? "LIVE MODE" : "SIMULATED"}</span>
      </div>

      {status?.has_qr && status?.qr && (
        <div className="rounded-lg border border-vm-green/30 bg-vm-green/5 p-4 text-center" data-testid="wa-qr-card">
          <p className="text-sm font-medium text-vm-ink mb-2">Session needs linking — open WhatsApp → Linked Devices → Link a device, and scan:</p>
          <img src={status.qr} alt="WhatsApp QR" className="w-48 h-48 mx-auto rounded bg-white p-2 border" />
          {status.pairing_code && <p className="text-xs mt-2 text-slate-600">Or enter pairing code: <b className="font-mono">{status.pairing_code}</b></p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <F label="API Base URL" value={form.api_url} onChange={(v) => set("api_url", v)} placeholder="https://wa.animitra.in" data-testid="wa-api-url" />
        <F label="API Key" value={form.api_key} onChange={(v) => set("api_key", v)} type="password" data-testid="wa-api-key" />
        <F label="Session" value={form.session_id} onChange={(v) => set("session_id", v)} placeholder="primary" data-testid="wa-session" />
      </div>

      <div>
        <Label>Admin Notification Numbers</Label>
        {nums.map((n, i) => (
          <div key={i} className="flex gap-2 mt-2"><Input value={n} onChange={(e) => set("admin_numbers", nums.map((x, xi) => xi === i ? e.target.value : x))} data-testid={`wa-admin-num-${i}`} /><Button variant="ghost" size="icon" onClick={() => set("admin_numbers", nums.filter((_, xi) => xi !== i))}><X className="w-4 h-4" /></Button></div>
        ))}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => set("admin_numbers", [...nums, ""])} data-testid="wa-add-num"><Plus className="w-4 h-4 mr-1" /> Add Number</Button>
      </div>

      <div><Label>OTP Template</Label><Input value={form.otp_template || ""} onChange={(e) => set("otp_template", e.target.value)} /></div>

      <p className="text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded p-2.5">Order / status / dispatch / out-of-stock messages are edited under <b>Communications → Message Templates</b>. Save your API Key &amp; Session here first, then send a test below.</p>

      <div className="rounded-lg border border-[#E2E8F0] p-4 space-y-2">
        <Label>Incoming Message Webhook</Label>
        <p className="text-xs text-slate-500">Paste this URL into your wa.animitra.in <b>Webhooks</b> page. Incoming customer replies auto-create/append CRM tickets (type "WhatsApp").</p>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs bg-slate-50" data-testid="wa-webhook-url" onFocus={(e) => e.target.select()} />
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Webhook URL copied"); }} data-testid="wa-webhook-copy">Copy</Button>
        </div>
        <F label="Webhook Secret (optional — appended as ?token=)" value={form.webhook_token} onChange={(v) => set("webhook_token", v)} data-testid="wa-webhook-token" placeholder="Leave blank for no token check" />
      </div>

      <div>
        <Label>Send Test Message</Label>
        <div className="flex gap-2 mt-1">
          <Input placeholder="9198xxxxxxxx" value={testNum} onChange={(e) => setTestNum(e.target.value)} data-testid="wa-test-num" />
          <Button variant="outline" onClick={sendTest} disabled={testing} data-testid="wa-test-send">{testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send Test</Button>
        </div>
      </div>
    </Wrap>
  );
}

export function SmtpSettings() {
  const { form, set, save, saving } = useSettingForm("smtp");
  return (
    <Wrap title="Email / SMTP Settings" subtitle="Email config (simulated until credentials added)" onSave={save} saving={saving}>
      <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded p-2">SIMULATED MODE: Emails are logged. Add SMTP host & credentials to send real emails.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <F label="SMTP Host" value={form.host} onChange={(v) => set("host", v)} />
        <F label="SMTP Port" value={form.port} onChange={(v) => set("port", v)} />
        <F label="Username" value={form.username} onChange={(v) => set("username", v)} />
        <F label="Password" value={form.password} onChange={(v) => set("password", v)} type="password" />
        <F label="Sender Name" value={form.sender_name} onChange={(v) => set("sender_name", v)} />
        <F label="Sender Email" value={form.sender_email} onChange={(v) => set("sender_email", v)} />
        <F label="Admin Email" value={form.admin_email} onChange={(v) => set("admin_email", v)} />
      </div>
    </Wrap>
  );
}

export function SeoSettings() {
  const { form, set, save, saving } = useSettingForm("seo");
  return (
    <Wrap title="SEO Settings" subtitle="Default SEO metadata" onSave={save} saving={saving}>
      <F label="Default SEO Title" value={form.default_title} onChange={(v) => set("default_title", v)} />
      <F label="Default Meta Description" value={form.default_description} onChange={(v) => set("default_description", v)} textarea />
      <F label="Default Keywords" value={form.default_keywords} onChange={(v) => set("default_keywords", v)} />
      <ImageUpload label="Default OG Image" value={form.default_og_image} onChange={(v) => set("default_og_image", v)} />
      <F label="Robots" value={form.robots} onChange={(v) => set("robots", v)} placeholder="index, follow" />
    </Wrap>
  );
}

export function HomepageSettings() {
  const { form, set, save, saving } = useSettingForm("homepage");
  const { data: prods } = useQuery({ queryKey: ["hp-products"], queryFn: async () => (await api.get("/admin/products", { params: { limit: 200 } })).data });
  const hero = form.hero || {}, intro = form.intro || {}, quality = form.quality || {}, cta = form.cta || {};
  const featIds = form.featured_product_ids || [];
  return (
    <Wrap title="Homepage Content" subtitle="Edit homepage sections" onSave={save} saving={saving}>
      <h3 className="font-heading font-bold text-vm-ink">Hero Banner</h3>
      <F label="Hero Title" value={hero.title} onChange={(v) => set("hero", { ...hero, title: v })} />
      <F label="Hero Subtitle" value={hero.subtitle} onChange={(v) => set("hero", { ...hero, subtitle: v })} textarea />
      <ImageUpload label="Hero Image" value={hero.image} onChange={(v) => set("hero", { ...hero, image: v })} />
      <div className="grid sm:grid-cols-2 gap-4"><F label="CTA Text" value={hero.cta_text} onChange={(v) => set("hero", { ...hero, cta_text: v })} /><F label="CTA Link" value={hero.cta_link} onChange={(v) => set("hero", { ...hero, cta_link: v })} /></div>
      <hr /><h3 className="font-heading font-bold text-vm-ink">Introduction</h3>
      <F label="Intro Title" value={intro.title} onChange={(v) => set("intro", { ...intro, title: v })} />
      <F label="Intro Text" value={intro.text} onChange={(v) => set("intro", { ...intro, text: v })} textarea rows={4} />
      <hr /><h3 className="font-heading font-bold text-vm-ink">Quality Section</h3>
      <F label="Quality Title" value={quality.title} onChange={(v) => set("quality", { ...quality, title: v })} />
      <F label="Quality Text" value={quality.text} onChange={(v) => set("quality", { ...quality, text: v })} textarea />
      <ImageUpload label="Quality Image" value={quality.image} onChange={(v) => set("quality", { ...quality, image: v })} />
      <hr /><h3 className="font-heading font-bold text-vm-ink">Featured Products (Homepage)</h3>
      <p className="text-xs text-slate-400 -mt-2">Select products to feature. If none selected, products with the FEATURED badge are shown.</p>
      <div className="grid sm:grid-cols-2 gap-1 max-h-52 overflow-y-auto border rounded-md p-2">
        {(prods?.items || []).map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm py-0.5">
            <input type="checkbox" checked={featIds.includes(p.id)} data-testid={`feat-${p.id}`}
              onChange={(e) => set("featured_product_ids", e.target.checked ? [...featIds, p.id] : featIds.filter((x) => x !== p.id))} />
            {p.name}
          </label>
        ))}
      </div>
      <hr /><h3 className="font-heading font-bold text-vm-ink">Bottom CTA</h3>
      <F label="CTA Title" value={cta.title} onChange={(v) => set("cta", { ...cta, title: v })} />
      <F label="CTA Text" value={cta.text} onChange={(v) => set("cta", { ...cta, text: v })} textarea />
    </Wrap>
  );
}

export function WebsiteSettings() {
  const { form, set, save, saving } = useSettingForm("website");
  return (
    <Wrap title="Website Settings" subtitle="Footer & general" onSave={save} saving={saving}>
      <F label="Footer About Text" value={form.footer_about} onChange={(v) => set("footer_about", v)} textarea />
    </Wrap>
  );
}
