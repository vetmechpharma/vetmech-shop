import React from "react";
import { ticketStatusMeta, priorityMeta } from "@/lib/ticketConstants";

export function StatusBadge({ status }) {
  const m = ticketStatusMeta(status);
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${m.color}`} data-testid={`status-badge-${status}`}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
  </span>;
}

export function PriorityBadge({ priority }) {
  const m = priorityMeta(priority);
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.color}`}>{priority}</span>;
}
