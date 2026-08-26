import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/adminNav";
import {
  LayoutDashboard, Package, FolderTree, Tag, Layers, Percent, ShoppingBag, Users,
  Newspaper, Image, Briefcase, Mail, MessageCircle, Send, Search, BarChart3,
  UserCog, Settings, ScrollText, Menu, LogOut, FileText, Globe,
  Ticket, ListChecks, CalendarDays, Headset, Contact, Bell, Database, ScrollText as ScrollIcon, FileSignature, IndianRupee,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const NAV = [
  { heading: "Main" },
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, module: null, end: true },
  { heading: "Customer Support" },
  { to: "/admin/support", label: "Support Dashboard", icon: Headset, module: "tickets", end: true },
  { to: "/admin/support/customers", label: "CRM Contacts", icon: Contact, module: "tickets" },
  { to: "/admin/support/tickets", label: "Tickets", icon: Ticket, module: "tickets" },
  { to: "/admin/support/my-tasks", label: "My Tasks", icon: ListChecks, module: "tickets" },
  { to: "/admin/support/calendar", label: "Calendar", icon: CalendarDays, module: "tickets" },
  { to: "/admin/support/create-ticket", label: "Create Ticket", icon: Ticket, module: "tickets" },
  { to: "/admin/support/reports", label: "Ticket Reports", icon: BarChart3, module: "tickets" },
  { to: "/admin/support/settings", label: "Ticket Settings", icon: Settings, module: "tickets" },
  { heading: "Store" },
  { to: "/admin/products", label: "Products", icon: Package, module: "products" },
  { to: "/admin/categories", label: "Categories", icon: FolderTree, module: "categories" },
  { to: "/admin/brands", label: "Brands", icon: Tag, module: "brands" },
  { to: "/admin/units", label: "Units", icon: Layers, module: "units" },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, module: "orders" },
  { heading: "Quotations" },
  { to: "/admin/quotations", label: "Quotation Dashboard", icon: FileSignature, module: "quotations", end: true },
  { to: "/admin/quotations/list", label: "All Quotations", icon: FileText, module: "quotations" },
  { to: "/admin/quotations/new", label: "New Quotation", icon: FileSignature, module: "quotations" },
  { to: "/admin/quotations/settings", label: "Quotation Settings", icon: Settings, module: "quotations" },
  { heading: "Catalog & Sales" },
  { to: "/admin/customers", label: "Customers", icon: Users, module: "customers" },
  { to: "/admin/pricing-manager", label: "Pricing Manager", icon: IndianRupee, module: "customers" },
  { to: "/admin/pricing-settings", label: "Pricing Engine", icon: Percent, module: "customers" },
  { to: "/admin/pages", label: "Website Pages", icon: FileText, module: "pages" },
  { to: "/admin/news", label: "News", icon: Newspaper, module: "news" },
  { to: "/admin/gallery", label: "Gallery", icon: Image, module: "gallery" },
  { to: "/admin/careers", label: "Careers", icon: Briefcase, module: "careers" },
  { to: "/admin/applications", label: "Applications", icon: FileText, module: "careers" },
  { to: "/admin/enquiries", label: "Enquiries", icon: Mail, module: "enquiries" },
  { to: "/admin/notifications", label: "WhatsApp Log", icon: MessageCircle, module: null },
  { to: "/admin/whatsapp", label: "WhatsApp Settings", icon: Send, module: "cms" },
  { to: "/admin/smtp", label: "Email / SMTP", icon: Mail, module: "cms" },
  { to: "/admin/seo", label: "SEO", icon: Search, module: "cms" },
  { to: "/admin/settings", label: "Company Settings", icon: Settings, module: "cms" },
  { to: "/admin/settings/homepage", label: "Homepage Content", icon: LayoutDashboard, module: "cms" },
  { to: "/admin/settings/website", label: "Footer & Website", icon: Globe, module: "cms" },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, module: "reports" },
  { to: "/admin/users", label: "Admin Users", icon: UserCog, module: "*" },
  { to: "/admin/backup", label: "Backup & Restore", icon: Database, module: "*" },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText, module: "*" },
];

function SidebarLinks({ can, onNav }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3 py-4">
      {NAV.filter((n) => n.heading || !n.module || can(n.module)).map((n, idx) => {
        if (n.heading) {
          return <p key={`h-${idx}`} className="text-[10px] uppercase tracking-widest text-slate-500 px-3 mt-4 mb-1">{n.heading}</p>;
        }
        const Icon = n.icon;
        return (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNav}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-vm-accent text-white font-medium" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            data-testid={`adminnav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}>
            <Icon className="w-4 h-4" /> {n.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { admin, loading, logout, can } = useAdminAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400">Loading admin...</div>;
  if (!admin) return <Navigate to="/admin/login" replace />;

  const Brand = (
    <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
      <div className="w-8 h-8 rounded-md bg-vm-accent text-white grid place-items-center font-heading font-extrabold">V</div>
      <div className="text-white font-heading font-bold">VETMECH <span className="text-vm-accent text-xs">Admin</span></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F5] flex">
      <aside className="hidden lg:flex flex-col w-64 bg-vm-ink fixed inset-y-0 overflow-y-auto">
        {Brand}
        <SidebarLinks can={can} />
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden"><Menu className="w-5 h-5" /></Button></SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-vm-ink border-0">{Brand}<SidebarLinks can={can} onNav={() => setMobileOpen(false)} /></SheetContent>
            </Sheet>
            <span className="text-sm text-slate-500 hidden sm:block">Welcome back, <strong className="text-vm-ink">{admin.name}</strong></span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-xs bg-vm-bg text-vm-green px-2.5 py-1 rounded font-medium">{ROLE_LABELS[admin.role] || admin.role}</span>
            <a href="/" target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><Globe className="w-4 h-4 mr-1" /> View Site</Button></a>
            <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/admin/login"); }} data-testid="admin-logout"><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
