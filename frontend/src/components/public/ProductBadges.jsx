import React from "react";
import { Badge } from "@/components/ui/badge";
import { Star, Sparkles, Tag, Award, Clock } from "lucide-react";

const MAP = {
  new: { label: "NEW", cls: "bg-blue-100 text-blue-800 hover:bg-blue-100", icon: Sparkles },
  featured: { label: "FEATURED", cls: "bg-vm-green text-white hover:bg-vm-green", icon: Star },
  best_seller: { label: "BEST SELLER", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100", icon: Award },
  offer: { label: "OFFER", cls: "bg-vm-accent text-white hover:bg-vm-accent", icon: Tag },
  coming_soon: { label: "COMING SOON", cls: "bg-slate-200 text-slate-700 hover:bg-slate-200", icon: Clock },
  out_of_stock: { label: "OUT OF STOCK", cls: "bg-red-100 text-red-800 hover:bg-red-100", icon: null },
};

export default function ProductBadges({ badges = {}, className = "" }) {
  const active = Object.entries(badges).filter(([, v]) => v);
  if (!active.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {active.map(([k]) => {
        const m = MAP[k];
        if (!m) return null;
        const Icon = m.icon;
        return (
          <Badge key={k} className={`text-[10px] font-semibold rounded px-2 py-0.5 border-0 ${m.cls}`} data-testid={`badge-${k}`}>
            {Icon && <Icon className="w-3 h-3 mr-1" />}{m.label}
          </Badge>
        );
      })}
    </div>
  );
}
