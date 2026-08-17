import React, { useState } from "react";
import { api, apiError } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapPin, Phone, Mail, MessageCircle, Clock } from "lucide-react";

export default function Contact() {
  const { data: company } = useSettings("company");
  const [form, setForm] = useState({ name: "", mobile: "", email: "", subject: "", message: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile) { toast.error("Name and mobile are required"); return; }
    try {
      await api.post("/enquiries", form);
      toast.success("Message sent! We'll get back to you soon.");
      setForm({ name: "", mobile: "", email: "", subject: "", message: "" });
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <SEO title="Contact Us" description="Get in touch with VETMECH Pharmaceuticals." />
      <section className="bg-vm-ink text-white"><div className="vm-container py-14"><h1 className="font-heading text-4xl font-bold tracking-tight">Contact Us</h1><p className="text-slate-300 mt-2">We're here to help with orders and enquiries</p></div></section>
      <div className="vm-container py-10 grid lg:grid-cols-2 gap-10">
        <div>
          <h2 className="font-heading text-2xl font-bold text-vm-ink">Get in touch</h2>
          <div className="mt-6 space-y-4 text-slate-600">
            <div className="flex gap-3"><MapPin className="w-5 h-5 text-vm-accent flex-shrink-0" /><span>{company?.address}</span></div>
            <div className="flex gap-3"><Phone className="w-5 h-5 text-vm-accent flex-shrink-0" /><span>{company?.phone}</span></div>
            <div className="flex gap-3"><Mail className="w-5 h-5 text-vm-accent flex-shrink-0" /><span>{company?.email}</span></div>
            <div className="flex gap-3"><Clock className="w-5 h-5 text-vm-accent flex-shrink-0" /><span>{company?.business_hours}</span></div>
            <a href={`https://wa.me/${company?.whatsapp || "919825000000"}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-vm-green font-medium hover:underline"><MessageCircle className="w-5 h-5" /> Chat on WhatsApp</a>
          </div>
        </div>
        <form onSubmit={submit} className="border border-[#E2E8F0] rounded-lg p-6 space-y-4" data-testid="contact-form">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="contact-name" /></div>
            <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} data-testid="contact-mobile" /></div>
          </div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => set("subject", e.target.value)} /></div>
          <div><Label>Message</Label><Textarea rows={4} value={form.message} onChange={(e) => set("message", e.target.value)} data-testid="contact-message" /></div>
          <Button type="submit" className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="contact-submit">Send Message</Button>
        </form>
      </div>
    </div>
  );
}
