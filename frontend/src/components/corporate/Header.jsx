import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, Search, ArrowUpRight } from "lucide-react";
import Brand from "./Brand";
import SearchModal from "@/components/public/SearchModal";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const NAV = [["Our company", "/about"], ["Our portfolio", "/products"], ["Our approach", "/research"], ["Resources", "/news"], ["Contact", "/contact"]];
export default function Header() {
  const [menu, setMenu] = useState(false), [search, setSearch] = useState(false);
  return <>
    <div className="corp-utility"><div className="corp-container"><span>VETMECH PHARMACEUTICALS PRIVATE LIMITED</span><Link to="/contact">A partnership with purpose <ArrowUpRight size={12}/></Link></div></div>
    <header className="corp-header"><div className="corp-container corp-header-inner"><Brand/>
      <nav className="corp-desktop-nav" aria-label="Main navigation">{NAV.map(([label, to]) => <NavLink to={to} key={to}>{label}</NavLink>)}</nav>
      <div className="corp-header-actions"><button className="corp-icon-button" onClick={() => setSearch(true)} aria-label="Search our portfolio" data-testid="corporate-search"><Search size={20}/></button><Link to="/shop" className="corp-shop-link" aria-label="Partner Shop" data-testid="partner-shop-link">Partner Shop <ArrowUpRight size={16}/></Link>
        <Sheet open={menu} onOpenChange={setMenu}><SheetTrigger asChild><button className="corp-icon-button corp-menu-button" aria-label="Open navigation"><Menu size={23}/></button></SheetTrigger><SheetContent className="corp-mobile-sheet"><SheetTitle className="sr-only">Main navigation</SheetTitle><Brand/><nav aria-label="Mobile navigation">{NAV.map(([label, to]) => <Link key={to} to={to} onClick={() => setMenu(false)}>{label}<ArrowUpRight size={19}/></Link>)}<Link to="/shop" onClick={() => setMenu(false)}>Partner Shop<ArrowUpRight size={19}/></Link></nav><p>The Science of Animal Health</p></SheetContent></Sheet>
      </div></div></header><SearchModal open={search} onOpenChange={setSearch}/>
  </>;
}
