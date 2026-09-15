import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SearchModal from "./SearchModal";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuList,
  NavigationMenuTrigger, NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Search, ShoppingCart, User, Menu, Phone, MessageCircle, Zap } from "lucide-react";

const NAV = [
  { label: "Home", to: "/" },
  { label: "About Us", to: "/about" },
  { label: "Quality", to: "/quality" },
  { label: "News", to: "/news" },
  { label: "Gallery", to: "/gallery" },
  { label: "Careers", to: "/careers" },
  { label: "Contact", to: "/contact" },
];

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count } = useCart();
  const { customer } = useAuth();
  const { data: company } = useSettings("company");
  const { data: menu } = useSettings("menu");
  const navItems = ((menu?.items?.length ? menu.items : NAV)).map((n) => {
    const to = n.url || n.to || "/";
    return { label: n.label, to, external: !!n.external || /^https?:\/\//.test(to) };
  });
  const navigate = useNavigate();
  const waNumber = company?.whatsapp || "919825000000";
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data });
  const catList = (cats || []).filter((c) => !String(c.name).startsWith("TEST_"));
  const mainCats = catList.filter((c) => !c.parent_id);
  const subsByParent = catList.reduce((m, c) => { if (c.parent_id) { (m[c.parent_id] = m[c.parent_id] || []).push(c); } return m; }, {});

  return (
    <>
      <div className="bg-vm-ink text-white text-xs">
        <div className="vm-container flex items-center justify-between h-9">
          <span className="hidden sm:flex items-center gap-2">
            <Phone className="w-3 h-3" /> {company?.phone || "+91 98250 00000"}
          </span>
          <span className="truncate">{company?.tagline || "Advancing Animal Health"}</span>
          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 hover:text-vm-accent" data-testid="topbar-whatsapp">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/95 border-b border-[#E2E8F0]">
        <div className="vm-container flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
            {company?.logo ? (
              <img src={company.logo} alt="VETMECH" className="h-9" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-md bg-vm-green text-white grid place-items-center font-heading font-extrabold">V</div>
                <div className="leading-none">
                  <div className="font-heading font-extrabold text-vm-ink text-lg tracking-tight">VETMECH</div>
                  <div className="text-[9px] tracking-[0.28em] text-vm-accent font-bold">PHARMACEUTICALS</div>
                </div>
              </div>
            )}
          </Link>

          <nav className="hidden lg:flex items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="text-sm font-medium text-slate-600">Products</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="p-4 w-[540px] grid grid-cols-2 gap-x-6 gap-y-3">
                      {mainCats.map((c) => (
                        <div key={c.id}>
                          <NavigationMenuLink asChild>
                            <Link to={`/categories/${c.slug}`} className="block font-heading font-bold text-vm-ink text-sm hover:text-vm-green" data-testid={`nav-cat-${c.slug}`}>{c.name}</Link>
                          </NavigationMenuLink>
                          <div className="mt-1 space-y-0.5">
                            {(subsByParent[c.id] || []).map((s) => (
                              <NavigationMenuLink asChild key={s.id}>
                                <Link to={`/categories/${s.slug}`} className="block text-xs text-slate-500 hover:text-vm-green" data-testid={`nav-subcat-${s.slug}`}>{s.name}</Link>
                              </NavigationMenuLink>
                            ))}
                          </div>
                        </div>
                      ))}
                      <NavigationMenuLink asChild>
                        <Link to="/products" className="col-span-2 mt-1 pt-2 border-t border-[#E2E8F0] block font-semibold text-vm-green text-sm">All Products →</Link>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                {navItems.map((n) => (
                  <NavigationMenuItem key={`${n.to}-${n.label}`}>
                    {n.external
                      ? <a href={n.to} target="_blank" rel="noreferrer" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-vm-green">{n.label}</a>
                      : <NavLink to={n.to} className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-vm-green">{n.label}</NavLink>}
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </nav>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} data-testid="open-search" aria-label="Search">
              <Search className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/cart")} className="relative" data-testid="cart-button" aria-label="Cart">
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && <span className="absolute -top-0.5 -right-0.5 bg-vm-accent text-white text-[10px] w-4 h-4 grid place-items-center rounded-full">{count}</span>}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/account")} data-testid="account-button" aria-label="Account">
              <User className="w-5 h-5" />
            </Button>
            <Link to="/quick-order" className="hidden md:block">
              <Button className="bg-vm-accent hover:bg-[#0C8A4F] ml-1" data-testid="quick-order-btn">
                <Zap className="w-4 h-4 mr-1" /> Quick Order
              </Button>
            </Link>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-btn" aria-label="Menu"><Menu className="w-5 h-5" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <div className="mt-6 flex flex-col gap-1">
                  <Link to="/products" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-md hover:bg-vm-bg font-semibold text-vm-green">All Products</Link>
                  <Link to="/quick-order" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-md hover:bg-vm-bg font-semibold text-vm-accent" data-testid="mnav-quick-order">Quick Order</Link>
                  {mainCats.map((c) => (
                    <div key={c.id}>
                      <Link to={`/categories/${c.slug}`} onClick={() => setMobileOpen(false)} className="px-3 py-2 rounded-md hover:bg-vm-bg text-sm font-semibold text-vm-ink block">{c.name}</Link>
                      {(subsByParent[c.id] || []).map((s) => (
                        <Link key={s.id} to={`/categories/${s.slug}`} onClick={() => setMobileOpen(false)} className="px-6 py-1.5 rounded-md hover:bg-vm-bg text-sm text-slate-500 block">{s.name}</Link>
                      ))}
                    </div>
                  ))}
                  {navItems.map((n) => (
                    n.external
                      ? <a key={`${n.to}-${n.label}`} href={n.to} target="_blank" rel="noreferrer" className="px-3 py-2.5 rounded-md hover:bg-vm-bg text-slate-700">{n.label}</a>
                      : <Link key={`${n.to}-${n.label}`} to={n.to} onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-md hover:bg-vm-bg text-slate-700">{n.label}</Link>
                  ))}
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 rounded-md hover:bg-vm-bg text-slate-700">{customer ? "My Account" : "Login"}</Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
