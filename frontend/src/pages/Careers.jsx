import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Briefcase, MapPin, Clock } from "lucide-react";

export default function Careers() {
  const { data: jobs } = useQuery({ queryKey: ["careers"], queryFn: async () => (await api.get("/careers")).data });
  const [applyJob, setApplyJob] = useState(null);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", qualification: "", experience: "", resume_url: "", message: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [uploading, setUploading] = useState(false);
  const uploadResume = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("File too large (max 2MB)"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/careers/upload-resume", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("resume_url", data.url);
      set("resume_name", data.filename || "Resume uploaded");
      toast.success("Resume uploaded");
    } catch (err) { toast.error(apiError(err)); }
    setUploading(false);
  };

  const submit = async () => {
    if (!form.name || !form.mobile) { toast.error("Name and mobile are required"); return; }
    try {
      await api.post("/careers/apply", { ...form, job_id: applyJob.id, job_title: applyJob.title });
      toast.success("Application submitted successfully");
      setApplyJob(null);
      setForm({ name: "", mobile: "", email: "", qualification: "", experience: "", resume_url: "", message: "" });
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <SEO title="Careers" description="Join the VETMECH team. Explore current openings." />
      <section className="bg-vm-ink text-white"><div className="vm-container py-14"><h1 className="font-heading text-4xl font-bold tracking-tight">Careers at VETMECH</h1><p className="text-slate-300 mt-2">Grow with a company advancing animal health</p></div></section>
      <div className="vm-container py-10 space-y-4 max-w-4xl">
        {(jobs || []).map((j) => (
          <div key={j.id} className="border border-[#E2E8F0] rounded-lg p-5" data-testid={`job-${j.id}`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-heading text-xl font-bold text-vm-ink">{j.title}</h3>
                <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {j.department}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {j.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {j.experience}</span>
                </div>
                <p className="text-sm text-slate-600 mt-3">{j.description}</p>
              </div>
              <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => setApplyJob(j)} data-testid={`apply-${j.id}`}>Apply Now</Button>
            </div>
          </div>
        ))}
        {jobs?.length === 0 && <p className="text-slate-400 text-center py-10">No open positions right now. Check back soon!</p>}
      </div>

      <Dialog open={!!applyJob} onOpenChange={(v) => !v && setApplyJob(null)}>
        <DialogContent className="max-w-lg" data-testid="apply-dialog">
          <DialogHeader><DialogTitle className="font-heading">Apply for {applyJob?.title}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="apply-name" /></div>
            <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} data-testid="apply-mobile" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Qualification</Label><Input value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></div>
            <div><Label>Experience</Label><Input value={form.experience} onChange={(e) => set("experience", e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label>Resume (PDF or DOC, max 2MB)</Label>
              <div className="flex items-center gap-3 mt-1">
                <input id="resume-file" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={uploadResume} data-testid="apply-resume-file" />
                <Button type="button" variant="outline" onClick={() => document.getElementById("resume-file").click()} disabled={uploading} data-testid="apply-resume-btn">{uploading ? "Uploading..." : "Upload Resume"}</Button>
                {form.resume_url && <span className="text-sm text-vm-green truncate" data-testid="apply-resume-name">{form.resume_name || "Uploaded"}</span>}
              </div>
            </div>
          </div>
          <div><Label>Message</Label><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} /></div>
          <Button className="w-full bg-vm-green hover:bg-vm-greenhover" onClick={submit} data-testid="submit-application">Submit Application</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
