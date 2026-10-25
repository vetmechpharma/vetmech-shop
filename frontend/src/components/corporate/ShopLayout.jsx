import React, { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeft, Search, ShoppingBag, User, Zap } from "lucide-react";
import Brand from "./Brand";
import Footer from "./Footer";
import MobileNav from "@/components/public/MobileNav";
import SearchModal from "@/components/public/SearchModal";
import SeoGlobals from "@/components/public/SeoGlobals";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import "./corporate.css";

export default function ShopLayout() {
  const [search, setSearch] = useState(false);
  const { count } = useCart(), { customer } = useAuth();
  return <div className="shop-site"><SeoGlobals/><div className="corp-shop-utility"><div className="corp-container"><Link to="/"><ArrowLeft size={14}/> Corporate website</Link><span>VETMECH PARTNER SHOP</span></div></div><header className="corp-shop-header"><div className="corp-container"><Brand/><nav aria-label="Shop navigation"><Link to="/shop">All products</Link><Link to="/shop/quick-order"><Zap size={15}/>Quick order</Link></nav><div className="corp-shop-actions"><button onClick={() => setSearch(true)} aria-label="Search shop"><Search size={21}/></button><Link to="/cart" aria-label={`Cart, ${count} items`}><ShoppingBag size={21}/>{count > 0 && <b>{count}</b>}</Link><Link to="/account" aria-label="Partner account"><User size={21}/><span>{customer ? "My account" : "Sign in"}</span></Link></div></div></header><main className="corp-shop-main"><Outlet/></main><Footer/><MobileNav/><SearchModal commerce open={search} onOpenChange={setSearch}/></div>;
}
