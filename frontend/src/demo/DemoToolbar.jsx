import React, { useState } from "react";
import { ArrowUpRight, Code2, ShoppingBag, Users, RotateCcw, Download, X, ShieldCheck } from "lucide-react";
import { demoEngine } from "./adapter";
import "./demo.css";

export default function DemoToolbar() {
  const [open, setOpen] = useState(false);
  const go = (role, route) => {
    if (role === "admin") localStorage.setItem("vm_admin_token", "demo-admin");
    if (role === "doctor" || role === "agency") localStorage.setItem("vm_customer_token", demoEngine().enterCustomer(role === "doctor" ? "c1" : "c2"));
    if (role === "public") localStorage.removeItem("vm_customer_token");
    window.location.assign(route);
  };
  const close = () => { sessionStorage.setItem("vm_demo_intro_seen", "1"); setOpen(false); };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(demoEngine().snapshot(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "vetmech-demo-data.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => {
    if (!window.confirm("Reset sample products, customers and transactions on this device?")) return;
    demoEngine().reset(); localStorage.removeItem("vm_cart"); localStorage.removeItem("vm_customer_token"); localStorage.removeItem("vm_admin_token"); window.location.assign("/");
  };
  return <>
    <div className="vm-demo-strip" role="status"><span><span className="vm-demo-dot" /> DEVELOPMENT DEMO <span className="vm-demo-strip-detail">· Sample data on this device</span></span><button onClick={() => setOpen(!open)} data-testid="demo-tools">Demo tools <Code2 size={14} /></button></div>
    {open && <aside className="vm-demo-studio" aria-label="Demo development tools">
      <div className="vm-demo-studio-head"><span className="vm-demo-eyebrow">YOUR DEVELOPMENT WORKSPACE</span><button onClick={close} aria-label="Close demo tools"><X size={17} /></button></div>
      <h2>Explore VETMECH</h2><p>Preview the corporate website, Partner Shop and admin workspace with sample records.</p>
      <button className="vm-demo-primary" onClick={() => go("admin", "/admin")} data-testid="demo-enter-admin"><ShieldCheck size={18} /><span>Open admin workspace<small>Products, customers, orders & reports</small></span><ArrowUpRight size={17} /></button>
      <div className="vm-demo-two"><button onClick={() => go("doctor", "/shop")} data-testid="demo-enter-customer"><ShoppingBag size={17} /> Doctor demo</button><button onClick={() => go("agency", "/shop/quick-order")}><Users size={17} /> Agency demo</button></div>
      <button className="vm-demo-text" onClick={() => go("public", "/")}>View corporate website <ArrowUpRight size={14} /></button>
      <div className="vm-demo-note">Changes stay in this browser. Prices are illustrative. WhatsApp and email are simulated.</div>
      <div className="vm-demo-footer"><button onClick={exportData}><Download size={14} /> Export demo</button><button onClick={reset} data-testid="demo-reset"><RotateCcw size={14} /> Reset demo</button></div>
    </aside>}
  </>;
}
