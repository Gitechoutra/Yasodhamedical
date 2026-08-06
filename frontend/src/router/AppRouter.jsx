import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "../pages/Landing";
import PrivacyPolicy from "../pages/legal/PrivacyPolicy";
import Terms from "../pages/legal/Terms";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Patients from "../pages/Patients";
import Appointments from "../pages/Appointments";
import Consultations from "../pages/Consultations";
import ConsultationRoom from "../pages/ConsultationRoom";
import Cases from "../pages/Cases";
import CaseRecord from "../pages/CaseRecord";
import KnowledgeBase from "../pages/KnowledgeBase";
import Prescriptions from "../pages/Prescriptions";
import Doctors from "../pages/Doctors";
import StaffManagement from "../pages/StaffManagement";
import Departments from "../pages/Departments";
import DepartmentDetail from "../pages/DepartmentDetail";
import NursingMonitor from "../pages/NursingMonitor";
import NursingUpdates from "../pages/NursingUpdates";
import NursingRecord from "../pages/NursingRecord";
import Reports from "../pages/Reports";
import Settings from "../pages/Settings";
import Profile from "../pages/Profile";
import NurseDashboard from "../pages/nurse/NurseDashboard";
import NursePatients from "../pages/nurse/NursePatients";
import NursePatientRecord from "../pages/nurse/NursePatientRecord";
import NurseAlerts from "../pages/nurse/NurseAlerts";
import PharmacyLayout from "../layouts/PharmacyLayout";
import PharmacyDashboard from "../pages/pharmacy/PharmacyDashboard";
import AddMedicine from "../pages/pharmacy/AddMedicine";
import Inventory from "../pages/pharmacy/Inventory";
import PharmacyDepartments from "../pages/pharmacy/Departments";
import MedicineRequests from "../pages/pharmacy/MedicineRequests";
import Categories from "../pages/pharmacy/Categories";
import MedicineSearch from "../pages/pharmacy/MedicineSearch";
import StockIn from "../pages/pharmacy/StockIn";
import StockAlerts from "../pages/pharmacy/StockAlerts";
import PharmacySoon from "../pages/pharmacy/PharmacySoon";
import DashboardLayout from "../layouts/DashboardLayout";
import NurseLayout from "../layouts/NurseLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleRoute from "../components/RoleRoute";

// Org-structure screens. Hidden from the doctor sidebar (see Sidebar.jsx) and
// unreachable by URL for doctors — keep the two lists in step.
const ADMIN_ONLY_DENY = ["doctor"];

// Patient care. Reception registers and schedules; it never sees what was
// diagnosed or prescribed. Blocked here so a bookmark or typed URL bounces,
// and blocked again on the API, which 403s these routes for this role.
const CLINICAL_DENY = ["receptionist"];

