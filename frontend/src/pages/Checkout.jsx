import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SEO from "@/components/SEO";
import OtpDialog from "@/components/public/OtpDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { INDIAN_STATES, CUSTOMER_CATEGORIES, PREFIXES } from "@/lib/constants";
import { ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";

const DEFAULT_TERMS = `1. All orders are subject to confirmation and stock availability.\n2. Prices, offers and schemes are for registered B2B partners and may change without notice.\n3. No online payment is collected; billing and dispatch are arranged by our team.\n4. Free goods and rates shown are indicative; the final invoice governs.\n5. Cash Discount Bill (4%), if opted, is applied on the final invoice as per company policy.\n6. Goods once dispatched are subject to our return/replacement policy.\nBy placing an order you confirm the details are correct and authorised by you.`;

export default function Checkout() {
  const navigate = useNavigate();
  const { calc, clear } = useCart();
  const { customer } = useAuth();
  const { data: website } = useSettings("website");
  const [otpOpen, setOtpOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [mobile, setMobile] = useState("");
  const [existing, setExisting] = useState(null);
  const [useExistingAddr, setUseExistingAddr] = useState(true);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [cashDiscount, setCashDiscount] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [form, setForm] = useState({
    prefix: "Dr.", name: "", whatsapp: "", company_name: "", category: "doctor",
    line1: "", line2: "", line3: "", pincode: "", state: "", district: "", notes: "",
  });

  useEffect(() => {
    if (customer) {
      setVerified(true);
      setExisting(customer);
      setMobile(customer.mobile);
      setForm((f) => ({ ...f, name: customer.name, whatsapp: customer.whatsapp, company_name: customer.company_name, category: customer.category, prefix: customer.prefix || "Dr." }));
    }
  }, [customer]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onVerified = (data) => {
    setVerified(true);
    setMobile(data.mobile);
    if (data.registered && data.customer) {
      setExisting(data.customer);
      setForm((f) => ({ ...f, name: data.customer.name, whatsapp: data.customer.whatsapp, company_name: data.customer.company_name, category: data.customer.category, prefix: data.customer.prefix || "Dr." }));
    }
  };

  const submit = async () => {
    if (calc.items.length === 0) { toast.error("Your cart is empty"); return; }
    const addr = (existing && useExistingAddr && existing.default_address)
      ? existing.default_address
      : { line1: form.line1, line2: form.line2, line3: form.line3, pincode: form.pincode, state: form.state, district: form.district };
    if (!addr.line1 || !addr.pincode || !addr.state) { toast.error("Please complete your delivery address"); return; }
    if (!/^\d{6}$/.test(String(addr.pincode))) { toast.error("Enter a valid 6-digit pincode"); return; }
    if (!acceptTerms) { toast.error("Please accept the Terms & Conditions"); return; }

    const clientMeta = {
      user_agent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
    };
    setLoading(true);
    try {
      const { data } = await api.post("/orders", {
        items: calc.items.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
        prefix: form.prefix, name: form.name, mobile, whatsapp: form.whatsapp || mobile,
        company_name: form.company_name, category: form.category,
        address: addr, save_address: true, notes: form.notes,
        accept_terms: acceptTerms, cash_discount: cashDiscount, client_meta: clientMeta,
      });
      clear();
      toast.success(`Order ${data.order_number || ""} placed successfully!`);
      navigate("/account", { state: { order: data, justPlaced: true } });
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  if (calc.items.length === 0) {
    return <div className="vm-container py-20 text-center text-slate-400">Your cart is empty. <a href="/products" className="text-vm-green underline">Browse products</a></div>;
  }

  return (
    <div className="vm-container py-10">
      <SEO title="Checkout" />
      <h1 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">Checkout</h1>

      <div className="grid lg:grid-cols-3 gap-8 mt-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Verification */}
          <div className="border border-[#E2E8F0] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-vm-ink flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-vm-accent" /> Verify Mobile (WhatsApp OTP)</h2>
              {verified && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Verified</span>}
            </div>
            {verified ? (
              <p className="text-sm text-slate-500 mt-2">Mobile <strong>{mobile}</strong> verified. {existing ? "Welcome back!" : "Please complete your details below."}</p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mt-2">Registration happens only at checkout. Verify your mobile to continue.</p>
                <Button className="mt-3 bg-vm-green hover:bg-vm-greenhover" onClick={() => setOtpOpen(true)} data-testid="start-verification">Verify with WhatsApp OTP</Button>
              </>
            )}
          </div>

          {verified && (
            <>
              {/* Personal */}
              <div className="border border-[#E2E8F0] rounded-lg p-5">
                <h2 className="font-heading font-bold text-vm-ink mb-4">Personal Information</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Prefix</Label>
                    <Select value={form.prefix} onValueChange={(v) => set("prefix", v)}>
                      <SelectTrigger data-testid="prefix-select"><SelectValue /></SelectTrigger>
                      <SelectContent>{PREFIXES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="name-input" /></div>
                  <div><Label>WhatsApp Number</Label><Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder={mobile} data-testid="whatsapp-input" /></div>
                  <div><Label>Company Name (Optional)</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} data-testid="company-input" /></div>
                  <div className="sm:col-span-2">
                    <Label>Customer Category</Label>
                    <Select value={form.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger data-testid="category-select"><SelectValue /></SelectTrigger>
                      <SelectContent>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border border-[#E2E8F0] rounded-lg p-5">
                <h2 className="font-heading font-bold text-vm-ink mb-4">Delivery Address</h2>
                {existing?.default_address && (
                  <RadioGroup value={useExistingAddr ? "existing" : "new"} onValueChange={(v) => setUseExistingAddr(v === "existing")} className="mb-4">
                    <label className="flex items-start gap-3 border border-[#E2E8F0] rounded-md p-3 cursor-pointer">
                      <RadioGroupItem value="existing" className="mt-1" data-testid="use-existing-address" />
                      <span className="text-sm text-slate-600">
                        <strong className="text-vm-ink">Use saved address</strong><br />
                        {existing.default_address.line1}, {existing.default_address.district}, {existing.default_address.state} - {existing.default_address.pincode}
                      </span>
                    </label>
                    <label className="flex items-center gap-3 border border-[#E2E8F0] rounded-md p-3 cursor-pointer">
                      <RadioGroupItem value="new" data-testid="use-new-address" />
                      <span className="text-sm text-vm-ink font-medium">Use a new address</span>
                    </label>
                  </RadioGroup>
                )}
                {(!existing?.default_address || !useExistingAddr) && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><Label>Address Line 1</Label><Input value={form.line1} onChange={(e) => set("line1", e.target.value)} data-testid="addr-line1" /></div>
                    <div><Label>Address Line 2</Label><Input value={form.line2} onChange={(e) => set("line2", e.target.value)} /></div>
                    <div><Label>Address Line 3</Label><Input value={form.line3} onChange={(e) => set("line3", e.target.value)} /></div>
                    <div><Label>Pincode</Label><Input value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="addr-pincode" /></div>
                    <div><Label>District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} data-testid="addr-district" /></div>
                    <div className="sm:col-span-2">
                      <Label>State</Label>
                      <Select value={form.state} onValueChange={(v) => set("state", v)}>
                        <SelectTrigger data-testid="addr-state"><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent className="max-h-64">{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="mt-4"><Label>Order Notes (Optional)</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any special instructions..." /></div>
              </div>
            </>
          )}
        </div>

        {/* Summary */}
        <div>
          <div className="border border-[#E2E8F0] rounded-lg p-5 sticky top-24">
            <h2 className="font-heading font-bold text-vm-ink mb-4">Order Summary</h2>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {calc.items.map((l) => (
                <div key={l.variant_id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.product_name} <span className="text-slate-400">({l.pack_size})</span></span>
                  <span className="font-medium text-vm-ink whitespace-nowrap">{l.qty}{l.free_qty ? ` +${l.free_qty}` : ""}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Ordered Qty</span><span className="font-semibold">{calc.total_qty}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Free Qty</span><span className="font-semibold text-vm-accent">{calc.total_free}</span></div>
              <div className="flex justify-between text-base"><span className="text-vm-ink font-medium">Total Dispatch</span><span className="font-heading font-bold text-vm-green">{calc.total_dispatch}</span></div>
            </div>
            <div className="mt-4 space-y-3 border-t pt-4">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={cashDiscount} onCheckedChange={(v) => setCashDiscount(!!v)} data-testid="cash-discount-checkbox" className="mt-0.5" />
                <span className="text-slate-600">Opt for <strong className="text-vm-ink">Cash Discount Bill (4%)</strong> on total invoice</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} data-testid="terms-checkbox" className="mt-0.5" />
                <span className="text-slate-600">I agree to the <button type="button" onClick={(e) => { e.preventDefault(); setTermsOpen(true); }} className="text-vm-green underline font-medium" data-testid="view-terms-btn">Terms &amp; Conditions</button> <span className="text-red-500">*</span></span>
              </label>
            </div>
            <Button size="lg" className="w-full mt-5 bg-vm-green hover:bg-vm-greenhover" disabled={!verified || !acceptTerms || loading} onClick={submit} data-testid="confirm-order-btn">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirm Order
            </Button>
            <p className="text-xs text-slate-400 mt-3 text-center">No payment now. We'll confirm on WhatsApp.</p>
          </div>
        </div>
      </div>

      <OtpDialog open={otpOpen} onOpenChange={setOtpOpen} onVerified={onVerified} />
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="terms-dialog">
          <DialogHeader><DialogTitle className="font-heading">Terms &amp; Conditions</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{website?.terms_text || DEFAULT_TERMS}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
