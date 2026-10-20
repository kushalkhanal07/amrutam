import { CalendarDays, ClipboardList, FileText, LayoutDashboard, ScrollText, Search, Stethoscope, Users } from 'lucide-react';
import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { PublicLayout } from './components/layout/PublicLayout';
import { Button } from './components/ui/Button';
import { Spinner } from './components/ui/States';
import { useAuth } from './lib/auth/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { DoctorProfilePage } from './pages/public/DoctorProfilePage';
import { DoctorsDirectoryPage } from './pages/public/DoctorsDirectoryPage';
import { LandingPage } from './pages/public/LandingPage';

// Role areas are code-split so the public bundle stays small.
const load = <T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) => lazy(() => loader().then((m) => ({ default: m[name] })));

const PatientDashboardPage = load(() => import('./pages/patient/PatientDashboardPage'), 'PatientDashboardPage');
const PatientAppointmentsPage = load(() => import('./pages/patient/PatientAppointmentsPage'), 'PatientAppointmentsPage');
const ConsultationDetailPage = load(() => import('./pages/patient/ConsultationDetailPage'), 'ConsultationDetailPage');
const PaymentPage = load(() => import('./pages/patient/PaymentPage'), 'PaymentPage');
const PrescriptionsPage = load(() => import('./pages/patient/PrescriptionsPage'), 'PrescriptionsPage');
const PrescriptionDetailPage = load(() => import('./pages/patient/PrescriptionDetailPage'), 'PrescriptionDetailPage');
const BookingPage = load(() => import('./pages/patient/BookingPage'), 'BookingPage');
const DoctorDashboardPage = load(() => import('./pages/doctor/DoctorDashboardPage'), 'DoctorDashboardPage');
const DoctorSchedulePage = load(() => import('./pages/doctor/DoctorSchedulePage'), 'DoctorSchedulePage');
const DoctorAvailabilityPage = load(() => import('./pages/doctor/DoctorAvailabilityPage'), 'DoctorAvailabilityPage');
const DoctorProfileSetupPage = load(() => import('./pages/doctor/DoctorProfileSetupPage'), 'DoctorProfileSetupPage');
const DoctorConsultationPage = load(() => import('./pages/doctor/DoctorConsultationPage'), 'DoctorConsultationPage');
const AdminOverviewPage = load(() => import('./pages/admin/AdminOverviewPage'), 'AdminOverviewPage');
const AdminUsersPage = load(() => import('./pages/admin/AdminUsersPage'), 'AdminUsersPage');
const AdminDoctorsPage = load(() => import('./pages/admin/AdminDoctorsPage'), 'AdminDoctorsPage');
const AdminAuditLogsPage = load(() => import('./pages/admin/AdminAuditLogsPage'), 'AdminAuditLogsPage');
const SettingsPage = load(() => import('./pages/SettingsPage'), 'SettingsPage');
const ConsultationSessionPage = load(() => import('./pages/consultation/ConsultationSessionPage'), 'ConsultationSessionPage');

const patientNav = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/app/prescriptions', label: 'Prescriptions', icon: FileText },
  { to: '/doctors', label: 'Find a doctor', icon: Search },
];

const doctorNav = [
  { to: '/doctor', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/doctor/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/doctor/availability', label: 'Availability', icon: ClipboardList },
  { to: '/doctor/profile', label: 'My profile', icon: Stethoscope },
];

const adminNav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/doctors', label: 'Doctors', icon: Stethoscope },
  { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
];

function PatientShell() {
  const navigate = useNavigate();
  return (
    <AppShell
      items={patientNav}
      areaLabel="Patient portal"
      sidebarExtra={
        <Button fullWidth onClick={() => navigate('/doctors')} leftIcon={<Search className="size-4" />}>
          Book a consultation
        </Button>
      }
    />
  );
}

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    try {
      if (hash) {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0 });
      }
    } catch {
      /* not supported in this environment (e.g. jsdom) */
    }
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToHash />
      <Suspense fallback={<Spinner className="min-h-[50vh]" label="Loading page" />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="/doctors" element={<DoctorsDirectoryPage />} />
            <Route path="/doctors/:id" element={<DoctorProfilePage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute roles={['PATIENT']} />}>
            <Route path="/book/:doctorId" element={<BookingPage />} />
            <Route path="/app" element={<PatientShell />}>
              <Route index element={<PatientDashboardPage />} />
              <Route path="appointments" element={<PatientAppointmentsPage />} />
              <Route path="appointments/:id" element={<ConsultationDetailPage />} />
              <Route path="appointments/:id/pay" element={<PaymentPage />} />
              <Route path="prescriptions" element={<PrescriptionsPage />} />
              <Route path="prescriptions/:id" element={<PrescriptionDetailPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['DOCTOR']} />}>
            <Route path="/doctor" element={<AppShell items={doctorNav} areaLabel="Doctor workspace" />}>
              <Route index element={<DoctorDashboardPage />} />
              <Route path="schedule" element={<DoctorSchedulePage />} />
              <Route path="availability" element={<DoctorAvailabilityPage />} />
              <Route path="profile" element={<DoctorProfileSetupPage />} />
              <Route path="consultations/:id" element={<DoctorConsultationPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/admin" element={<AppShell items={adminNav} areaLabel="Administration" />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="doctors" element={<AdminDoctorsPage />} />
              <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            </Route>
          </Route>

          {/* Live consultation room (video / audio / chat). Shared by patient and doctor; full-screen, no sidebar. */}
          <Route element={<ProtectedRoute roles={['PATIENT', 'DOCTOR']} />}>
            <Route path="/session/:id" element={<ConsultationSessionPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<SettingsShell />}>
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

function SettingsShell() {
  const { role } = useAuth();
  const items = role === 'DOCTOR' ? doctorNav : role === 'ADMIN' ? adminNav : patientNav;
  const label = role === 'DOCTOR' ? 'Doctor workspace' : role === 'ADMIN' ? 'Administration' : 'Patient portal';
  return <AppShell items={items} areaLabel={label} />;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-2 text-3xl">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-muted">The link may be outdated, or the page may have moved.</p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button onClick={() => navigate('/')}>Home</Button>
      </div>
    </div>
  );
}
