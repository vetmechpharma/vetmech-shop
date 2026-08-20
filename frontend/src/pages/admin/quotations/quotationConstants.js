export const QUOTE_STATUSES = [
  { value: "draft", label: "Draft", cls: "bg-slate-100 text-slate-600" },
  { value: "sent", label: "Sent", cls: "bg-blue-100 text-blue-700" },
  { value: "accepted", label: "Accepted", cls: "bg-green-100 text-green-700" },
  { value: "rejected", label: "Rejected", cls: "bg-red-100 text-red-700" },
  { value: "expired", label: "Expired", cls: "bg-amber-100 text-amber-700" },
  { value: "cancelled", label: "Cancelled", cls: "bg-slate-200 text-slate-500" },
];

export const statusMeta = (v) => QUOTE_STATUSES.find((s) => s.value === v) || QUOTE_STATUSES[0];

export const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
