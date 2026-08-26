import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import SEO from "@/components/SEO";
import AuthDialog from "@/components/public/AuthDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { statusMeta, CUSTOMER_CATEGORIES } from "@/lib/constants";
import { User, Package, RotateCcw, LogOut, MapPin, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Account() {
  const { customer, loading, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) return <div className="vm-container py-20 text-center text-slate-400">Loading...</div>;

  if (!customer) {
    return (
      <div className="vm-container py-20 max-w-md text-center">
        <SEO title="My Account" />
        <User className="w-14 h-14 mx-auto text-slate-300 mb-4" />
        <h1 className="font-heading text-2xl font-bold text-vm-ink">Login to your account</h1>
        <p className="text-slate-500 mt-2">Login with WhatsApp OTP or your password to view your special pricing, orders and reorder quickly.</p>
        <Button className="mt-6 bg-vm-green hover:bg-vm-greenhover" onClick={() => setAuthOpen(true)} data-testid="account-login-btn">Login</Button>
        <p className="text-sm text-slate-500 mt-3">New customer? <Link to="/register" className="text-vm-green font-semibold hover:underline">Create an account</Link></p>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onLoggedIn={() => {}} />
      </div>
    );
  }

  return <Dashboard customer={customer} logout={logout} />;
}

function Dashboard({ customer, logout }) {
  const navigate = useNavigate();
  const { replaceCart, addItem } = useCart();
  const [reorderData, setReorderData] = useState(null);
  const { data: orders, refetch } = useQuery({ queryKey: ["my-orders"], queryFn: async () => (await api.get("/orders/mine")).data });
  const lastOrder = orders?.[0];

  const doReorder = async (orderId, editMode) => {
    try {
      const { data } = await api.post(`/orders/${orderId}/reorder`);
      if (editMode) {
        setReorderData(data.items);
      } else {
        replaceCart(data.items);
        toast.success("Previous order added to cart");
        navigate("/cart");
      }
    } catch { toast.error("Could not reorder"); }
  };

  return (
    <div className="vm-container py-10">
      <SEO title="My Account" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">Welcome, {customer.name}</h1>
          <p className="text-slate-500 mt-1">{customer.company_name} · {CUSTOMER_CATEGORIES.find((c) => c.value === customer.category)?.label}</p>
          {customer.status === "pending" && (
            <p className="mt-2 inline-block text-xs px-3 py-1 rounded bg-amber-100 text-amber-700" data-testid="account-pending-banner">Account pending approval — your special pricing unlocks once an admin approves your account.</p>
          )}
        </div>
        <Button variant="outline" onClick={logout} data-testid="logout-btn"><LogOut className="w-4 h-4 mr-2" /> Logout</Button>
      </div>

      {/* One-click reorder */}
      {lastOrder && (
        <div className="mt-6 border border-vm-accent/40 bg-vm-bg rounded-lg p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-vm-accent font-semibold">Last Order · {lastOrder.order_number}</p>
              <p className="text-sm text-slate-600 mt-1">{lastOrder.items.map((l) => `${l.product_name} (${l.qty})`).join(", ")}</p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => doReorder(lastOrder.id, false)} data-testid="reorder-btn"><RotateCcw className="w-4 h-4 mr-2" /> Reorder</Button>
              <Button variant="outline" className="border-vm-green text-vm-green" onClick={() => doReorder(lastOrder.id, true)} data-testid="edit-reorder-btn">Edit & Reorder</Button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="orders" className="mt-8">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders"><Package className="w-4 h-4 mr-1" /> My Orders</TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile"><User className="w-4 h-4 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="addresses" data-testid="tab-addresses"><MapPin className="w-4 h-4 mr-1" /> Addresses</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4 space-y-4">
          {orders?.length ? orders.map((o) => (
            <div key={o.id} className="border border-[#E2E8F0] rounded-lg p-4" data-testid={`order-${o.order_number}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-heading font-bold text-vm-green">{o.order_number}</span>
                  <span className="text-xs text-slate-400 ml-3">{new Date(o.created_at).toLocaleDateString()}</span>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded ${statusMeta(o.status).color}`}>{statusMeta(o.status).label}</span>
              </div>
              <div className="mt-3 space-y-1">
                {o.items.map((l) => (
                  <div key={l.variant_id} className="flex justify-between text-sm text-slate-600">
                    <span>{l.product_name} — {l.pack_size} {l.unit}</span>
                    <span>{l.qty}{l.free_qty ? ` +${l.free_qty} free` : ""}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="border-vm-green text-vm-green" onClick={() => doReorder(o.id, false)} data-testid={`reorder-${o.order_number}`}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reorder</Button>
              </div>
            </div>
          )) : <p className="text-slate-400 py-10 text-center">No orders yet. <Link to="/products" className="text-vm-green underline">Start ordering</Link></p>}
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <div className="border border-[#E2E8F0] rounded-lg p-5 grid sm:grid-cols-2 gap-4 text-sm max-w-2xl">
            <div><p className="text-slate-500">Name</p><p className="font-medium text-vm-ink">{customer.prefix} {customer.name}</p></div>
            <div><p className="text-slate-500">Mobile</p><p className="font-medium text-vm-ink">{customer.mobile}</p></div>
            <div><p className="text-slate-500">WhatsApp</p><p className="font-medium text-vm-ink">{customer.whatsapp}</p></div>
            <div><p className="text-slate-500">Company</p><p className="font-medium text-vm-ink">{customer.company_name || "—"}</p></div>
            <div><p className="text-slate-500">Category</p><p className="font-medium text-vm-ink">{CUSTOMER_CATEGORIES.find((c) => c.value === customer.category)?.label}</p></div>
          </div>
        </TabsContent>

        <TabsContent value="addresses" className="mt-4 space-y-3">
          {(customer.addresses || []).map((a) => (
            <div key={a.id} className="border border-[#E2E8F0] rounded-lg p-4 text-sm text-slate-600 max-w-2xl">
              <MapPin className="w-4 h-4 inline mr-1 text-vm-accent" />
              {a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.line3 ? `, ${a.line3}` : ""}, {a.district}, {a.state} - {a.pincode}
            </div>
          ))}
          {(!customer.addresses || customer.addresses.length === 0) && <p className="text-slate-400">No saved addresses.</p>}
        </TabsContent>
      </Tabs>

      {/* Edit & Reorder dialog */}
      <Dialog open={!!reorderData} onOpenChange={(v) => !v && setReorderData(null)}>
        <DialogContent data-testid="edit-reorder-dialog">
          <DialogHeader><DialogTitle className="font-heading">Edit & Reorder</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Schemes are recalculated to current active offers.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {reorderData?.map((l) => (
              <div key={l.variant_id} className="flex items-center gap-3 border border-[#E2E8F0] rounded p-2">
                <div className="w-10 h-10 bg-[#F8FAF9] rounded p-1">{l.image && <img src={mediaUrl(l.image)} alt="" className="w-full h-full object-contain" />}</div>
                <div className="flex-1 text-sm"><p className="font-medium text-vm-ink">{l.product_name}</p><p className="text-xs text-slate-400">{l.pack_size} · Qty {l.qty}{l.free_qty ? ` +${l.free_qty} free` : ""}</p></div>
              </div>
            ))}
          </div>
          <Button className="w-full bg-vm-green hover:bg-vm-greenhover" onClick={() => { replaceCart(reorderData); setReorderData(null); navigate("/cart"); }}>
            <ShoppingCart className="w-4 h-4 mr-2" /> Add all to cart
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
