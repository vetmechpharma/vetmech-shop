export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
  "Chandigarh", "Andaman and Nicobar Islands", "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep",
];

export const CUSTOMER_CATEGORIES = [
  { value: "doctor", label: "Doctor" },
  { value: "agency", label: "Agency" },
  { value: "medical_shop", label: "Medical Shop" },
  { value: "distributor", label: "Distributor" },
  { value: "farm", label: "Farm" },
  { value: "other", label: "Other" },
];

export const PREFIXES = ["Dr.", "Mr.", "Mrs.", "Ms.", "Other"];

export const ORDER_STATUSES = [
  { value: "new", label: "New", color: "bg-blue-100 text-blue-700" },
  { value: "confirmed", label: "Confirmed", color: "bg-indigo-100 text-indigo-700" },
  { value: "processing", label: "Processing", color: "bg-amber-100 text-amber-700" },
  { value: "ready_to_dispatch", label: "Ready to Dispatch", color: "bg-purple-100 text-purple-700" },
  { value: "dispatched", label: "Dispatched", color: "bg-cyan-100 text-cyan-700" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
  { value: "on_hold", label: "On Hold", color: "bg-slate-200 text-slate-600" },
];

export const statusMeta = (v) => ORDER_STATUSES.find((s) => s.value === v) || ORDER_STATUSES[0];

export const CUSTOMER_STATUSES = [
  { value: "pending", label: "Pending Approval", color: "bg-amber-100 text-amber-700" },
  { value: "active", label: "Active", color: "bg-green-100 text-green-700" },
  { value: "suspended", label: "Suspended", color: "bg-red-100 text-red-700" },
  { value: "rejected", label: "Rejected", color: "bg-slate-200 text-slate-500" },
  { value: "deleted", label: "Deleted", color: "bg-slate-200 text-slate-400" },
];

export const customerStatusMeta = (v) => CUSTOMER_STATUSES.find((s) => s.value === v) || CUSTOMER_STATUSES[1];

