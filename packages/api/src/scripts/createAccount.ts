/**
 * Interactive script to create a new account (company + user_companies link + number),
 * mirroring the real flow in trpc/routers/companies.ts createCompany.
 *
 * For an already-purchased number, it points the number's Twilio webhooks at this
 * app (voiceUrl/smsUrl) instead of buying a new one, then inserts the DB row.
 *
 * Usage:
 *   pnpm run create-account
 *   pnpm run create-account -- --dry-run   (prints planned actions, writes nothing)
 *   (or: tsx -r tsconfig-paths/register src/scripts/createAccount.ts --dry-run)
 */
import readline from 'readline';
import { randomUUID } from 'crypto';
import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { TwilioClient } from '@/lib/twilio';
import pool from '@/lib/pg';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, fallback?: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, (answer) => {
      resolve(answer.trim() || fallback || '');
    });
  });
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '=== Create Account (DRY RUN — no writes) ===\n' : '=== Create Account ===\n');

  const companyName = await ask('Company name');
  if (!companyName) throw new Error('Company name required.');

  const userId = await ask('Firebase user_id (uid) to own this account');
  if (!userId) throw new Error('user_id required.');

  const number = await ask('Phone number (E.164, e.g. +15551234567)');
  if (!number) throw new Error('Number required.');

  const label = await ask('Number label', 'Main line');

  const wireWebhooksInput = await ask(
    'Point this number\'s Twilio webhooks at this app? (y/n)',
    'y'
  );
  const wireWebhooks = wireWebhooksInput.toLowerCase() === 'y';

  console.log('\nAbout to create:');
  console.log(`  company:         ${companyName}`);
  console.log(`  user_id:         ${userId}`);
  console.log(`  number:          ${number} (${label})`);
  console.log(`  wire webhooks:   ${wireWebhooks}`);
  const confirm = await ask('Proceed? (y/n)', 'y');

  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    rl.close();
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] would configure Twilio webhooks:', wireWebhooks);
    if (wireWebhooks) {
      console.log(`[dry-run]   voiceUrl: ${process.env.SERVER_DOMAIN}/twilio/voice`);
      console.log(`[dry-run]   smsUrl:   ${process.env.SERVER_DOMAIN}/twilio/sms`);
    }
    console.log('[dry-run] would INSERT INTO companies (id, name) VALUES (<uuid>, %j)', companyName);
    console.log('[dry-run] would INSERT INTO user_companies (id, user_id, company_id) VALUES (<uuid>, %j, <company.id>)', userId);
    console.log('[dry-run] would INSERT INTO numbers (id, company_id, number, created_at, label) VALUES (<uuid>, <company.id>, %j, now(), %j)', number, label);
    console.log('\nNo writes made.');
    rl.close();
    await pool.end();
    return;
  }

  if (wireWebhooks) {
    const twilio = new TwilioClient(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
      process.env.TWILIO_DEFAULT_FROM_NUMBER
    );

    await twilio.configureExistingNumber(number, {
      voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
      smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
      friendlyName: companyName,
    });
    console.log(`✅ Twilio webhooks configured for ${number}`);
  }

  const dbCompany = await UserCompaniesRepository.createCompany({ companyName });
  console.log(`✅ company created: ${dbCompany.id}`);

  await UserCompaniesRepository.create({ userId, companyId: dbCompany.id });
  console.log(`✅ user_companies linked: ${userId} -> ${dbCompany.id}`);

  const dbNumber = await NumbersRepository.create({
    id: randomUUID(),
    companyId: dbCompany.id,
    number,
    createdAt: new Date(),
    label,
  });
  console.log(`✅ number created: ${dbNumber.id} (${dbNumber.number})`);

  console.log('\nDone. Company ID:', dbCompany.id);

  rl.close();
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  rl.close();
  process.exit(1);
});
