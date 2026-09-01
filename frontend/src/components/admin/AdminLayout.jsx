import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/adminNav";
import {
  LayoutDashboard, Package, FolderTree, Tag, Layers, Percent, ShoppingBag, Users,
  Newspaper, Image, Briefcase, Mail, MessageCircle, Send, Search, BarChart3,
  UserCog, Settings, ScrollText, Menu, LogOut, FileText, Globe,
  Ticket, ListChecks, CalendarDays, Headset, Contact, Database, FileSignature,
  IndianRupee, ChevronDown, LayoutGrid,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

// Grouped, collapsible navigation (TailAdmin style)
const GROUPS = [
  { single: true, to: "/admin", label: "Dashboard", icon: LayoutDashboard, module: null, end: true },
  {
    label: "Catalog", icon: Package, children: [
      { to: "/admin/products", label: "Products", module: "products" },
      { to: "/admin/categories", label: "Categories", module: "categories" },
      { to: "/admin/brands", label: "Brands", module: "brands" },
      { to: "/admin/units", label: "Units", module: "units" },
    ],
  },
  {
    label: "Sales & Pricing", icon: IndianRupee, children: [
      { to: "/admin/orders", label: "Orders", module: "orders" },
      { to: "/admin/dispatch-list", label: "Dispatch Register", module: "orders" },
      { to: "/admin/transports", label: "Transport Master", module: "orders" },
      { to: "/admin/customers", label: "Customers", module: "customers" },
      { to: "/admin/pricing-manager", label: "Pricing Manager", module: "customers" },
      { to: "/admin/pricing-settings", label: "Pricing Engine", module: "customers" },
    ],
  },
  {
    label: "Quotations", icon: FileSignature, children: [
      { to: "/admin/quotations", label: "Dashboard", module: "quotations", end: true },
      { to: "/admin/quotations/list", label: "All Quotations", module: "quotations" },
      { to: "/admin/quotations/new", label: "New Quotation", module: "quotations" },
      { to: "/admin/quotations/settings", label: "Settings", module: "quotations" },
    ],
  },
  {
    label: "Support", icon: Headset, children: [
      { to: "/admin/support", label: "Support Dashboard", module: "tickets", end: true },
      { to: "/admin/support/tickets", label: "Tickets", module: "tickets" },
      { to: "/admin/support/my-tasks", label: "My Tasks", module: "tickets" },
      { to: "/admin/support/calendar", label: "Calendar", module: "tickets" },
      { to: "/admin/support/customers", label: "CRM Contacts", module: "tickets" },
      { to: "/admin/support/create-ticket", label: "Create Ticket", module: "tickets" },
      { to: "/admin/support/reports", label: "Ticket Reports", module: "tickets" },
      { to: "/admin/support/settings", label: "Ticket Settings", module: "tickets" },
    ],
  },
  {
    label: "Content", icon: LayoutGrid, children: [
      { to: "/admin/pages", label: "Website Pages", module: "pages" },
      { to: "/admin/news", label: "News", module: "news" },
      { to: "/admin/gallery", label: "Gallery", module: "gallery" },
      { to: "/admin/careers", label: "Careers", module: "careers" },
      { to: "/admin/applications", label: "Applications", module: "careers" },
      { to: "/admin/enquiries", label: "Enquiries", module: "enquiries" },
      { to: "/admin/settings/homepage", label: "Homepage Content", module: "cms" },
      { to: "/admin/settings/website", label: "Footer & Website", module: "cms" },
      { to: "/admin/seo", label: "SEO", module: "cms" },
    ],
  },
  {
    label: "Communications", icon: MessageCircle, children: [
      { to: "/admin/notifications", label: "WhatsApp Log", module: null },
      { to: "/admin/message-templates", label: "Message Templates", module: "orders" },
      { to: "/admin/whatsapp", label: "WhatsApp Settings", module: "cms" },
      { to: "/admin/smtp", label: "Email / SMTP", module: "cms" },
    ],
  },
  {
    label: "System", icon: Settings, children: [
      { to: "/admin/settings", label: "Company Settings", module: "cms" },
      { to: "/admin/reports", label: "Reports", module: "reports" },
      { to: "/admin/users", label: "Admin Users", module: "*" },
      { to: "/admin/backup", label: "Backup & Restore", module: "*" },
      { to: "/admin/audit", label: "Audit Logs", module: "*" },
    ],
  },
];

const testid = (s) => `adminnav-${s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`;

function SidebarLinks({ can, onNav }) {
  const { pathname } = useLocation();
  const visibleGroups = GROUPS.map((g) => {
    if (g.single) return can === undefined || !g.module || can(g.module) || g.module === null ? g : (g.module ? (can(g.module) ? g : null) : g);
    const children = g.children.filter((c) => !c.module || can(c.module));
    return children.length ? { ...g, children } : null;
  }).filter(Boolean);

  const groupHasActive = (g) => !g.single && g.children.some((c) => c.end ? pathname === c.to : pathname.startsWith(c.to));
  const [open, setOpen] = useState({});
  useEffect(() => {
    const active = {};
    visibleGroups.forEach((g) => { if (groupHasActive(g)) active[g.label] = true; });
    setOpen((o) => ({ ...o, ...active }));
    // eslint-disable-next-line
  }, [pathname]);

  const toggle = (label) => setOpen((o) => ({ ...o, [label]: !o[label] }));

  return (
    <nav className="flex flex-col gap-1 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-2">Menu</p>
      {visibleGroups.map((g) => {
        if (g.single) {
          const Icon = g.icon;
          return (
            <NavLink key={g.to} to={g.to} end={g.end} onClick={onNav} data-testid={testid(g.label)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-vm-green/10 text-vm-green" : "text-slate-600 hover:bg-slate-100"}`}>
              {({ isActive }) => (<><Icon className={`w-5 h-5 ${isActive ? "text-vm-green" : "text-slate-400"}`} /> {g.label}</>)}
            </NavLink>
          );
        }
        const Icon = g.icon;
        const isOpen = !!open[g.label];
        const active = groupHasActive(g);
        return (
          <div key={g.label}>
            <button onClick={() => toggle(g.label)} data-testid={`adminnav-group-${g.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "text-vm-green" : "text-slate-600 hover:bg-slate-100"}`}>
              <Icon className={`w-5 h-5 ${active ? "text-vm-green" : "text-slate-400"}`} />
              <span className="flex-1 text-left">{g.label}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-[600px]" : "max-h-0"}`}>
              <div className="mt-1 ml-4 pl-4 border-l border-slate-200 flex flex-col gap-0.5">
                {g.children.map((c) => (
                  <NavLink key={c.to} to={c.to} end={c.end} onClick={onNav} data-testid={testid(c.label)}
                    className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "text-vm-green font-medium bg-vm-green/5" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
                    {c.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
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
    <div className="flex items-center gap-2.5 px-6 h-16 border-b border-slate-100">
      <div className="w-9 h-9 rounded-lg bg-vm-green text-white grid place-items-center font-heading font-extrabold">V</div>
      <div className="font-heading font-bold text-vm-ink leading-tight">VETMECH <span className="block text-[10px] font-medium text-vm-green tracking-wide">ADMIN PANEL</span></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200 fixed inset-y-0 overflow-y-auto">
        {Brand}
        <SidebarLinks can={can} />
      </aside>

      <div className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden"><Menu className="w-5 h-5" /></Button></SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-white border-0 overflow-y-auto">{Brand}<SidebarLinks can={can} onNav={() => setMobileOpen(false)} /></SheetContent>
            </Sheet>
            <span className="text-sm text-slate-500 hidden sm:block">Welcome back, <strong className="text-vm-ink">{admin.name}</strong></span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <NotificationBell />
            <span className="text-xs bg-vm-green/10 text-vm-green px-2.5 py-1 rounded-full font-medium hidden sm:block">{ROLE_LABELS[admin.role] || admin.role}</span>
            <a href="/" target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" className="text-slate-600"><Globe className="w-4 h-4 mr-1" /> <span className="hidden md:inline">View Site</span></Button></a>
            <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/admin/login"); }} data-testid="admin-logout"><LogOut className="w-4 h-4 md:mr-1" /> <span className="hidden md:inline">Logout</span></Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
