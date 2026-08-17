import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/hooks/useSettings";
import SearchModal from "./SearchModal";
import { Home, Package, Search, ShoppingCart, User, MessageCircle } from "lucide-react";

export default function MobileNav() {
  const { pathname } = useLocation();
  const { count } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: company } = useSettings("company");
  const navigate = useNavigate();

  const item = (to, Icon, label, badge, onClick) => {
    const active = to && pathname === to;
    return (
      <button
        onClick={onClick || (() => navigate(to))}
        className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 ${active ? "text-vm-green" : "text-slate-500"}`}
        data-testid={`mobilenav-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        <div className="relative">
          <Icon className="w-5 h-5" />
          {badge > 0 && <span className="absolute -top-1.5 -right-2 bg-vm-accent text-white text-[9px] w-4 h-4 grid place-items-center rounded-full">{badge}</span>}
        </div>
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    );
  };

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md bg-white/95 border-t border-[#E2E8F0] flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]">
        {item("/", Home, "Home")}
        {item("/products", Package, "Products")}
        {item(null, Search, "Search", 0, () => setSearchOpen(true))}
        {item("/cart", ShoppingCart, "Cart", count)}
        {item("/account", User, "Account")}
        <a href={`https://wa.me/${company?.whatsapp || "919825000000"}`} target="_blank" rel="noreferrer"
           className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-vm-accent" data-testid="mobilenav-whatsapp">
          <MessageCircle className="w-5 h-5" />
          <span className="text-[10px] font-medium">Order</span>
        </a>
      </nav>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
