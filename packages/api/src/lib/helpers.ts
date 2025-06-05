import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NotificationsRepository } from '@/db/repositories/notifications';
import { NumbersRepository } from '@/db/repositories/numbers';
import crypto from 'crypto';
import { intervalToDuration } from 'date-fns';
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
  meta = {},
}: {
  from: string;
  toNumber: string;
  message: string;
  app: FastifyInstance;
  meta?: Record<string, unknown>;
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
        ...meta,
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

async function notifyUser({
  userId,
  message,
  meta = {},
  app,
  type = 'user',
}: {
  userId: string;
  message: string;
  meta?: Record<string, any>;
  app: FastifyInstance;
  type?: 'user' | 'global' | 'system';
}) {
  try {
    const notif = await NotificationsRepository.create({
      id: crypto.randomUUID(),
      message,
      createdAt: new Date(),
      meta,
      userId,
      type,
    });

    const channel = `${userId}-notif`;
    app.io.emit(channel, notif);
    console.log(`📢 Notification emitted to channel: ${channel}`);
  } catch (error) {
    console.error(`❗ Error notifying user ${userId}:`, error);
  }
}

export function formatDurationWithDateFns(seconds: number) {
  const duration = intervalToDuration({
    start: 0,
    end: seconds * 1000, // convert to ms
  });

  const { hours, minutes, seconds: secs } = duration;

  const hrStr = hours ? `${hours}h ` : '';
  const minStr = minutes ? `${minutes}m ` : '';
  const secStr = `${secs}s`;

  return `${hrStr}${minStr}${secStr}`.trim();
}

export { notifyIncomingCall, notifyNewMessage, notifyUser };
