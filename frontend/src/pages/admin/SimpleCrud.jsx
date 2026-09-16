import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import CrudManager from "@/components/admin/CrudManager";
import { CUSTOMER_CATEGORIES } from "@/lib/constants";

const Img = (row) => row.image ? <img src={mediaUrl(row.image)} alt="" className="w-10 h-10 object-contain bg-[#F8FAF9] rounded" /> : "—";
const Bool = (v) => v ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-slate-400 text-xs">No</span>;

export function AdminCategories() {
  const { data: cats } = useQuery({ queryKey: ["all-cats-opts"], queryFn: async () => (await api.get("/admin/categories")).data });
  const parentOptions = () => [{ value: "none", label: "— None (Top level) —" }, ...(cats || []).filter((c) => !c.parent_id).map((c) => ({ value: c.id, label: c.name }))];
  return (
    <CrudManager
      title="Categories" subtitle="Manage product categories and subcategories"
      endpoint="/admin/categories" listKey="admin-categories"
      columns={[
        { key: "image", label: "Image", render: Img },
        { key: "name", label: "Name" },
        { key: "slug", label: "Slug" },
        { key: "parent", label: "Type", render: (r) => r.parent_id ? "Subcategory" : "Main" },
        { key: "active", label: "Active", render: (r) => Bool(r.active) },
      ]}
      defaults={{ active: true, order: 0, parent_id: "none" }}
      fields={[
        { name: "name", label: "Category Name", type: "text", span: 2 },
        { name: "slug", label: "URL Slug (optional)", type: "text" },
        { name: "parent_id", label: "Parent Category", type: "select", options: parentOptions },
        { name: "description", label: "Description", type: "textarea", span: 2 },
        { name: "image", label: "Category Image", type: "image", span: 2 },
        { name: "seo", label: "SEO (title, description, keywords, intro)", type: "seogroup", span: 2 },
        { name: "order", label: "Display Order", type: "number" },
        { name: "active", label: "Active", type: "switch" },
      ]}
    />
  );
}

export function AdminBrands() {
  return (
    <CrudManager title="Brands" subtitle="Manage product brands" endpoint="/admin/brands" listKey="admin-brands"
      columns={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "active", label: "Active", render: (r) => Bool(r.active) }]}
      defaults={{ active: true }}
      fields={[
        { name: "name", label: "Brand Name", type: "text", span: 2 },
        { name: "description", label: "Description", type: "textarea", span: 2 },
        { name: "logo", label: "Logo", type: "image", span: 2 },
        { name: "active", label: "Active", type: "switch" },
      ]}
    />
  );
}

export function AdminUnits() {
  return (
    <CrudManager title="Units" subtitle="Configurable measurement units" endpoint="/admin/units" listKey="admin-units"
      columns={[{ key: "name", label: "Unit Name" }]}
      fields={[{ name: "name", label: "Unit Name (e.g. Bottle, Strip, Vial)", type: "text", span: 2 }]}
    />
  );
}

export function AdminNews() {
  return (
    <CrudManager title="News & Articles" subtitle="Manage news posts" endpoint="/admin/news" listKey="admin-news"
      columns={[
        { key: "featured_image", label: "Image", render: (r) => r.featured_image ? <img src={mediaUrl(r.featured_image)} alt="" className="w-14 h-10 object-cover rounded" /> : "—" },
        { key: "title", label: "Title" }, { key: "category", label: "Category" },
        { key: "active", label: "Published", render: (r) => Bool(r.active) },
      ]}
      defaults={{ active: true, author: "VETMECH Team", category: "News" }}
      fields={[
        { name: "title", label: "Title", type: "text", span: 2 },
        { name: "slug", label: "URL Slug (optional)", type: "text" },
        { name: "category", label: "Category", type: "text" },
        { name: "author", label: "Author", type: "text" },
        { name: "excerpt", label: "Excerpt (shown on the news list card)", type: "textarea" },
        { name: "content", label: "Content", type: "richtext", span: 2 },
        { name: "featured_image", label: "Featured Image", type: "image", span: 2 },
        { name: "active", label: "Published", type: "switch" },
      ]}
    />
  );
}

export function AdminGallery() {
  return (
    <CrudManager title="Gallery" subtitle="Manage gallery images and albums" endpoint="/admin/gallery" listKey="admin-gallery"
      columns={[{ key: "image", label: "Image", render: Img }, { key: "title", label: "Title" }, { key: "album", label: "Album" }, { key: "active", label: "Active", render: (r) => Bool(r.active) }]}
      defaults={{ active: true, album: "General", order: 0 }}
      fields={[
        { name: "title", label: "Title", type: "text" },
        { name: "album", label: "Album", type: "text" },
        { name: "description", label: "Description", type: "textarea", span: 2 },
        { name: "image", label: "Image", type: "image", span: 2 },
        { name: "order", label: "Order", type: "number" },
        { name: "active", label: "Active", type: "switch" },
      ]}
    />
  );
}

export function AdminCareers() {
  return (
    <CrudManager title="Careers" subtitle="Manage job openings" endpoint="/admin/careers" listKey="admin-careers"
      columns={[{ key: "title", label: "Job Title" }, { key: "department", label: "Department" }, { key: "location", label: "Location" }, { key: "active", label: "Open", render: (r) => Bool(r.active) }]}
      defaults={{ active: true }}
      fields={[
        { name: "title", label: "Job Title", type: "text" },
        { name: "department", label: "Department", type: "text" },
        { name: "location", label: "Location", type: "text" },
        { name: "experience", label: "Experience", type: "text" },
        { name: "qualification", label: "Qualification", type: "text", span: 2 },
        { name: "description", label: "Description", type: "textarea", span: 2 },
        { name: "requirements", label: "Requirements", type: "textarea", span: 2 },
        { name: "active", label: "Open for Applications", type: "switch" },
      ]}
    />
  );
}
