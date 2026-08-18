export const TICKET_STATUSES = [
  { value: "open", label: "Open", color: "bg-blue-100 text-blue-700", dot: "#3B82F6" },
  { value: "in_progress", label: "In Progress", color: "bg-orange-100 text-orange-700", dot: "#F97316" },
  { value: "pending", label: "Pending", color: "bg-yellow-100 text-yellow-700", dot: "#EAB308" },
  { value: "overdue", label: "Overdue", color: "bg-red-100 text-red-700", dot: "#EF4444" },
  { value: "closed", label: "Closed", color: "bg-green-100 text-green-700", dot: "#22C55E" },
];

export const ticketStatusMeta = (v) => TICKET_STATUSES.find((s) => s.value === v) || TICKET_STATUSES[0];

export const PRIORITIES = [
  { value: "Low", color: "bg-slate-100 text-slate-600" },
  { value: "Normal", color: "bg-blue-100 text-blue-700" },
  { value: "High", color: "bg-orange-100 text-orange-700" },
  { value: "Urgent", color: "bg-red-100 text-red-700" },
];
export const priorityMeta = (v) => PRIORITIES.find((p) => p.value === v) || PRIORITIES[1];

export const CHART_COLORS = ["#045D3A", "#0FA45F", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EAB308", "#14B8A6", "#64748B"];

export const CUSTOMER_TYPES = ["Veterinary Clinic", "Dairy Farm", "Distributor", "Dealer", "Retailer", "Hospital", "Individual", "Other"];
