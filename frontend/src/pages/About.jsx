import React from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/hooks/useSettings";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { ShieldCheck, FlaskConical, Truck, Award, Target, Eye, HeartHandshake, ArrowRight, Microscope } from "lucide-react";

const IMG = {
  lab: "https://images.unsplash.com/photo-1732690233982-1d4567384ea1?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
  qc: "https://images.unsplash.com/photo-1579165466949-3180a3d056d5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
  cattle: "https://images.unsplash.com/photo-1779832244123-500fcd174082?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
  vet: "https://images.unsplash.com/photo-1770836037793-95bdbf190f71?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
};

const STATS = [
  { value: "25+", label: "Years of Expertise" },
  { value: "300+", label: "Product Formulations" },
  { value: "12K+", label: "Veterinary Partners" },
  { value: "28", label: "States Served" },
];

const VALUES = [
  { icon: ShieldCheck, title: "Quality First", text: "Every batch is WHO-GMP produced and released only after rigorous multi-stage quality control." },
  { icon: Microscope, title: "Science-Led", text: "Formulations backed by veterinary research and validated for efficacy across species." },
  { icon: HeartHandshake, title: "Partner Trust", text: "Transparent B2B pricing, dependable supply and long-term relationships with our channel." },
];

export default function About() {
  const { data: company } = useSettings("company");
  const name = company?.name || "VETMECH Pharmaceuticals";

  return (
    <div>
      <SEO title="About Us" description={`${name} — WHO-GMP certified veterinary pharmaceutical manufacturer.`} />

      {/* HERO */}
      <section className="relative bg-vm-ink text-white overflow-hidden">
        <img src={IMG.lab} alt="Pharmaceutical laboratory" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-vm-ink via-vm-ink/90 to-vm-ink/40" />
        <div className="vm-container relative py-24 md:py-32 max-w-3xl">
          <span className="inline-flex items-center gap-2 text-sm uppercase tracking-widest bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <Award className="w-4 h-4 text-vm-accent" /> WHO-GMP Certified Manufacturer
          </span>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Advancing animal health with science you can trust
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-200 leading-relaxed">
            {company?.description || `${name} manufactures quality-assured veterinary pharmaceuticals for cattle, companion animals and poultry — trusted by veterinarians, distributors and farms across India.`}
          </p>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-white border-b border-vm-border">
        <div className="vm-container py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} data-testid={`about-stat-${s.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <p className="font-heading text-4xl md:text-5xl font-bold text-vm-green">{s.value}</p>
              <p className="mt-1 text-vm-ink/70 text-base">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MISSION / VISION bento */}
      <section className="bg-vm-bg py-20 md:py-24">
        <div className="vm-container">
          <div className="max-w-2xl">
            <p className="text-vm-accent font-semibold uppercase tracking-widest text-sm">Who we are</p>
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-vm-ink mt-3">Built on purpose, driven by quality</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            <div className="md:col-span-2 bg-vm-ink text-white rounded-2xl p-8 md:p-10 relative overflow-hidden">
              <img src={IMG.cattle} alt="Livestock" loading="lazy" decoding="async" className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-20" />
              <Target className="w-9 h-9 text-vm-accent" />
              <h3 className="font-heading text-2xl font-bold mt-4">Our Mission</h3>
              <p className="mt-3 text-slate-200 text-lg leading-relaxed max-w-lg">
                To improve productivity and welfare of animals by delivering safe, effective and affordable
                veterinary medicines — made to global standards, available to every corner of the country.
              </p>
            </div>
            <div className="bg-white border border-vm-border rounded-2xl p-8">
              <Eye className="w-9 h-9 text-vm-green" />
              <h3 className="font-heading text-2xl font-bold text-vm-ink mt-4">Our Vision</h3>
              <p className="mt-3 text-vm-ink/70 text-lg leading-relaxed">
                To be India's most trusted partner in animal healthcare through relentless quality and innovation.
              </p>
            </div>
            {VALUES.map((v) => (
              <div key={v.title} className="bg-white border border-vm-border rounded-2xl p-8">
                <v.icon className="w-8 h-8 text-vm-green" />
                <h3 className="font-heading text-xl font-bold text-vm-ink mt-4">{v.title}</h3>
                <p className="mt-2 text-vm-ink/70 leading-relaxed">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* QUALITY split */}
      <section className="bg-white py-20 md:py-24">
        <div className="vm-container grid md:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl overflow-hidden shadow-sm">
            <img src={IMG.qc} alt="Quality control laboratory" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-vm-accent font-semibold uppercase tracking-widest text-sm">Manufacturing & Quality</p>
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-vm-ink mt-3">From formulation to dispatch, quality is engineered in</h2>
            <p className="mt-5 text-vm-ink/70 text-lg leading-relaxed">
              Our WHO-GMP facility follows strict SOPs across sourcing, formulation, filling and packaging.
              Each batch passes physico-chemical and microbiological testing before release.
            </p>
            <div className="mt-8 space-y-4">
              {[[FlaskConical, "Validated formulations & stability testing"], [ShieldCheck, "WHO-GMP compliant clean-room production"], [Truck, "Cold-chain aware, pan-India distribution"]].map(([Icon, t], i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-vm-bg grid place-items-center shrink-0"><Icon className="w-5 h-5 text-vm-green" /></div>
                  <p className="text-vm-ink text-lg">{t}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-vm-ink text-white py-20">
        <div className="vm-container flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="font-heading text-3xl md:text-4xl font-bold">Partner with {name}</h2>
            <p className="mt-3 text-slate-300 text-lg">Explore our catalogue or reach out for distributor pricing.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/products"><Button size="lg" className="bg-vm-accent hover:bg-vm-accent/90 text-white rounded-xl" data-testid="about-cta-products">Browse Products <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/contact"><Button size="lg" variant="outline" className="rounded-xl border-white/30 text-white hover:bg-white/10" data-testid="about-cta-contact">Contact Us</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
