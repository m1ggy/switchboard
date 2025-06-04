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
      userId: userCompany.user_id,
    });

    console.log('✅ Notification created:', notif);

    const channel = `${userCompany.user_id}-notif`;
    app.io.emit(channel, notif);
    console.log(`📢 Notification emitted to channel: ${channel}`);
  } catch (error) {
    console.error(`❗ Error in notifyIncomingCall for ${toNumber}:`, error);
  }
}

async function notifyNewMessage({
  from,
  toNumber,
  message,
  app,
}: {
  from: string;
  toNumber: string;
  message: string;
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

    const userCompany = await UserCompaniesRepository.findUserIdById(
      existingCompany.id
    );
    if (!userCompany) {
      console.warn(`⚠️ No user found for company ID: ${existingCompany.id}`);
      return;
    }

    const notif = await NotificationsRepository.create({
      id: crypto.randomUUID(),
      message: `New message from ${from}: ${message.slice(0, 50)}`,
      createdAt: new Date(),
      meta: {
        companyId: existingCompany.id,
        from,
        preview: message.slice(0, 100),
      },
      userId: userCompany.user_id,
    });

    const channel = `${userCompany.user_id}-notif`;
    app.io.emit(channel, notif);
    console.log(`📢 Message notification emitted to channel: ${channel}`);
  } catch (error) {
    console.error(`❗ Error in notifyNewMessage for ${toNumber}:`, error);
  }
}

export { notifyIncomingCall, notifyNewMessage };
