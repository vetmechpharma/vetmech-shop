export const ROLE_LABELS = {
  super_admin: "Super Admin",
  product_manager: "Product Manager",
  order_manager: "Order Manager",
  content_manager: "Content Manager",
  sales_manager: "Sales Manager",
  admin: "Admin",
  manager: "Manager",
  sales_executive: "Sales Executive",
  support_user: "Support User",
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
