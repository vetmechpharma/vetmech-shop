import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";

import PublicLayout from "@/components/public/PublicLayout";
import Home from "@/pages/Home";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import CategoryPage from "@/pages/CategoryPage";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Account from "@/pages/Account";
import CmsPage from "@/pages/CmsPage";
import { NewsList, NewsArticle } from "@/pages/News";
import Gallery from "@/pages/Gallery";
import Careers from "@/pages/Careers";
import Contact from "@/pages/Contact";

import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminSchemes from "@/pages/admin/AdminSchemes";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminUsers from "@/pages/admin/AdminUsers";
import { AdminCategories, AdminBrands, AdminUnits, AdminNews, AdminGallery, AdminCareers } from "@/pages/admin/SimpleCrud";
import { CompanySettings, WhatsAppSettings, SmtpSettings, SeoSettings, HomepageSettings, WebsiteSettings } from "@/pages/admin/AdminSettings";
import { AdminEnquiries, AdminApplications, AdminNotifications, AdminAuditLogs, AdminReports, AdminPages } from "@/pages/admin/AdminMisc";
import BackupSettings from "@/pages/admin/BackupSettings";

import SupportDashboard from "@/pages/admin/support/SupportDashboard";
import Tickets from "@/pages/admin/support/Tickets";
import CrmCustomers from "@/pages/admin/support/CrmCustomers";
import CreateTicket from "@/pages/admin/support/CreateTicket";
import SupportCalendar from "@/pages/admin/support/SupportCalendar";
import SupportReports from "@/pages/admin/support/SupportReports";
import TicketSettings from "@/pages/admin/support/TicketSettings";

function App() {
  return (
    <div className="App">
      <Toaster position="top-center" richColors closeButton />
      <BrowserRouter>
        <AdminAuthProvider>
          <AuthProvider>
            <CartProvider>
              <Routes>
                {/* Public site */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/:slug" element={<ProductDetail />} />
                  <Route path="/categories/:slug" element={<CategoryPage />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order-confirmed/:id" element={<OrderConfirmation />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/about" element={<CmsPage slug="about" />} />
                  <Route path="/quality" element={<CmsPage slug="quality" />} />
                  <Route path="/infrastructure" element={<CmsPage slug="infrastructure" />} />
                  <Route path="/research" element={<CmsPage slug="research" />} />
                  <Route path="/privacy" element={<CmsPage slug="privacy" />} />
                  <Route path="/terms" element={<CmsPage slug="terms" />} />
                  <Route path="/news" element={<NewsList />} />
                  <Route path="/news/:slug" element={<NewsArticle />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/careers" element={<Careers />} />
                  <Route path="/contact" element={<Contact />} />
                </Route>

                {/* Admin */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="brands" element={<AdminBrands />} />
                  <Route path="units" element={<AdminUnits />} />
                  <Route path="schemes" element={<AdminSchemes />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="pages" element={<AdminPages />} />
                  <Route path="news" element={<AdminNews />} />
                  <Route path="gallery" element={<AdminGallery />} />
                  <Route path="careers" element={<AdminCareers />} />
                  <Route path="applications" element={<AdminApplications />} />
                  <Route path="enquiries" element={<AdminEnquiries />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="whatsapp" element={<WhatsAppSettings />} />
                  <Route path="smtp" element={<SmtpSettings />} />
                  <Route path="seo" element={<SeoSettings />} />
                  <Route path="settings" element={<CompanySettings />} />
                  <Route path="settings/homepage" element={<HomepageSettings />} />
                  <Route path="settings/website" element={<WebsiteSettings />} />
                  <Route path="backup" element={<BackupSettings />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="audit" element={<AdminAuditLogs />} />

                  {/* Customer Support / Ticketing */}
                  <Route path="support" element={<SupportDashboard />} />
                  <Route path="support/customers" element={<CrmCustomers />} />
                  <Route path="support/tickets" element={<Tickets />} />
                  <Route path="support/my-tasks" element={<Tickets mine />} />
                  <Route path="support/calendar" element={<SupportCalendar />} />
                  <Route path="support/create-ticket" element={<CreateTicket />} />
                  <Route path="support/reports" element={<SupportReports />} />
                  <Route path="support/settings" element={<TicketSettings />} />
                </Route>
              </Routes>
            </CartProvider>
          </AuthProvider>
        </AdminAuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
