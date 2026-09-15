import React, { useRef, useEffect } from "react";
import { Bold, Italic, List, ListOrdered, Heading2, Link2, RemoveFormatting } from "lucide-react";

export default function RichTextEditor({ value, onChange }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && (value || "") !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const emit = () => onChange(ref.current?.innerHTML || "");
  const exec = (cmd, arg) => { document.execCommand(cmd, false, arg); ref.current?.focus(); emit(); };
  const addLink = () => { const url = window.prompt("Enter URL (https://...)"); if (url) exec("createLink", url); };
  const Btn = ({ onClick, children, title }) => (
    <button type="button" title={title} onClick={onClick} className="w-8 h-8 grid place-items-center rounded hover:bg-slate-200 text-slate-600">{children}</button>
  );
  return (
    <div className="border border-[#E2E8F0] rounded-md">
      <div className="flex items-center gap-0.5 border-b border-[#E2E8F0] px-1.5 py-1 flex-wrap bg-slate-50">
        <Btn title="Heading" onClick={() => exec("formatBlock", "<h2>")}><Heading2 className="w-4 h-4" /></Btn>
        <Btn title="Bold" onClick={() => exec("bold")}><Bold className="w-4 h-4" /></Btn>
        <Btn title="Italic" onClick={() => exec("italic")}><Italic className="w-4 h-4" /></Btn>
        <Btn title="Bullet list" onClick={() => exec("insertUnorderedList")}><List className="w-4 h-4" /></Btn>
        <Btn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="w-4 h-4" /></Btn>
        <Btn title="Add link" onClick={addLink}><Link2 className="w-4 h-4" /></Btn>
        <Btn title="Clear formatting" onClick={() => exec("removeFormat")}><RemoveFormatting className="w-4 h-4" /></Btn>
      </div>
      <div ref={ref} contentEditable onInput={emit} data-testid="richtext-editor"
        className="prose-vm max-w-none min-h-[220px] p-3 text-sm focus:outline-none" />
    </div>
  );
}
