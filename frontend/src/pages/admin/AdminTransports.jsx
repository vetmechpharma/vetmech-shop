import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Truck, Loader2 } from "lucide-react";

export default function AdminTransports() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", address: "", active: true });
  const { data, isLoading } = useQuery({ queryKey: ["transports"], queryFn: async () => (await api.get("/admin/transports")).data });

  const create = useMutation({ mutationFn: async () => (await api.post("/admin/transports", form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transports"] }); setOpen(false); setForm({ name: "", contact: "", address: "", active: true }); toast.success("Transport added"); },
    onError: (e) => toast.error(apiError(e)) });
  const toggle = useMutation({ mutationFn: async (t) => (await api.put(`/admin/transports/${t.id}`, { active: !t.active })).data, onSuccess: () => qc.invalidateQueries({ queryKey: ["transports"] }) });
  const del = useMutation({ mutationFn: async (id) => (await api.delete(`/admin/transports/${id}`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ["transports"] }); toast.success("Removed"); } });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2"><Truck className="w-6 h-6 text-vm-green" /><div><h1 className="font-heading text-2xl font-bold text-vm-ink">Transport Master</h1><p className="text-slate-500 text-sm">Courier & logistics partners for dispatch</p></div></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => setOpen(true)} data-testid="add-transport"><Plus className="w-4 h-4 mr-1" /> Add Transport</Button>
      </div>
      <div className="border border-vm-border rounded-lg bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Address</TableHead><TableHead className="text-center">Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-400">No transports yet.</TableCell></TableRow>
              : data.items.map((t) => (
                <TableRow key={t.id} data-testid={`transport-${t.id}`}>
                  <TableCell className="font-medium text-vm-ink">{t.name}</TableCell>
                  <TableCell className="text-sm">{t.contact || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{t.address || "—"}</TableCell>
                  <TableCell className="text-center"><Switch checked={t.active} onCheckedChange={() => toggle.mutate(t)} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-500" onClick={() => del.mutate(t.id)} data-testid={`del-transport-${t.id}`}><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Add Transport</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="transport-name" /></div>
            <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter><Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => create.mutate()} disabled={create.isPending} data-testid="save-transport">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
