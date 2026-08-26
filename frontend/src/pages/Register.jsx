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
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";

const empty = { prefix: "Dr.", name: "", mobile: "", whatsapp: "", email: "", company_name: "", address: "", pincode: "", district: "", state: "", category: "doctor", password: "" };

export default function Register() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...empty, mobile: loc.state?.mobile || "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Please enter your name");
    if (form.mobile.length !== 10) return toast.error("Enter a valid 10-digit mobile");
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
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => navigate("/account")} data-testid="register-goto-login">Go to Login</Button>
          <Button variant="outline" onClick={() => navigate("/products")}>Browse Products</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="vm-container py-10 max-w-2xl">
      <SEO title="Create Account" />
      <div className="flex items-center gap-2 mb-1"><UserPlus className="w-6 h-6 text-vm-green" /><h1 className="font-heading text-2xl font-bold text-vm-ink">Create your VETMECH account</h1></div>
      <p className="text-slate-500 text-sm mb-6">Register to unlock your special B2B pricing. New accounts are activated after admin approval.</p>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 grid sm:grid-cols-2 gap-4">
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
        <div className="sm:col-span-2"><Label>Password (optional)</Label><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" placeholder="Set a password for password login (you can always use OTP)" data-testid="reg-password" /></div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-slate-500">Already have an account? <Link to="/account" className="text-vm-green font-semibold hover:underline">Login</Link></p>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={loading} data-testid="reg-submit">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Account
        </Button>
      </div>
    </div>
  );
}
