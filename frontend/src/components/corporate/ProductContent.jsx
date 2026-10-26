import React from "react";
import { portfolioText } from "@/lib/portfolio.mjs";
import { compositionGroups, labelledLines, safeContentUrl } from "@/lib/productFormatting.mjs";

const ALLOWED = new Set(["div", "p", "br", "strong", "b", "em", "i", "u", "sup", "sub", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "a", "img"]);
const DROP = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "svg", "math", "template"]);

function richNode(node, key) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (DROP.has(tag)) return null;
  const children = [...node.childNodes].filter(child => !["table", "thead", "tbody", "tfoot", "tr"].includes(tag) || child.nodeType !== 3 || child.textContent.trim()).map((child, index) => richNode(child, `${key}-${index}`));
  if (/^h[1-6]$/.test(tag)) return <h4 key={key}>{children}</h4>;
  if (!ALLOWED.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
  const props = { key };
  if (tag === "a") {
    const href = safeContentUrl(node.getAttribute("href"));
    if (!href) return <React.Fragment key={key}>{children}</React.Fragment>;
    props.href = href;
    if (/^https?:\/\//i.test(href)) { props.target = "_blank"; props.rel = "noopener noreferrer"; }
  }
  if (tag === "img") {
    const src = safeContentUrl(node.getAttribute("src"), true);
    return src ? <img key={key} src={src} alt={node.getAttribute("alt") || ""} loading="lazy"/> : null;
  }
  if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"]) { const value = Number(node.getAttribute(name)); if (Number.isInteger(value) && value > 1 && value <= 20) props[name === "colspan" ? "colSpan" : "rowSpan"] = value; }
    if (tag === "th") props.scope = node.getAttribute("scope") === "row" ? "row" : "col";
  }
  if (tag === "table") return <div className="pp-table-scroll" key={key} tabIndex={0} aria-label="Product information table">{React.createElement(tag, {}, children)}</div>;
  return React.createElement(tag, props, ...(tag === "br" ? [] : children));
}

function inlineText(value) {
  return String(value).split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}

function plainContent(value, list = false) {
  const lines = String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (list && lines.length > 1) return <ul className="pp-indication-list">{lines.map((line, index) => <li key={index}>{inlineText(line.replace(/^(?:[-•*]|\d+[.)])\s+/, ""))}</li>)}</ul>;
  const blocks = [];
  let items = [], ordered = false;
  const flush = () => { if (items.length) { const Tag = ordered ? "ol" : "ul"; blocks.push(<Tag key={`list-${blocks.length}`}>{items.map((item, index) => <li key={index}>{inlineText(item)}</li>)}</Tag>); items = []; } };
  for (const line of lines) {
    const item = line.match(/^(?:([-•*])|\d+[.)])\s+(.+)$/);
    if (item) { const nextOrdered = !item[1]; if (items.length && ordered !== nextOrdered) flush(); ordered = nextOrdered; items.push(item[2]); }
    else { flush(); blocks.push(/^#{1,6}\s/.test(line) ? <h4 key={blocks.length}>{inlineText(line.replace(/^#{1,6}\s+/, ""))}</h4> : <p key={blocks.length}>{inlineText(line)}</p>); }
  }
  flush();
  return blocks;
}

export default function ProductContent({ value, kind }) {
  if (!portfolioText(value)) return null;
  if (kind === "composition") {
    const groups = compositionGroups(value);
    if (groups.length) return <div className="pp-composition-groups">{groups.map((group, index) => <div className="pp-formulation" key={index}>
      {group.title && <h3>{group.title}</h3>}{group.intro.map((line, i) => <p className="pp-formulation-intro" key={i}>{line}</p>)}
      <dl>{group.rows.map((row, i) => <div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      {group.notes.map((line, i) => <p className="pp-formulation-note" key={i}>{line}</p>)}
    </div>)}</div>;
  }
  if (kind === "dosage") {
    const rows = labelledLines(value);
    if (rows.length) return <dl className="pp-dose-rows">{rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
  }
  const html = /<\/?[a-z][^>]*>/i.test(String(value || ""));
  const content = html && typeof DOMParser !== "undefined"
    ? [...new DOMParser().parseFromString(String(value), "text/html").body.childNodes].map((node, index) => richNode(node, index))
    : plainContent(html ? portfolioText(value) : value, kind === "indications");
  return <div className="pp-rich-content">{content}</div>;
}
