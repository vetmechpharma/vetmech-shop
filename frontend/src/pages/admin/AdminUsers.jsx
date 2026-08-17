import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/lib/adminNav";

export default function AdminUsers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const { data: users, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/admin/users")).data });

  const save = useMutation({
    mutationFn: async (p) => editing ? (await api.put(`/admin/users/${editing.id}`, p)).data : (await api.post("/admin/users", p)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error(apiError(e)),
  });
  const del = useMutation({ mutationFn: async (id) => (await api.delete(`/admin/users/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Deleted"); }, onError: (e) => toast.error(apiError(e)) });

  const openNew = () => { setEditing(null); setForm({ role: "order_manager", active: true }); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u, password: "" }); setOpen(true); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Admin Users</h1><p className="text-slate-500 text-sm">Role-based access control</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={openNew} data-testid="add-admin-user"><Plus className="w-4 h-4 mr-2" /> Add Admin</Button>
      </div>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (users || []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-vm-ink">{u.name}</TableCell><TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell><span className="text-xs bg-vm-bg text-vm-green px-2 py-0.5 rounded">{ROLE_LABELS[u.role]}</span></TableCell>
                  <TableCell>{u.active ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-slate-400 text-xs">No</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {u.name}?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => del.mutate(u.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="admin-user-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit" : "Add"} Admin User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="au-name" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} data-testid="au-email" /></div>
            <div><Label>Password {editing && "(leave blank to keep)"}</Label><Input type="password" value={form.password || ""} onChange={(e) => set("password", e.target.value)} data-testid="au-password" /></div>
            <div><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}><SelectTrigger data-testid="au-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2"><Label>Active</Label><Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => save.mutate(form)} disabled={save.isPending} data-testid="save-admin-user">{save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
