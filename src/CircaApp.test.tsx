import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CircaApp } from './CircaApp';

describe('CircaApp', () => {
  it('guides a new customer from submission popup to under approval asset', async () => {
    const user = userEvent.setup();
    render(<CircaApp />);

    await user.click(screen.getByRole('button', { name: /Start Submit eWaste/i }));
    const submitDialog = screen.getByRole('dialog', { name: /Submit eWaste/i });
    await user.click(within(submitDialog).getByRole('button', { name: /New customer/i }));
    await user.click(
      within(submitDialog).getByRole('button', { name: /Register and login customer/i }),
    );
    await user.click(screen.getByRole('button', { name: /Use sample location/i }));
    expect(screen.getAllByText(/Green Hub Al Quoz/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Continue to photo/i }));
    await user.click(screen.getByRole('button', { name: /Use sample photo/i }));
    await user.click(screen.getByRole('button', { name: /Extract evidence with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/Confirm extracted eWaste value/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Confirm and submit for approval/i }));

    expect(screen.getByText(/Your asset is under approval/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View dashboard/i }));
    expect(screen.getAllByText(/AI named smartphone evidence/i).length).toBeGreaterThan(0);
  });

  it('spends wallet rewards when buying an enterprise coupon', async () => {
    const user = userEvent.setup();
    render(<CircaApp />);

    await user.click(screen.getByRole('button', { name: /Open customer login/i }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Customer login/i })).getByRole(
        'button',
        { name: /Login customer/i },
      ),
    );
    await user.click(screen.getByRole('button', { name: /Buy for 14 rewards/i }));

    expect(screen.getAllByText(/34 rewards/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Claim code is ready/i)).toBeInTheDocument();
  });
});
