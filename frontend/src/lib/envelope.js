// Type 1: black variable text only, on a pre-printed 220 × 140 mm envelope.
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const ENVELOPE_SETTINGS_KEY = "vm_colour_envelope_alignment_v3";
export const ENVELOPE_DEFAULTS = {ax:40,ay:56,aw:130,ah:40,cx:20,cy:30,px:120,py:30,tx:148,ty:30};
export function envelopeSettings(input = {}) {
  const next={...ENVELOPE_DEFAULTS};
  for(const key of Object.keys(next))if(typeof input?.[key]==="number"&&Number.isFinite(input[key]))next[key]=input[key];
  if(next.ax<0||next.ay<0||next.aw<60||next.ah<24||next.ax+next.aw>220||next.ay+next.ah>140||next.cx<0||next.cx>195||next.cy<0||next.cy>130||next.px<0||next.px>190||next.py<0||next.py>130||next.tx<0||next.tx>190||next.ty<0||next.ty>130)return {...ENVELOPE_DEFAULTS};
  return next;
}
export function envelopeDocument(order, dispatch = order.dispatch || {}, options = {}) {
  const a=order.address||{},name=a.name||order.customer_name,mobile=a.mobile||order.customer_mobile,area=a.main_area||a.city||a.district;
  if(!name?.trim()||!a.line1?.trim()||!area?.trim()||!/^\d{6}$/.test(String(a.pincode||""))||!mobile?.trim())throw new Error("Save the recipient name, street address, main area, six-digit PIN code and mobile before printing.");
  const cases=Number(dispatch.cases);
  if(!Number.isInteger(cases)||cases<1||cases>100000)throw new Error("Enter a whole number of cases between 1 and 100000 before printing.");
  if(!["paid","to_pay"].includes(dispatch.freight))throw new Error("Select PAID or TO PAY before printing.");
  const settings=envelopeSettings(options),paid=dispatch.freight==="paid",street=[a.line1,a.line2,a.line3].filter(Boolean).join(", "),region=[a.district!==area?a.district:"",a.state].filter(Boolean).join(", ");
  const field=(key,label)=>`<label>${label}<input id="${key}" type="number" min="0" step="0.5" value="${settings[key]}"></label>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><title>Envelope ${esc(order.order_number)}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000}
.controls{padding:16px;background:#f3f4f6;font-size:14px}.controls button{padding:10px 18px;font-size:15px;cursor:pointer}.controls p{margin:8px 0}.controls .error{color:#b91c1c;font-weight:bold}.calibration{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.calibration label{display:grid;gap:4px;font-size:12px}.calibration input{width:100px;padding:6px}
.envelope{position:relative;width:220mm;height:140mm;background:#fff}
.recipient{position:absolute;left:${settings.ax}mm;top:${settings.ay}mm;width:${settings.aw}mm;height:${settings.ah}mm;font-size:12pt;line-height:1.18;overflow-wrap:anywhere}
.name{font-size:16pt;font-weight:800;margin-bottom:1mm}.area,.pin,.mobile{font-size:14pt;font-weight:800}.locality{margin-top:1mm}.mobile{margin-top:1mm}
.cases{position:absolute;left:${settings.cx}mm;top:${settings.cy}mm;width:25mm;height:10mm;font-size:18pt;font-weight:800;display:flex;align-items:center;justify-content:center}
.freight{position:absolute;left:${paid?settings.px:settings.tx}mm;top:${paid?settings.py:settings.ty}mm;font-size:12pt;font-weight:800}
@page{size:220mm 140mm;margin:0}@media screen{body{background:#ddd}.envelope{margin:16px;box-shadow:0 1px 5px #999}.recipient,.cases{outline:1px dashed #999}}
@media print{.controls{display:none}html,body{width:220mm;height:140mm}.envelope{margin:0}.blocked .envelope{visibility:hidden}}
</style></head><body><div class="controls"><button id="print">Print envelope</button> <button id="save">Save alignment on this browser</button> <button id="reset">Reset alignment</button><p>Colour envelope · 22 × 14 cm. Use Actual size / 100%, no margins, headers and footers Off. Only black text prints.</p><p>Cases prints only the number in the empty total-count box. Adjust all distances below in mm from the top-left corner. Test one envelope before a batch.</p><details><summary>Adjust print alignment</summary><div class="calibration">${field("ax","Address left")}${field("ay","Address top")}${field("aw","Address width")}${field("ah","Address height")}${field("cx","Case number left")}${field("cy","Case number top")}${field("px","PAID left")}${field("py","PAID top")}${field("tx","TO PAY left")}${field("ty","TO PAY top")}</div></details><p id="warning" class="error" role="alert"></p><p id="saved" role="status"></p></div><main class="envelope"><div class="cases">${esc(cases)}</div><div class="freight">${paid?"PAID":"TO PAY"}</div><div class="recipient"><div class="name">${esc(name)}</div><div>${esc(street)}</div>${region?`<div>${esc(region)}</div>`:""}<div class="locality"><span class="area">${esc(area)}</span> · <span class="pin">PIN: ${esc(a.pincode)}</span></div><div class="mobile">Mob: ${esc(mobile)}</div></div></main><script>
const defaults=${JSON.stringify(ENVELOPE_DEFAULTS)},storageKey=${JSON.stringify(ENVELOPE_SETTINGS_KEY)},paid=${paid},recipient=document.querySelector('.recipient'),button=document.querySelector('#print'),warning=document.querySelector('#warning');
function values(){return Object.fromEntries(Object.keys(defaults).map(k=>[k,document.getElementById(k).value===''?NaN:Number(document.getElementById(k).value)]))}
function valid(s){return Object.values(s).every(Number.isFinite)&&s.ax>=0&&s.ay>=0&&s.aw>=60&&s.ah>=24&&s.ax+s.aw<=220&&s.ay+s.ah<=140&&s.cx>=0&&s.cx<=195&&s.cy>=0&&s.cy<=130&&s.px>=0&&s.px<=190&&s.py>=0&&s.py<=130&&s.tx>=0&&s.tx<=190&&s.ty>=0&&s.ty<=130}
function fit(){const s=values();let bad=!valid(s);if(!bad){recipient.style.left=s.ax+'mm';recipient.style.top=s.ay+'mm';recipient.style.width=s.aw+'mm';recipient.style.height=s.ah+'mm';const c=document.querySelector('.cases'),f=document.querySelector('.freight');c.style.left=s.cx+'mm';c.style.top=s.cy+'mm';f.style.left=(paid?s.px:s.tx)+'mm';f.style.top=(paid?s.py:s.ty)+'mm';let size=12;const resize=()=>{recipient.style.fontSize=size+'pt';recipient.querySelector('.name').style.fontSize=(size+4)+'pt';for(const el of recipient.querySelectorAll('.area,.pin,.mobile'))el.style.fontSize=(size+2)+'pt'};resize();while((recipient.scrollHeight>recipient.clientHeight+1||recipient.scrollWidth>recipient.clientWidth+1)&&size>10){size-=.25;resize()}bad=recipient.scrollHeight>recipient.clientHeight+1||recipient.scrollWidth>recipient.clientWidth+1;warning.textContent=bad?'Address does not fit. Increase the address area or shorten the address; text will not shrink below 10 pt.':''}else warning.textContent='Invalid alignment: keep all text inside the 220 × 140 mm envelope. Address minimum: 60 × 24 mm.';document.body.classList.toggle('blocked',bad);button.disabled=bad;return !bad}
button.onclick=()=>{if(fit())window.print()};window.addEventListener('beforeprint',fit);window.addEventListener('load',fit);
for(const key of Object.keys(defaults))document.getElementById(key).oninput=()=>{document.querySelector('#saved').textContent='Alignment changed. Save to reuse on this browser.';fit()};
document.querySelector('#save').onclick=()=>{if(!fit())return;try{localStorage.setItem(storageKey,JSON.stringify(values()));document.querySelector('#saved').textContent='Alignment saved on this browser.'}catch{document.querySelector('#saved').textContent='Browser storage unavailable. Current alignment can still be printed.'}};
document.querySelector('#reset').onclick=()=>{for(const key of Object.keys(defaults))document.getElementById(key).value=defaults[key];try{localStorage.removeItem(storageKey);localStorage.removeItem("vm_colour_envelope_alignment_v2")}catch{}document.querySelector('#saved').textContent='Default alignment restored.';fit()};
</script></body></html>`;
}
export function printEnvelope(order, dispatch = order.dispatch || {}) {
  let settings={};try{const current=window.localStorage.getItem(ENVELOPE_SETTINGS_KEY);if(current!==null)settings=JSON.parse(current);else{settings=JSON.parse(window.localStorage.getItem("vm_colour_envelope_alignment_v2")||"{}");if(settings?.cx===32)settings.cx=20}}catch{}
  const html=envelopeDocument(order,dispatch,settings),preview=window.open("","_blank","width=1100,height=800");
  if(!preview)throw new Error("Allow pop-ups to open the envelope preview.");
  preview.opener=null;preview.document.open();preview.document.write(html);preview.document.close();return true;
}
