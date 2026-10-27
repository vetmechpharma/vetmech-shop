import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Clock, CheckCircle2, Truck, PackageCheck, XCircle, IndianRupee, Users, UserCheck, ArrowUpRight, Plus, Package } from "lucide-react";

const STATUS = [
  { key: "today_orders", label: "Today", icon: ShoppingBag, root: true },
  { key: "new", label: "New", icon: Clock }, { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: Clock }, { key: "ready_to_dispatch", label: "Ready to dispatch", icon: PackageCheck },
  { key: "dispatched", label: "Dispatched", icon: Truck }, { key: "delivered", label: "Delivered", icon: PackageCheck }, { key: "cancelled", label: "Cancelled", icon: XCircle },
];
const PIE_COLORS = ["#df2030", "#282a30", "#f08a94", "#8c8f99", "#dbdde2"];

export default function AdminDashboard() {
  const { can } = useAdminAuth();
  const { data: d, isLoading, isError, refetch } = useQuery({ queryKey: ["admin-dashboard"], queryFn: async () => (await api.get("/admin/dashboard")).data });
  if (isLoading) return <div className="py-20 text-slate-500" role="status">Loading business overview…</div>;
  if (isError || !d) return <div className="vm-admin-panel" role="alert"><h1>Overview is unavailable</h1><p>We could not load the latest figures. Please try again.</p><Button onClick={() => refetch()}>Try again</Button></div>;
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date());
  return <div>
    <div className="vm-admin-overview-heading"><div><p className="vm-admin-eyebrow">YOUR BUSINESS, AT A GLANCE</p><h1>Business overview</h1><p>Keep your orders, customers and next steps in focus.</p></div><span className="vm-admin-date">{date}</span></div>
    <div className="vm-admin-kpis">
      <Kpi primary icon={IndianRupee} label="Sales value" value={`₹${Number(d.sales_value || 0).toLocaleString("en-IN")}`} note="Excludes cancelled orders" />
      <Kpi icon={ShoppingBag} label="Total orders" value={d.total_orders ?? 0} note={`${d.today_orders ?? 0} placed today`} />
      <Kpi icon={Users} label="Customers" value={d.total_customers ?? 0} note={`${d.repeat_customers ?? 0} repeat customers`} />
      <Kpi icon={UserCheck} label="Awaiting approval" value={d.pending_customers ?? 0} note="New partner registrations" />
    </div>
    <section className="vm-admin-status-panel"><div className="vm-admin-section-heading"><h2>Order pipeline</h2>{can("orders") && <Link to="/admin/orders">Manage orders <ArrowUpRight size={15} /></Link>}</div>
      <div className="vm-admin-status-grid">{STATUS.map(({ key, label, icon: Icon, root }) => <div className="vm-admin-status-item" key={key} data-testid={`stat-${key}`}><strong>{(root ? d[key] : d.status_counts?.[key]) ?? 0}</strong><span><Icon />{label}</span></div>)}</div>
    </section>
    <div className="vm-admin-chart-grid">
      <Panel title="Order activity" description="Orders received in the last 7 days">
        <ResponsiveContainer width="100%" height={240}><LineChart data={d.trend || []} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eeeef1" /><XAxis dataKey="date" tick={{ fontSize: 12, fill: "#9295a0" }} axisLine={false} tickLine={false} tickMargin={12} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#9295a0" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e8", fontSize: 13 }} /><Line type="monotone" dataKey="orders" name="Orders" stroke="#df2030" strokeWidth={3} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer>
      </Panel>
      <Panel title="Top products" description="Units ordered, excluding cancellations">
        {d.top_products?.length ? <ResponsiveContainer width="100%" height={240}><BarChart data={d.top_products} layout="vertical" margin={{ left: 5, right: 12 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fill: "#737681" }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="qty" name="Units" fill="#292b31" radius={[0, 4, 4, 0]} barSize={18} /></BarChart></ResponsiveContainer> : <Empty />}
      </Panel>
      <Panel title="Category performance" description="Product mix by quantity">
        {d.category_performance?.length ? <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={d.category_performance} dataKey="qty" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} label={{ fontSize: 12 }}>{d.category_performance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty />}
      </Panel>
      <Panel title="Top customers" description="Partners with the most orders">
        {d.top_customers?.length ? d.top_customers.map((customer, index) => <div key={index} className="vm-admin-customer-row"><span><i>{String(index + 1).padStart(2, "0")}</i>{customer.name}</span><strong>{customer.orders} {customer.orders === 1 ? "order" : "orders"}</strong></div>) : <Empty />}
      </Panel>
    </div>
    <nav className="vm-admin-quicklinks" aria-label="Quick actions">{can("products") && <Link to="/admin/products"><Package size={15} /> Product catalogue <ArrowUpRight size={14} /></Link>}{can("customers") && <Link to="/admin/customers"><UserCheck size={15} /> Review customers <ArrowUpRight size={14} /></Link>}{can("quotations") && <Link to="/admin/quotations/new"><Plus size={15} /> New quotation <ArrowUpRight size={14} /></Link>}</nav>
  </div>;
}
function Kpi({ icon: Icon, label, value, note, primary }) { return <div className={`vm-admin-kpi ${primary ? "is-primary" : ""}`}><div className="vm-admin-kpi-top"><span>{label}</span><Icon size={19} /></div><strong>{value}</strong><small>{note}</small></div>; }
function Panel({ title, description, children }) { return <section className="vm-admin-panel"><h2>{title}</h2><p>{description}</p>{children}</section>; }
function Empty() { return <div className="vm-admin-empty">No activity yet.</div>; }
