import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NotificationsRepository } from '@/db/repositories/notifications';
import { NumbersRepository } from '@/db/repositories/numbers';
import crypto from 'crypto';
import { type FastifyInstance } from 'fastify';

async function notifyIncomingCall({
  callerId,
  toNumber,

  app,
}: {
  callerId: string;
  toNumber: string;
  callSid: string;
  app: FastifyInstance;
}) {
  try {
    const existingNumber = await NumbersRepository.findByNumber(toNumber);
    if (!existingNumber) {
      console.warn(`❌ No number record found for: ${toNumber}`);
      return;
    }

    const existingCompany = await UserCompaniesRepository.findCompanyById(
      existingNumber.company_id
    );
    if (!existingCompany) {
      console.warn(`❌ No company found for number: ${toNumber}`);
      return;
    }

    console.log(`🏢 Found company for number ${toNumber}:`, existingCompany);

    const userCompany = await UserCompaniesRepository.findUserIdById(
      existingCompany.id
    );
    if (!userCompany) {
      console.warn(`⚠️ No user found for company ID: ${existingCompany.id}`);
      return;
    }

    console.log(
      `👤 Found user ${userCompany.user_id} for company ${existingCompany.name}`
    );

    const notif = await NotificationsRepository.create({
      id: crypto.randomUUID() as string,
      message: `Incoming call from ${callerId}`,
      createdAt: new Date(),
      meta: { companyId: existingCompany.id },
    });

    console.log('✅ Notification created:', notif);

    const channel = `${userCompany.user_id}-notif`;
    app.io.emit(channel, notif);
    console.log(`📢 Notification emitted to channel: ${channel}`);
  } catch (error) {
    console.error(`❗ Error in notifyIncomingCall for ${toNumber}:`, error);
  }
}

export { notifyIncomingCall };
