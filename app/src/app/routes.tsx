import { Navigate, type RouteObject } from 'react-router';
import { AgendaPage } from '@/features/agenda/AgendaPage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { BusinessSettingsPage } from '@/features/settings/BusinessSettingsPage';
import { ServicesSettingsPage } from '@/features/settings/ServicesSettingsPage';
import { TechnicianDetailPage } from '@/features/settings/TechnicianDetailPage';
import { TechniciansSettingsPage } from '@/features/settings/TechniciansSettingsPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';

/**
 * Rutas de D8. La vista y la fecha de la agenda viven en la URL
 * (`/agenda?view=day|week&date=YYYY-MM-DD`).
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/agenda" replace /> },
      { path: 'agenda', element: <AgendaPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'settings', element: <Navigate to="/settings/business" replace /> },
      { path: 'settings/business', element: <BusinessSettingsPage /> },
      { path: 'settings/services', element: <ServicesSettingsPage /> },
      { path: 'settings/technicians', element: <TechniciansSettingsPage /> },
      { path: 'settings/technicians/:id', element: <TechnicianDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
