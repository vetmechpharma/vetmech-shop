// Type 1: print only variable text onto the customer's pre-printed colour envelope.
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function envelopeDocument(order, dispatch = order.dispatch || {}) {
  const a = order.address || {};
  const name = a.name || order.customer_name;
  const mobile = a.mobile || order.customer_mobile;
  const area = a.main_area || a.city || a.district;
  if (!name?.trim() || !a.line1?.trim() || !area?.trim() || !/^\d{6}$/.test(String(a.pincode || "")) || !mobile?.trim()) throw new Error("Save the recipient name, street address, main area, six-digit PIN code and mobile before printing.");
  const cases = Number(dispatch.cases);
  if (!Number.isInteger(cases) || cases < 1 || cases > 100000) throw new Error("Enter a whole number of cases between 1 and 100000 before printing.");
  if (!["paid", "to_pay"].includes(dispatch.freight)) throw new Error("Select PAID or TO PAY before printing.");
  const street = [a.line1,a.line2,a.line3].filter(Boolean).join(", ");
  const region = [a.district !== area ? a.district : "",a.state].filter(Boolean).join(", ");
  return `<!doctype html><html><head><meta charset="UTF-8"><title>Envelope ${esc(order.order_number)}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000}
.controls{padding:16px;background:#f3f4f6;font-size:14px}.controls button{padding:10px 18px;font-size:16px;cursor:pointer}.controls p{margin:8px 0}.controls .error{color:#b91c1c;font-weight:bold}
.envelope{position:relative;width:220mm;height:140mm;background:white}
.recipient{position:absolute;left:40mm;top:56mm;width:60mm;height:24mm;font-size:8pt;line-height:1.12;overflow-wrap:anywhere}
.name,.area,.pin,.mobile{font-weight:800}.name{font-size:10pt}.cases{position:absolute;left:55mm;top:30mm;width:25mm;height:10mm;font-size:11pt;font-weight:800;display:flex;align-items:center;justify-content:center}
.freight{position:absolute;left:120mm;top:30mm;font-size:12pt;font-weight:800}
@page{size:220mm 140mm;margin:0}@media screen{body{background:#ddd}.envelope{margin:16px;box-shadow:0 1px 5px #999}.recipient,.cases{outline:1px dashed #bbb}}
@media print{.controls{display:none}html,body{width:220mm;height:140mm}.envelope{margin:0}.blocked .envelope{display:none}}
</style></head><body><div class="controls"><button id="print">Print envelope</button><p>Colour envelope · 22 × 14 cm. Print at 100% / Actual size, margins None, headers and footers Off. Only the variable black text is printed.</p><p>PAID / TO PAY is printed near the case count; its position can be calibrated below.</p><label>Freight left (mm) <input id="fx" type="number" min="0" max="190" value="120"></label> <label>Freight top (mm) <input id="fy" type="number" min="0" max="130" value="30"></label><p id="warning" class="error" role="alert"></p></div><main class="envelope"><div class="cases">${esc(cases)} CASE${cases === 1 ? "" : "S"}</div><div class="freight">${dispatch.freight === "paid" ? "PAID" : "TO PAY"}</div><div class="recipient"><div class="name">${esc(name)}</div><div>${esc(street)}</div><div class="area">${esc(area)}</div>${region ? `<div>${esc(region)}</div>` : ""}<div class="pin">PIN: ${esc(a.pincode)}</div><div class="mobile">Mob: ${esc(mobile)}</div></div></main><script>
const recipient=document.querySelector('.recipient'),button=document.querySelector('#print'),warning=document.querySelector('#warning');
function fit(){recipient.style.fontSize='8pt';recipient.querySelector('.name').style.fontSize='10pt';let size=8;while((recipient.scrollHeight>recipient.clientHeight+1||recipient.scrollWidth>recipient.clientWidth+1)&&size>6.5){size-=.25;recipient.style.fontSize=size+'pt';recipient.querySelector('.name').style.fontSize=(size+2)+'pt'}const bad=recipient.scrollHeight>recipient.clientHeight+1||recipient.scrollWidth>recipient.clientWidth+1;document.body.classList.toggle('blocked',bad);button.disabled=bad;warning.textContent=bad?'Address does not fit the specified 60 × 24 mm area. Close this preview and shorten the address before printing.':''}
button.onclick=()=>{fit();if(!button.disabled)window.print()};window.addEventListener('beforeprint',fit);window.addEventListener('load',fit);
for(const id of ['fx','fy'])document.getElementById(id).oninput=()=>{const x=Number(document.getElementById('fx').value),y=Number(document.getElementById('fy').value);if(x>=0&&x<=190&&y>=0&&y<=130){const el=document.querySelector('.freight');el.style.left=x+'mm';el.style.top=y+'mm'}};
</script></body></html>`;
}
export function printEnvelope(order, dispatch = order.dispatch || {}) {
  const html = envelopeDocument(order, dispatch);
  const preview = window.open("", "_blank", "width=1100,height=750");
  if (!preview) throw new Error("Allow pop-ups to open the envelope preview.");
  preview.opener = null;
  preview.document.open();preview.document.write(html);preview.document.close();
  return true;
}
