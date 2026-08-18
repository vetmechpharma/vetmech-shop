import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";

const DOT = { assigned: "bg-blue-500", status: "bg-green-500", comment: "bg-yellow-500", overdue: "bg-red-500" };

export default function NotificationBell() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ["ticket-notifs"],
    queryFn: async () => (await api.get("/tickets/notifications/list")).data,
    refetchInterval: 30000,
  });
  const items = data?.items || [];
  const unread = data?.unread || 0;

  const markAll = async () => { await api.patch("/tickets/notifications/read-all"); qc.invalidateQueries({ queryKey: ["ticket-notifs"] }); };
  const open = async (n) => { await api.patch(`/tickets/notifications/${n.id}/read`); qc.invalidateQueries({ queryKey: ["ticket-notifs"] }); nav(`/admin/support/tickets?open=${n.ticket_id}`); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notification-bell" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 grid place-items-center rounded-full">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-heading font-bold text-vm-ink text-sm">Notifications</span>
          <button onClick={markAll} className="text-xs text-vm-green flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
            : items.map((n) => (
              <button key={n.id} onClick={() => open(n)} className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-vm-bg flex gap-2 ${!n.read ? "bg-blue-50/40" : ""}`} data-testid={`notif-${n.id}`}>
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${DOT[n.type] || "bg-slate-400"}`} />
                <div><p className="text-sm text-vm-ink">{n.message}</p><p className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p></div>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
