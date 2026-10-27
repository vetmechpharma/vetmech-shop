export const PAYMENT_MODES = [{ value: "GPAY", label: "GPay" }, { value: "UPI", label: "UPI" }, { value: "NET_BANKING", label: "Net banking" }];
export function ledgerDateToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function amountToPaise(value) {
  const text = String(value).trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error("Enter an amount with up to two decimal places");
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 999999999999) throw new Error("Amount is too large");
  return amount;
}
export const ledgerMoney = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format((value || 0) / 100);
export const ledgerDate = value => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value + "T00:00:00+05:30")) : "—";
export const balanceLabel = value => value > 0 ? "Outstanding" : value < 0 ? "Advance credit" : "Settled balance";

export function ledgerRows(rows) {
  let balance = 0, debit = 0, credit = 0;
  const items = [...rows].sort((a,b) => a.transaction_date.localeCompare(b.transaction_date) || (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id)).map(row => {
    const amount = ["posted", "confirmed"].includes(row.status) ? row.amount_paise : 0;
    const debit_paise = row.entry_type === "invoice" || row.direction === "debit" ? amount : 0;
    const credit_paise = row.entry_type === "payment" || row.direction === "credit" ? amount : 0;
    debit += debit_paise; credit += credit_paise; balance += debit_paise - credit_paise;
    return { ...row, debit_paise, credit_paise, balance_paise: balance };
  });
  return { items: items.reverse(), summary: { debit_paise: debit, credit_paise: credit, balance_paise: balance,
    outstanding_paise: Math.max(0,balance), advance_paise: Math.max(0,-balance), pending_payments: rows.filter(r=>r.status === "pending").length } };
}
