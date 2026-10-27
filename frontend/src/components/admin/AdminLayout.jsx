import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/adminNav";
import { LayoutDashboard, Package, IndianRupee, FileSignature, Headset, LayoutGrid, MessageCircle, Settings, ChevronDown, Globe, LogOut, Menu } from "lucide-react";
import NotificationBell from "./NotificationBell";
import Brand from "@/components/corporate/Brand";
import SEO from "@/components/SEO";
import { currentAdminDestination } from "@/lib/adminNavigation.mjs";
import "./admin.css";

// One active destination per grouped navigation section.
const GROUPS = [
  { single: true, to: "/admin", label: "Dashboard", icon: LayoutDashboard, module: null, end: true },
  {
    label: "Catalog", icon: Package, children: [
      { to: "/admin/products", label: "Products", module: "products" },
      { to: "/admin/categories", label: "Categories", module: "categories" },
      { to: "/admin/brands", label: "Brands", module: "brands" },
      { to: "/admin/units", label: "Units", module: "units" },
      { to: "/admin/schemes", label: "Schemes", module: "schemes" },
    ],
  },
  {
    label: "Sales & Pricing", icon: IndianRupee, children: [
      { to: "/admin/orders", label: "Orders", module: "orders" },
      { to: "/admin/dispatch-list", label: "Dispatch Register", module: "orders" },
      { to: "/admin/transports", label: "Transport Master", module: "orders" },
      { to: "/admin/customers", label: "Customers", module: "customers" },
      { to: "/admin/customers/reports", label: "Customer Reports", module: "reports" },
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
      { to: "/admin/reviews", label: "Reviews", module: "news" },
      { to: "/admin/menu", label: "Menu Builder", module: "cms" },
      { to: "/admin/gallery", label: "Gallery", module: "gallery" },
      { to: "/admin/careers", label: "Careers", module: "careers" },
      { to: "/admin/applications", label: "Applications", module: "careers" },
      { to: "/admin/enquiries", label: "Enquiries", module: "enquiries" },
      { to: "/admin/settings/homepage", label: "Homepage Content", module: "cms" },
      { to: "/admin/settings/website", label: "Footer & Website", module: "cms" },
      { to: "/admin/seo", label: "SEO", module: "cms" },
      { to: "/admin/seo-audit", label: "SEO Health", module: "products" },
    ],
  },
  {
    label: "Communications", icon: MessageCircle, children: [
      { to: "/admin/notifications", label: "WhatsApp Log", module: null },
      { to: "/admin/message-templates", label: "Message Templates", module: "orders" },
      { to: "/admin/email-templates", label: "Email Templates", module: "cms" },
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

function permittedGroups(can) {
  return GROUPS.map((group) => {
    if (group.single) return !group.module || can(group.module) ? group : null;
    const children = group.children.filter((child) => !child.module || can(child.module));
    return children.length ? { ...group, children } : null;
  }).filter(Boolean);
}

function SidebarLinks({ groups, onNav }) {
  const { pathname } = useLocation();
  const activeItem = currentAdminDestination(groups, pathname);
  const [open, setOpen] = useState({});
  const activeGroup = groups.find((group) => group.children?.some((child) => child.to === activeItem?.to))?.label;
  useEffect(() => { if (activeGroup) setOpen((previous) => ({ ...previous, [activeGroup]: true })); }, [activeGroup]);

  return <nav className="vm-admin-nav" aria-label="Admin navigation">
    <p className="vm-admin-nav-label">Workspace</p>
    {groups.map((group) => {
      const Icon = group.icon;
      if (group.single) return <NavLink key={group.to} to={group.to} end={group.end} onClick={onNav} data-testid={testid(group.label)}
        className={`vm-admin-nav-link ${activeItem?.to === group.to ? "is-active" : ""}`}><Icon size={19} />{group.label}</NavLink>;
      const expanded = !!open[group.label];
      const id = `nav-${group.label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
      return <div key={group.label} className="vm-admin-nav-group">
        <button type="button" className={`vm-admin-nav-link ${activeGroup === group.label ? "is-current" : ""}`}
          aria-expanded={expanded} aria-controls={id} onClick={() => setOpen((previous) => ({ ...previous, [group.label]: !previous[group.label] }))}
          data-testid={`adminnav-group-${group.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
          <Icon size={19} /><span>{group.label}</span><ChevronDown size={16} className={expanded ? "rotate-180" : ""} />
        </button>
        <div id={id} hidden={!expanded} className="vm-admin-nav-children">
          {group.children.map((child) => <NavLink key={child.to} to={child.to} end onClick={onNav} data-testid={testid(child.label)}
            aria-current={activeItem?.to === child.to ? "page" : undefined}
            className={`vm-admin-nav-child ${activeItem?.to === child.to ? "is-active" : ""}`}>{child.label}</NavLink>)}
        </div>
      </div>;
    })}
  </nav>;
}

export default function AdminLayout() {
  const { admin, loading, logout, can } = useAdminAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (loading) return <div className="vm-admin-loading" role="status">Loading your workspace…</div>;
  if (!admin) return <Navigate to="/admin/login" replace />;
  const groups = permittedGroups(can);
  const activeItem = currentAdminDestination(groups, pathname);
  const role = ROLE_LABELS[admin.role] || admin.role;
  const brand = <div className="vm-admin-brand"><Brand light /><span>ADMINISTRATION</span></div>;
  const profile = <div className="vm-admin-profile"><span>{(admin.name || "V").slice(0, 1).toUpperCase()}</span><div><strong>{admin.name}</strong><small>{role}</small></div></div>;

  return <div className="vm-admin-shell">
    <SEO title={`${activeItem?.label || "Workspace"} | Administration`} noindex />
    <a href="#admin-main" className="vm-admin-skip">Skip to workspace</a>
    <aside className="vm-admin-sidebar hidden lg:flex">{brand}<SidebarLinks groups={groups} />{profile}</aside>
    <div className="vm-admin-workspace">
      <header className="vm-admin-header">
        <div className="flex items-center gap-3 min-w-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin navigation"><Menu className="w-5 h-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="vm-admin-mobile-sidebar">
              <SheetHeader className="sr-only"><SheetTitle>Admin navigation</SheetTitle><SheetDescription>Choose a workspace section.</SheetDescription></SheetHeader>
              {brand}<SidebarLinks groups={groups} onNav={() => setMobileOpen(false)} />{profile}
            </SheetContent>
          </Sheet>
          <div className="vm-admin-breadcrumb"><span>Administration</span><span>/</span><strong>{activeItem?.label || "Workspace"}</strong></div>
        </div>
        <div className="vm-admin-header-actions">
          {can("tickets") && <NotificationBell />}
          <a href="/" target="_blank" rel="noreferrer" className="vm-admin-site-link" aria-label="View corporate website"><Globe size={17} /><span>View website</span></a>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/admin/login"); }} aria-label="Sign out of admin" data-testid="admin-logout"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></Button>
        </div>
      </header>
      <main id="admin-main" className="vm-admin-main"><Outlet /></main>
      <footer className="vm-admin-footer"><span>VETMECH Pharmaceuticals</span><span>The Science of Animal Health</span></footer>
    </div>
  </div>;
}
