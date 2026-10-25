import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiUrl } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { dashboardSummaryKey, useDashboardSummary } from './dashboard-api';

function Probe() {
  const summary = useDashboardSummary();
  return <p>{summary.data ? `hoy ${summary.data.services_today}` : 'sin datos'}</p>;
}

describe('useDashboardSummary', () => {
  it('usa una clave bajo ["appointments"]', () => {
    expect(dashboardSummaryKey).toEqual(['appointments', 'summary']);
  });

  it('pide GET /dashboard/summary una vez y se refresca al invalidar ["appointments"]', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/dashboard/summary'), () => {
        calls += 1;
        return HttpResponse.json({
          today: '2026-10-24',
          services_today: calls,
          active_technicians: { working: 0, total: 0 },
          efficiency: { rate: null, completed: 0, due: 0, from: '2026-09-25' },
          pending_to_close: 0,
          remaining_today: [],
        });
      }),
    );
    const { queryClient } = renderPage(<Probe />);

    expect(await screen.findByText('hoy 1')).toBeInTheDocument();
    expect(calls).toBe(1);

    await act(() => queryClient.invalidateQueries({ queryKey: ['appointments'] }));

    await waitFor(() => expect(screen.getByText('hoy 2')).toBeInTheDocument());
    expect(calls).toBe(2);
  });
});
