import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

const KEY = "vm_cart";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });
  const [calc, setCalc] = useState({ items: [], total_qty: 0, total_free: 0, total_dispatch: 0, line_count: 0 });
  const [open, setOpen] = useState(false);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const recalc = useCallback(async (list) => {
    const payload = (list || items).filter((i) => i.qty > 0);
    if (payload.length === 0) {
      setCalc({ items: [], total_qty: 0, total_free: 0, total_dispatch: 0, line_count: 0 });
      return;
    }
    try {
      const { data } = await api.post("/cart/calculate", {
        items: payload.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
      });
      setCalc(data);
    } catch (e) { /* ignore */ }
  }, [items]);

  useEffect(() => { recalc(items); /* eslint-disable-next-line */ }, [items]);

  const addItem = (variant_id, qty = 1, meta = {}) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.variant_id === variant_id);
      let next;
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
      } else {
        next = [...prev, { variant_id, qty, ...meta }];
      }
      return next;
    });
    toast.success("Added to cart");
  };

  const setQty = (variant_id, qty) => {
    setItems((prev) => prev.map((i) => (i.variant_id === variant_id ? { ...i, qty: Math.max(1, qty) } : i)));
  };

  const removeItem = (variant_id) => setItems((prev) => prev.filter((i) => i.variant_id !== variant_id));
  const clear = () => setItems([]);

  const replaceCart = (list) => setItems(list.map((l) => ({ variant_id: l.variant_id, qty: l.qty })));

  const count = items.reduce((a, b) => a + (b.qty || 0), 0);

  return (
    <CartContext.Provider value={{ items, calc, count, addItem, setQty, removeItem, clear, replaceCart, open, setOpen, recalc }}>
      {children}
    </CartContext.Provider>
  );
}
