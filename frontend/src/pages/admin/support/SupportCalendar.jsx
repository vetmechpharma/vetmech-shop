import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import TicketDetailSheet from "@/components/admin/support/TicketDetailSheet";
import { Button } from "@/components/ui/button";
import { ticketStatusMeta } from "@/lib/ticketConstants";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SupportCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const [detailId, setDetailId] = useState(null);
  const { data } = useQuery({ queryKey: ["tickets-cal"], queryFn: async () => (await api.get("/tickets")).data });

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const byDay = {};
  (data?.items || []).forEach((t) => {
    if (t.due_date) {
      const dt = new Date(t.due_date);
      if (dt.getFullYear() === year && dt.getMonth() === month) (byDay[dt.getDate()] ||= []).push(t);
    }
  });

  const monthName = cursor.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Calendar</h1><p className="text-slate-500 text-sm">Due dates, follow-ups & meetings</p></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="font-heading font-bold text-vm-ink w-40 text-center">{monthName}</span>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => (
            <div key={i} className={`min-h-[92px] rounded-lg border p-1.5 ${d ? "border-slate-100" : "border-transparent"}`}>
              {d && <><span className="text-xs text-slate-400">{d}</span>
                <div className="space-y-1 mt-1">
                  {(byDay[d] || []).slice(0, 3).map((t) => {
                    const m = ticketStatusMeta(t.effective_status);
                    return <button key={t.id} onClick={() => setDetailId(t.id)} className={`w-full text-left text-[10px] rounded px-1 py-0.5 truncate ${m.color}`} data-testid={`cal-ticket-${t.ticket_number}`}>{t.ticket_number} {t.company_name}</button>;
                  })}
                  {(byDay[d] || []).length > 3 && <span className="text-[10px] text-slate-400">+{byDay[d].length - 3} more</span>}
                </div></>}
            </div>
          ))}
        </div>
      </div>
      <TicketDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
