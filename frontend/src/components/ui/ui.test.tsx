import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConsultationStatusBadge, PaymentStatusBadge } from './Badge';
import { Button } from './Button';
import { Textarea } from './Field';
import { ConfirmDialog } from './Modal';

function NotesDialog() {
  const [open, setOpen] = useState(true);
  const [notes, setNotes] = useState('');
  return (
    <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={() => setOpen(false)} title="Complete?" confirmLabel="Complete">
      <Textarea label="Clinical notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </ConfirmDialog>
  );
}

describe('ConfirmDialog', () => {
  it('focuses the first field, and keeps focus there while typing', () => {
    render(<NotesDialog />);
    const field = screen.getByLabelText('Clinical notes');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'n' } });
    fireEvent.change(field, { target: { value: 'no' } });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('no');
    expect(screen.getByRole('button', { name: /close dialog/i })).not.toHaveFocus();
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('status badges', () => {
  it('convey status with text, not colour alone', () => {
    render(<ConsultationStatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    render(<PaymentStatusBadge status="SUCCEEDED" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});
