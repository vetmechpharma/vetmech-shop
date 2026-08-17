import React from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/hooks/useSettings";
import { Facebook, Instagram, Linkedin, Youtube, MapPin, Phone, Mail, MessageCircle } from "lucide-react";

export default function Footer() {
  const { data: company } = useSettings("company");
  const { data: website } = useSettings("website");
  const year = new Date().getFullYear();

  return (
    <footer className="bg-vm-ink text-slate-300 mt-16">
      <div className="vm-container py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-md bg-vm-accent text-white grid place-items-center font-heading font-extrabold">V</div>
            <div className="font-heading font-extrabold text-white text-lg">VETMECH</div>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            {website?.footer_about || "Trusted Indian veterinary pharmaceutical company delivering quality-assured medicines for animals."}
          </p>
          <div className="flex gap-3 mt-5">
            {[[Facebook, company?.social?.facebook], [Instagram, company?.social?.instagram], [Linkedin, company?.social?.linkedin], [Youtube, company?.social?.youtube]].map(([Icon, href], i) => (
              <a key={i} href={href || "#"} target="_blank" rel="noreferrer" className="w-8 h-8 grid place-items-center rounded-md bg-white/10 hover:bg-vm-accent transition-colors">
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-white font-heading font-bold mb-4 text-sm uppercase tracking-wider">Products</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/categories/large-animal" className="hover:text-vm-accent">Large Animal</Link></li>
            <li><Link to="/categories/small-animal" className="hover:text-vm-accent">Small Animal</Link></li>
            <li><Link to="/categories/poultry" className="hover:text-vm-accent">Poultry</Link></li>
            <li><Link to="/products" className="hover:text-vm-accent">All Products</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-heading font-bold mb-4 text-sm uppercase tracking-wider">Company</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/about" className="hover:text-vm-accent">About Us</Link></li>
            <li><Link to="/quality" className="hover:text-vm-accent">Quality Control</Link></li>
            <li><Link to="/infrastructure" className="hover:text-vm-accent">Infrastructure</Link></li>
            <li><Link to="/research" className="hover:text-vm-accent">R&D</Link></li>
            <li><Link to="/careers" className="hover:text-vm-accent">Careers</Link></li>
            <li><Link to="/privacy" className="hover:text-vm-accent">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-vm-accent">Terms & Conditions</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-heading font-bold mb-4 text-sm uppercase tracking-wider">Contact</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2"><MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-vm-accent" /><span>{company?.address || "Ahmedabad, Gujarat, India"}</span></li>
            <li className="flex gap-2"><Phone className="w-4 h-4 flex-shrink-0 text-vm-accent" /><span>{company?.phone}</span></li>
            <li className="flex gap-2"><Mail className="w-4 h-4 flex-shrink-0 text-vm-accent" /><span>{company?.email}</span></li>
            <li><a href={`https://wa.me/${company?.whatsapp || "919825000000"}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-vm-accent hover:underline"><MessageCircle className="w-4 h-4" /> Order on WhatsApp</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="vm-container py-5 text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
          <span>© {year} {company?.name || "VETMECH Pharmaceuticals Private Limited"}. All rights reserved.</span>
          <span>For veterinary use only. Prices & schemes subject to change.</span>
        </div>
      </div>
    </footer>
  );
}
