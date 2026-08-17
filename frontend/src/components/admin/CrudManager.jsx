import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, mediaUrl, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ImageUpload from "./ImageUpload";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

/**
 * Generic admin CRUD manager.
 * props: title, endpoint (e.g. "/admin/brands"), listKey (query key),
 *   columns: [{key,label,render?}], fields: [{name,label,type,options?,placeholder?,default?,span?}],
 *   defaults: {}, listTransform?(data)=>array
 */
export default function CrudManager({ title, subtitle, endpoint, listKey, columns, fields, defaults = {}, listTransform }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: [listKey],
    queryFn: async () => {
      const res = (await api.get(endpoint)).data;
      const arr = listTransform ? listTransform(res) : res;
      return Array.isArray(arr) ? arr : (arr.items || []);
    },
  });

  const save = useMutation({
    mutationFn: async (payload) => {
      if (editing) return (await api.put(`${endpoint}/${editing.id}`, payload)).data;
      return (await api.post(endpoint, payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [listKey] }); setOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`${endpoint}/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [listKey] }); toast.success("Deleted"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const openNew = () => { setEditing(null); setForm({ ...defaults }); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">{title}</h1>{subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}</div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={openNew} data-testid={`add-${listKey}`}><Plus className="w-4 h-4 mr-2" /> Add New</Button>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg">
            {columns.map((c) => <TableHead key={c.key} className="text-vm-ink">{c.label}</TableHead>)}
            <TableHead className="text-right text-vm-ink">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
              : (data || []).length === 0 ? <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-slate-400">No records yet.</TableCell></TableRow>
              : data.map((row) => (
                <TableRow key={row.id} data-testid={`row-${listKey}-${row.id}`}>
                  {columns.map((c) => <TableCell key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? "—")}</TableCell>)}
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} data-testid={`edit-${row.id}`}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500" data-testid={`delete-${row.id}`}><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete this item?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => del.mutate(row.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid={`dialog-${listKey}`}>
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit" : "Add"} {title}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.name} className={f.span === 2 ? "sm:col-span-2" : ""}>
                {f.type !== "switch" && <Label className="mb-1.5 block">{f.label}</Label>}
                {f.type === "text" && <Input value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} data-testid={`field-${f.name}`} />}
                {f.type === "number" && <Input type="number" value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value === "" ? null : Number(e.target.value))} data-testid={`field-${f.name}`} />}
                {f.type === "textarea" && <Textarea rows={f.rows || 3} value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} data-testid={`field-${f.name}`} />}
                {f.type === "image" && <ImageUpload label="" value={form[f.name]} onChange={(v) => set(f.name, v)} testid={`upload-${f.name}`} isPdf={f.isPdf} accept={f.accept} />}
                {f.type === "select" && (
                  <Select value={form[f.name] ?? ""} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger data-testid={`field-${f.name}`}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(typeof f.options === "function" ? f.options() : f.options).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {f.type === "switch" && (
                  <div className="flex items-center justify-between border border-[#E2E8F0] rounded-md px-3 py-2 mt-6">
                    <Label>{f.label}</Label>
                    <Switch checked={!!form[f.name]} onCheckedChange={(v) => set(f.name, v)} data-testid={`field-${f.name}`} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate(form)} disabled={save.isPending} data-testid={`save-${listKey}`}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
