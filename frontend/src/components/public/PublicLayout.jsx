import React from "react";
import { Outlet } from "react-router-dom";
import Header from "@/components/corporate/Header";
import Footer from "@/components/corporate/Footer";
import SeoGlobals from "./SeoGlobals";
import "@/components/corporate/corporate.css";

export default function PublicLayout() {
  return (
    <div className="corp-site">
      <a href="#main-content" className="corp-skip-link">Skip to content</a>
      <SeoGlobals />
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
