// Opens a 10x4.5in pre-printed envelope in a new window, auto-filled from an order, ready to print.
export function printEnvelope(order, company = {}) {
  const a = order.address || {};
  const nameLine = order.customer_name || a.name || "Recipient";
  const lines = [
    company ? "" : "",
    a.line1, a.line2,
    [a.city, a.district].filter(Boolean).join(", "),
    [a.state, a.pincode].filter(Boolean).join(" - "),
    order.customer_mobile ? `Mob: ${order.customer_mobile}` : "",
    order.order_number ? `Order: ${order.order_number}` : "",
  ].filter(Boolean);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const addressHtml = lines.map(esc).join("<br>");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Envelope ${esc(order.order_number || "")}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0}
.envelope{width:10in;height:4.5in;position:relative;background:#fff;font-family:Arial,sans-serif}
.recipient{position:absolute;left:4.35in;top:1.55in;width:5.05in;font-size:13pt;line-height:1.45;color:#000}
.recipient .name{font-weight:700;font-size:15pt;margin-bottom:3px}
@page{size:10in 4.5in;margin:0}
@media print{html,body{width:10in;height:4.5in}.envelope{box-shadow:none}}
</style></head><body>
<div class="envelope"><div class="recipient"><div class="name">${esc(nameLine)}</div><div>${addressHtml}</div></div></div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=1000,height=520");
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}
