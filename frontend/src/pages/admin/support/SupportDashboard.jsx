import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { StatusBadge, PriorityBadge } from "@/components/admin/support/TicketBadges";
import { CHART_COLORS } from "@/lib/ticketConstants";
import { Ticket, FolderOpen, Loader2, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

const KPIS = [
  { key: "total", label: "Total Tickets", icon: Ticket, grad: "from-slate-700 to-slate-900", status: null },
  { key: "open", label: "Open", icon: FolderOpen, grad: "from-blue-500 to-blue-700", status: "open" },
  { key: "in_progress", label: "In Progress", icon: Loader2, grad: "from-orange-400 to-orange-600", status: "in_progress" },
  { key: "pending", label: "Pending", icon: Clock, grad: "from-yellow-400 to-amber-500", status: "pending" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, grad: "from-red-500 to-rose-600", status: "overdue" },
  { key: "completed", label: "Completed", icon: CheckCircle2, grad: "from-emerald-500 to-green-700", status: "closed" },
];

const Panel = ({ title, children, className = "" }) => (
  <div className={`bg-white border border-[#E2E8F0] rounded-xl p-5 ${className}`}>
    <h3 className="font-heading font-bold text-vm-ink mb-4">{title}</h3>{children}
  </div>
);

export default function SupportDashboard() {
  const nav = useNavigate();
  const { data: d } = useQuery({ queryKey: ["ticket-dashboard"], queryFn: async () => (await api.get("/tickets/dashboard")).data });
  if (!d) return <div className="text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading dashboard...</div>;

  const goStatus = (s) => nav(s ? `/admin/support/tickets?status=${s}` : "/admin/support/tickets");

  return (
    <div className="space-y-6">
      <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Support Dashboard</h1><p className="text-slate-500 text-sm">Customer follow-ups & service tickets overview</p></div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <button key={k.key} onClick={() => goStatus(k.status)} className={`bg-gradient-to-br ${k.grad} rounded-xl p-4 text-left text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`} data-testid={`kpi-${k.key}`}>
              <div className="w-9 h-9 rounded-lg grid place-items-center bg-white/20"><Icon className="w-5 h-5" /></div>
              <p className="text-3xl font-heading font-bold mt-3">{d.kpi[k.key]}</p>
              <p className="text-xs text-white/80">{k.label}</p>
            </button>
          );
        })}
      </div>

      {/* Row: overview + type + priority */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Panel title="Ticket Overview" className="lg:col-span-1">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={d.overview}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="open" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="in_progress" stroke="#F97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pending" stroke="#EAB308" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closed" stroke="#22C55E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Tickets by Type">
          <DonutChart data={d.by_type} onClick={(name) => nav(`/admin/support/tickets?type=${encodeURIComponent(name)}`)} />
        </Panel>
        <Panel title="Priority Wise">
          <DonutChart data={d.by_priority} />
        </Panel>
      </div>

      {/* Row: recent + overdue */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Recent Tickets">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="px-2 pb-2">Ticket</th><th className="pb-2">Customer</th><th className="pb-2">Status</th><th className="pb-2">Due</th></tr></thead>
              <tbody>
                {d.recent.map((t) => (
                  <tr key={t.id} className="border-t border-slate-50 hover:bg-vm-bg cursor-pointer" onClick={() => nav(`/admin/support/tickets?open=${t.id}`)} data-testid={`recent-${t.ticket_number}`}>
                    <td className="px-2 py-2 font-medium text-vm-green">{t.ticket_number}</td>
                    <td className="py-2 text-slate-600">{t.company_name}</td>
                    <td className="py-2"><StatusBadge status={t.effective_status} /></td>
                    <td className="py-2 text-slate-500">{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Overdue Tickets">
          <div className="space-y-2">
            {d.overdue.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No overdue tickets 🎉</p> :
              d.overdue.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-l-4 border-red-500 bg-red-50/50 rounded-r p-2.5 cursor-pointer hover:bg-red-50" onClick={() => nav(`/admin/support/tickets?open=${t.id}`)}>
                  <div><p className="font-medium text-vm-ink text-sm">{t.ticket_number} · {t.company_name}</p><p className="text-xs text-slate-500">{t.assignee_name} · Due {new Date(t.due_date).toLocaleDateString()}</p></div>
                  <div className="text-right"><PriorityBadge priority={t.priority} /><p className="text-xs text-red-600 font-semibold mt-1">{t.days_overdue}d late</p></div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      {/* Row: status + assignee + daily + top customers */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Tickets by Status"><DonutChart data={d.by_status} onClick={() => {}} /></Panel>
        <Panel title="Tickets by Assignee">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.by_assignee} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="value" fill="#045D3A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Panel title="Daily Ticket Trend">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.trend}><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#0FA45F" strokeWidth={2} /></LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Top Customers">
          <div className="space-y-2">
            {d.top_customers.map((c, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-slate-50 pb-1.5"><span className="text-slate-600">{c.name}</span><span className="font-semibold text-vm-ink">{c.value}</span></div>
            ))}
          </div>
        </Panel>
        <Panel title="Task Status Summary">
          <div className="space-y-2 text-sm">
            {[["Today's Tasks", d.task_summary.today], ["Upcoming", d.task_summary.upcoming], ["Pending", d.task_summary.pending], ["Overdue", d.task_summary.overdue], ["Completed", d.task_summary.completed]].map(([l, v]) => (
              <div key={l} className="flex justify-between"><span className="text-slate-500">{l}</span><span className="font-heading font-bold text-vm-ink">{v}</span></div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Upcoming Due Tickets">
          <div className="space-y-2">
            {d.upcoming.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">Nothing upcoming.</p> :
              d.upcoming.map((t) => (
                <div key={t.id} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2 cursor-pointer hover:bg-vm-bg rounded px-1" onClick={() => nav(`/admin/support/tickets?open=${t.id}`)}>
                  <div><span className="font-medium text-vm-green">{t.ticket_number}</span> <span className="text-slate-500">{t.company_name}</span></div>
                  <span className="text-slate-500">{new Date(t.due_date).toLocaleDateString()}</span>
                </div>
              ))}
          </div>
        </Panel>
        <Panel title="Recent Activity">
          <div className="space-y-3">
            {d.activity.map((a, i) => (
              <div key={i} className="text-sm border-l-2 border-vm-accent/30 pl-3"><p className="text-vm-ink">{a.message || a.action} <span className="text-vm-green">{a.ticket_number}</span></p><p className="text-xs text-slate-400">{a.user} · {new Date(a.at).toLocaleString()}</p></div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DonutChart({ data, onClick }) {
  const total = (data || []).reduce((a, b) => a + b.value, 0);
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}
          onClick={(e) => onClick && onClick(e.name)}>
          {(data || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} cursor="pointer" />)}
        </Pie>
        <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-vm-ink font-heading" style={{ fontSize: 22, fontWeight: 700 }}>{total}</text>
      </PieChart>
    </ResponsiveContainer>
  );
}
