import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role } from '@prisma/client';
import { MockPaymentProvider } from './mock.provider';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const tx = { payment: { findUnique: jest.fn(), update: jest.fn() }, paymentEvent: { create: jest.fn() } };
  const prisma = {
    payment: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const provider = new MockPaymentProvider();
  const service = new PaymentsService(prisma as never, provider, audit as never, notifications as never);

  const payment = {
    id: 'pay1',
    consultationId: 'c1',
    patientId: 'p1',
    amountMinor: 50000,
    currency: 'INR',
    status: PaymentStatus.PENDING,
    providerPaymentId: null,
    consultation: { status: 'SCHEDULED' },
  };
  const patient = { id: 'p1', email: 'p@x.y', role: Role.PATIENT };

  beforeEach(() => jest.clearAllMocks());

  describe('createIntent', () => {
    it("refuses to create an intent for someone else's payment", async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...payment, patientId: 'other' });
      await expect(service.createIntent(patient, 'c1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses when the payment already succeeded', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...payment, status: PaymentStatus.SUCCEEDED });
      await expect(service.createIntent(patient, 'c1', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a provider intent keyed by the payment id and moves the payment to PROCESSING', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment);
      const result = await service.createIntent(patient, 'c1', {});
      expect(result).toMatchObject({
        paymentId: 'pay1',
        provider: 'MOCK',
        providerPaymentId: 'mock_pi_pay1',
        amountMinor: 50000,
      });
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { providerPaymentId: 'mock_pi_pay1', status: 'PROCESSING', failureReason: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payment.intent.created' }),
        tx,
      );
    });
  });

  describe('createIntent reconciliation', () => {
    it('re-uses an open provider intent instead of creating a new one', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.PROCESSING,
        providerPaymentId: 'mock_pi_pay1',
      });
      const create = jest.spyOn(provider, 'createIntent');
      const result = await service.createIntent(patient, 'c1', {});
      expect(create).not.toHaveBeenCalled();
      expect(result.providerPaymentId).toBe('mock_pi_pay1');
      create.mockRestore();
    });

    it('records a payment that already succeeded at the provider and refuses a new intent', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.PROCESSING,
        providerPaymentId: 'mock_pi_pay1',
      });
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.PROCESSING,
        providerPaymentId: 'mock_pi_pay1',
      });
      const retrieve = jest
        .spyOn(provider, 'retrieveIntent')
        .mockResolvedValue({ providerPaymentId: 'mock_pi_pay1', clientSecret: null, status: 'succeeded' });
      await expect(service.createIntent(patient, 'c1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(tx.paymentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerEventId: 'sync_mock_pi_pay1_succeeded' }),
        }),
      );
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
      );
      retrieve.mockRestore();
    });

    it('creates a fresh intent when the previous one was cancelled at the provider', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.FAILED,
        providerPaymentId: 'mock_pi_old',
      });
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.FAILED,
        providerPaymentId: 'mock_pi_old',
      });
      const retrieve = jest
        .spyOn(provider, 'retrieveIntent')
        .mockResolvedValue({ providerPaymentId: 'mock_pi_old', clientSecret: null, status: 'canceled' });
      const create = jest.spyOn(provider, 'createIntent');
      await service.createIntent(patient, 'c1', {});
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ previousProviderPaymentId: 'mock_pi_old' }),
      );
      retrieve.mockRestore();
      create.mockRestore();
    });
  });

  describe('applyProviderEvent', () => {
    it('marks the payment SUCCEEDED, audits and notifies', async () => {
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.PROCESSING,
        providerPaymentId: 'mock_pi_pay1',
      });
      const result = await service.applyProviderEvent(provider.buildEvent('pay1', 'succeeded'));
      expect(result).toEqual({ received: true, duplicate: false, applied: true });
      expect(tx.paymentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerEventId: 'mock_evt_pay1_succeeded' }),
        }),
      );
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED', paidAt: expect.any(Date) }),
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'payment.succeeded' }),
        tx,
      );
    });

    it('treats a redelivered event (unique violation) as a harmless duplicate', async () => {
      tx.payment.findUnique.mockResolvedValue({ ...payment, providerPaymentId: 'mock_pi_pay1' });
      tx.paymentEvent.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );
      const result = await service.applyProviderEvent(provider.buildEvent('pay1', 'succeeded'));
      expect(result).toEqual({ received: true, duplicate: true, applied: false });
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('does not regress a SUCCEEDED payment on a late failure event', async () => {
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.SUCCEEDED,
        providerPaymentId: 'mock_pi_pay1',
      });
      const result = await service.applyProviderEvent(provider.buildEvent('pay1', 'failed'));
      expect(result.applied).toBe(false);
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('ignores events for unknown provider payments but still records them', async () => {
      tx.payment.findUnique.mockResolvedValue(null);
      const result = await service.applyProviderEvent(provider.buildEvent('ghost', 'succeeded'));
      expect(result.applied).toBe(false);
      expect(tx.paymentEvent.create).toHaveBeenCalled();
    });
  });

  describe('sync and late success', () => {
    it('moves a FAILED record to SUCCEEDED when the provider reports success', async () => {
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.FAILED,
        providerPaymentId: 'mock_pi_pay1',
      });
      const result = await service.applyProviderEvent({
        id: 'sync_mock_pi_pay1_succeeded',
        type: 'succeeded',
        rawType: 'provider.sync.succeeded',
        providerPaymentId: 'mock_pi_pay1',
        payload: {},
      });
      expect(result.applied).toBe(true);
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
      );
    });

    it('cancelling a PROCESSING payment that already succeeded at the provider refunds instead of voiding', async () => {
      prisma.payment.findUnique
        .mockResolvedValueOnce({
          ...payment,
          status: PaymentStatus.PROCESSING,
          providerPaymentId: 'mock_pi_pay1',
        })
        .mockResolvedValueOnce({
          ...payment,
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: 'mock_pi_pay1',
        });
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.PROCESSING,
        providerPaymentId: 'mock_pi_pay1',
      });
      const retrieve = jest
        .spyOn(provider, 'retrieveIntent')
        .mockResolvedValue({ providerPaymentId: 'mock_pi_pay1', clientSecret: null, status: 'succeeded' });
      const refund = jest.spyOn(provider, 'refund');
      await service.onConsultationCancelled('c1');
      expect(refund).toHaveBeenCalledWith('mock_pi_pay1', 'refund_pay1');
      expect(prisma.payment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failureReason: 'consultation_cancelled' }),
        }),
      );
      retrieve.mockRestore();
      refund.mockRestore();
    });
  });

  describe('onConsultationCancelled', () => {
    it('refunds a succeeded payment through the provider', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.SUCCEEDED,
        providerPaymentId: 'mock_pi_pay1',
      });
      tx.payment.findUnique.mockResolvedValue({
        ...payment,
        status: PaymentStatus.SUCCEEDED,
        providerPaymentId: 'mock_pi_pay1',
      });
      await service.onConsultationCancelled('c1');
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REFUNDED', providerRefundId: 'mock_re_mock_pi_pay1' }),
        }),
      );
    });

    it('voids a pending payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment);
      await service.onConsultationCancelled('c1');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: 'FAILED', failureReason: 'consultation_cancelled' },
      });
    });
  });
});