// Sections of the pharmacy sidebar that are mapped out but not built. Listed
// here rather than silently omitted so the nav stays honest — each renders a
// page that says what it needs, instead of 404ing or showing a fake table.
const PHARMACY_SOON = [
  {
    path: "prescriptions/pending",
    title: "Pending prescriptions",
    blurb: "Doctor-verified prescriptions waiting to be dispensed at this counter.",
    needs: ["A dispense record linking a prescription to the batch it was filled from", "Partial-fill handling when stock runs short"],
  },
  {
    path: "prescriptions/dispensed",
    title: "Dispensed prescriptions",
    blurb: "What this counter has filled, and from which batch.",
    needs: ["The dispense record above"],
  },
  {
    path: "prescriptions/history",
    title: "Prescription history",
    blurb: "Full dispensing history per patient.",
    needs: ["The dispense record above"],
  },
  {
    path: "purchases/orders",
    title: "Purchase orders",
    blurb: "Raise and track orders with suppliers.",
    needs: ["A supplier record", "Purchase order and line-item models", "Goods-received matching against the order"],
  },
  {
    path: "purchases/suppliers",
    title: "Suppliers",
    blurb: "Who you buy from, and on what terms.",
    needs: ["A supplier record with GSTIN and payment terms"],
  },
  {
    path: "purchases/received",
    title: "Stock received",
    blurb: "Deliveries booked against a purchase order.",
    needs: ["Purchase orders", "Stock In already works standalone — this links it to an order"],
  },
  {
    path: "billing/new",
    title: "New bill",
    blurb: "Sell over the counter or against a prescription.",
    needs: ["Bill and bill-line models", "GST rate per medicine (HSN code)", "Payment capture and a printable invoice"],
  },
  {
    path: "billing/transactions",
    title: "Transactions",
    blurb: "Every bill raised at this counter.",
    needs: ["The billing models above"],
  },
  {
    path: "billing/refunds",
    title: "Refunds",
    blurb: "Return a sale and put the stock back.",
    needs: ["The billing models above", "A stock-return movement so quantities stay correct"],
  },
  {
    path: "stock/out",
    title: "Stock out",
    blurb: "Issue stock to a ward, another branch, or write it off.",
    needs: ["A stock movement ledger so every in and out has an auditable reason"],
  },
  {
    path: "stock/damaged",
    title: "Damaged medicines",
    blurb: "Record breakage and spoilage.",
    needs: ["The stock movement ledger above"],
  },
  // Explicit titles rather than derived from the slug: "profit-loss" and
  // "gst" do not title-case correctly by rule.
  ...[
    ["sales", "Sales"],
    ["purchases", "Purchases"],
    ["inventory", "Inventory"],
    ["profit-loss", "Profit & Loss"],
    ["gst", "GST"],
  ].map(([slug, title]) => ({
    path: `reports/${slug}`,
    title: `${title} report`,
    blurb:
      "Reporting is deliberately last — a report is only as honest as the transactions underneath it.",
    needs: [
      "Billing and purchase records to aggregate",
      "GST rates per medicine for tax reporting",
    ],
  })),
  {
    path: "notifications",
    title: "Notifications",
    blurb: "Low-stock and expiry alerts for this counter.",
    needs: ["Scheduled checks that raise a notification, reusing the existing notification model"],
  },
];

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />

        {/* One login for everyone at /login; a nurse is routed here on the
            way out of it. The nursing module stays its own tree because a
            nurse's whole job is the assignments handed to them and none of the
            doctor/admin screens apply — but it is a dashboard, not a second
            portal, and it has no sign-in page of its own. */}
        <Route path="/nurse" element={<NurseLayout />}>
          <Route index element={<NurseDashboard />} />
          <Route path="patients" element={<NursePatients />} />
          <Route path="patients/:id" element={<NursePatientRecord />} />
          <Route path="alerts" element={<NurseAlerts />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* The pharmacy counter. Its own tree for the same reason the nursing
            module has one: stock is scoped to a branch, and none of the
            clinical screens apply. PharmacyLayout guards the role. */}
        <Route path="/pharmacy" element={<PharmacyLayout />}>
          <Route index element={<PharmacyDashboard />} />
          <Route path="medicines/departments" element={<PharmacyDepartments />} />
          <Route path="medicines/requests" element={<MedicineRequests />} />
          <Route path="medicines/inventory" element={<Inventory />} />
          <Route path="medicines/add" element={<AddMedicine />} />
          <Route path="medicines/categories" element={<Categories />} />
          <Route path="medicines/search" element={<MedicineSearch />} />
          <Route path="stock/in" element={<StockIn />} />
          <Route path="stock/low" element={<StockAlerts mode="low" />} />
          <Route path="stock/expired" element={<StockAlerts mode="expired" />} />
          <Route path="profile" element={<Profile />} />
          {PHARMACY_SOON.map(({ path, title, blurb, needs }) => (
            <Route
              key={path}
              path={path}
              element={<PharmacySoon title={title} blurb={blurb} needs={needs} />}
            />
          ))}
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />

            <Route element={<RoleRoute deny={CLINICAL_DENY} />}>
              <Route path="consultations" element={<Consultations />} />
              <Route path="consultations/:id" element={<ConsultationRoom />} />
              <Route path="cases" element={<Cases />} />
              <Route path="cases/:id" element={<CaseRecord />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="prescriptions" element={<Prescriptions />} />
              <Route path="nursing" element={<NursingMonitor />} />
              <Route path="nursing/updates" element={<NursingUpdates />} />
              <Route
                path="nursing/alerts"
                element={<NurseAlerts basePath="/dashboard/nursing" title="Nursing alerts" />}
              />
              <Route path="nursing/:id" element={<NursingRecord />} />
              <Route path="reports" element={<Reports />} />
            </Route>

            <Route element={<RoleRoute deny={ADMIN_ONLY_DENY} />}>
              <Route path="doctors" element={<Doctors />} />
              <Route path="departments" element={<Departments />} />
              <Route path="departments/:id" element={<DepartmentDetail />} />
              <Route path="staff" element={<StaffManagement />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
