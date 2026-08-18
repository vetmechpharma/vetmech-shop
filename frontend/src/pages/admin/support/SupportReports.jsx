import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CHART_COLORS } from "@/lib/ticketConstants";
import { exportRows } from "@/lib/exportUtils";
import { Download, FileText } from "lucide-react";

const Panel = ({ title, children }) => <div className="bg-white border border-[#E2E8F0] rounded-xl p-5"><h3 className="font-heading font-bold text-vm-ink mb-4">{title}</h3>{children}</div>;

export default function SupportReports() {
  const { data: r } = useQuery({ queryKey: ["ticket-reports"], queryFn: async () => (await api.get("/tickets/reports")).data });
  if (!r) return <div className="text-slate-400">Loading reports...</div>;

  const exportEmp = (type) => exportRows(r.employee.map((e) => ({ Employee: e.name, Total: e.total, Completed: e.completed, Pending: e.pending, Overdue: e.overdue, CompletionRate: `${e.rate}%` })), "vetmech-employee-performance", type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Reports & Analytics</h1><p className="text-slate-500 text-sm">Ticket, employee & customer performance</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportEmp("csv")} data-testid="rep-csv"><Download className="w-4 h-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportEmp("xlsx")}><Download className="w-4 h-4 mr-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportEmp("pdf")}><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[["Total", r.performance.total], ["Completed", r.performance.completed], ["Pending", r.performance.pending], ["Overdue", r.performance.overdue], ["Avg Hours", r.performance.avg_completion_hours]].map(([l, v]) => (
          <div key={l} className="bg-white border border-[#E2E8F0] rounded-xl p-4"><p className="text-2xl font-heading font-bold text-vm-ink">{v}</p><p className="text-xs text-slate-500">{l}</p></div>
        ))}
      </div>

      <Panel title="Employee Performance">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-vm-bg"><TableHead>Employee</TableHead><TableHead className="text-center">Total</TableHead><TableHead className="text-center">Completed</TableHead><TableHead className="text-center">Pending</TableHead><TableHead className="text-center">Overdue</TableHead><TableHead className="text-center">Completion</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.employee.map((e) => (
                <TableRow key={e.name}>
                  <TableCell className="font-medium text-vm-ink">{e.name}</TableCell>
                  <TableCell className="text-center">{e.total}</TableCell>
                  <TableCell className="text-center text-green-600">{e.completed}</TableCell>
                  <TableCell className="text-center text-yellow-600">{e.pending}</TableCell>
                  <TableCell className="text-center text-red-600">{e.overdue}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2 justify-center"><div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-vm-green" style={{ width: `${e.rate}%` }} /></div><span className="text-xs font-medium">{e.rate}%</span></div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Ticket Type Analysis">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart><Pie data={r.by_type} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fontSize: 10 }}>{r.by_type.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Top Customers & Complaints">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Most Active</p>
          {r.top_customers.slice(0, 5).map((c, i) => <div key={i} className="flex justify-between text-sm border-b border-slate-50 py-1"><span className="text-slate-600">{c.name}</span><span className="font-medium">{c.value}</span></div>)}
          <p className="text-xs uppercase tracking-wider text-slate-400 mt-4 mb-2">Most Complaints</p>
          {r.most_complaints.length ? r.most_complaints.map((c, i) => <div key={i} className="flex justify-between text-sm border-b border-slate-50 py-1"><span className="text-slate-600">{c.name}</span><span className="font-medium text-red-600">{c.value}</span></div>) : <p className="text-sm text-slate-400">None</p>}
        </Panel>
      </div>
    </div>
  );
}
