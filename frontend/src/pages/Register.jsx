import React, { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CUSTOMER_CATEGORIES, PREFIXES, INDIAN_STATES } from "@/lib/constants";
import { CheckCircle2, Loader2, ShieldCheck, Tag, RotateCcw } from "lucide-react";

const empty = { prefix: "Dr.", name: "", mobile: "", whatsapp: "", email: "", company_name: "", address: "", pincode: "", district: "", state: "", category: "doctor", license_number: "", password: "" };

const LICENSE_REQUIRED = ["doctor", "agency", "medical_shop", "distributor"];

export default function Register() {
  const loc = useLocation();
  const navigate = useNavigate();
  const redirect = new URLSearchParams(loc.search).get("redirect");
  const [form, setForm] = useState({ ...empty, mobile: loc.state?.mobile || "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Please enter your name");
    if (form.mobile.length !== 10) return toast.error("Enter a valid 10-digit mobile");
    if (LICENSE_REQUIRED.includes(form.category) && !form.license_number.trim()) return toast.error("License Number is required for your selected category");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setDone(data);
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="vm-container py-20 max-w-lg text-center">
        <SEO title="Registration Received" />
        <CheckCircle2 className="w-16 h-16 mx-auto text-vm-green mb-4" />
        <h1 className="font-heading text-2xl font-bold text-vm-ink">Registration Received</h1>
        <p className="text-slate-600 mt-3" data-testid="register-success-msg">{done.message}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => navigate(redirect ? `/account?redirect=${encodeURIComponent(redirect)}` : "/account")} data-testid="register-goto-login">Go to Login</Button>
          <Button variant="outline" onClick={() => navigate(redirect || "/products")}>Browse Products</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] grid lg:grid-cols-2">
      <SEO title="Create Account" />
      <div className="relative hidden lg:block bg-vm-ink overflow-hidden">
        <img src="https://images.unsplash.com/photo-1732690233982-1d4567384ea1?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="Laboratory" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-vm-ink via-vm-ink/70 to-vm-ink/30" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <div className="w-12 h-12 rounded-xl bg-vm-green grid place-items-center font-heading font-extrabold text-xl mb-5">V</div>
          <h2 className="font-heading text-4xl font-bold leading-tight">Join VETMECH's<br />B2B network.</h2>
          <p className="mt-4 text-slate-200 text-lg max-w-md">Create an account to unlock category-specific rates, quantity offers and one-tap reordering built for veterinary professionals.</p>
          <ul className="mt-8 space-y-3 text-slate-200">
            <li className="flex items-center gap-3"><Tag className="w-5 h-5 text-vm-green" /> Your special B2B pricing</li>
            <li className="flex items-center gap-3"><RotateCcw className="w-5 h-5 text-vm-green" /> Fast reorder from history</li>
            <li className="flex items-center gap-3"><ShieldCheck className="w-5 h-5 text-vm-green" /> Admin-approved trusted access</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-lg">
          <h1 className="font-heading text-3xl font-bold text-vm-ink">Create your account</h1>
          <p className="text-slate-500 text-sm mt-2 mb-6">Register to unlock your special B2B pricing. New accounts are activated after admin approval.</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Prefix</Label>
              <Select value={form.prefix} onValueChange={(v) => set("prefix", v)}><SelectTrigger className="mt-1" data-testid="reg-prefix"><SelectValue /></SelectTrigger>
                <SelectContent>{PREFIXES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Full Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" data-testid="reg-name" /></div>
            <div><Label>Mobile Number *</Label><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} maxLength={10} className="mt-1" data-testid="reg-mobile" /></div>
            <div><Label>WhatsApp Number</Label><Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value.replace(/\D/g, ""))} maxLength={10} className="mt-1" placeholder="Same as mobile if blank" data-testid="reg-whatsapp" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" data-testid="reg-email" /></div>
            <div><Label>Company Name</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className="mt-1" data-testid="reg-company" /></div>
            <div className="sm:col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => set("address", e.target.value)} className="mt-1" data-testid="reg-address" /></div>
            <div><Label>Pincode</Label><Input value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} maxLength={6} className="mt-1" data-testid="reg-pincode" /></div>
            <div><Label>District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} className="mt-1" data-testid="reg-district" /></div>
            <div>
              <Label>State</Label>
              <Select value={form.state} onValueChange={(v) => set("state", v)}><SelectTrigger className="mt-1" data-testid="reg-state"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <Label>Customer Category *</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}><SelectTrigger className="mt-1" data-testid="reg-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
            </div>
            {LICENSE_REQUIRED.includes(form.category) && (
              <div className="sm:col-span-2"><Label>License Number *</Label><Input value={form.license_number} onChange={(e) => set("license_number", e.target.value)} className="mt-1" placeholder="Drug / Trade license number" data-testid="reg-license" /></div>
            )}
            <div className="sm:col-span-2"><Label>Password (optional)</Label><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" placeholder="Set a password for password login (you can always use OTP)" data-testid="reg-password" /></div>
          </div>

          <Button className="mt-6 w-full bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={loading} data-testid="reg-submit">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Account
          </Button>
          <p className="text-sm text-slate-500 mt-4 text-center">Already have an account? <Link to="/account" className="text-vm-green font-semibold hover:underline">Login</Link></p>
        </div>
      </div>
    </div>
  );
}
