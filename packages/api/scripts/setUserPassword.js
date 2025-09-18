#!/usr/bin/env node
/**
 * Usage:
 *   node link-password.js <serviceAccountPath> <email> <newPassword>
 *
 * Example:
 *   node link-password.js ./service-account.json user@example.com MyPass123!
 */

const admin = require("firebase-admin");
const fs = require("fs");

// ---- CLI args ----
const [serviceAccountPath, email, newPassword] = process.argv.slice(2);

if (!serviceAccountPath || !email || !newPassword) {
  console.error("Usage: node link-password.js <serviceAccountPath> <email> <newPassword>");
  process.exit(1);
}

// ---- Load service account JSON ----
let svc;
try {
  const raw = fs.readFileSync(serviceAccountPath, "utf8");
  svc = JSON.parse(raw);
} catch (err) {
  console.error("❌ Failed to read or parse service account JSON:", err.message);
  process.exit(1);
}

// ---- Init Firebase Admin ----
admin.initializeApp({
  credential: admin.credential.cert(svc),
});

// ---- Main ----
(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });
    console.log(`✅ Added password login for ${email} (uid: ${user.uid})`);
  } catch (err) {
    console.error("❌ Failed to update user:", err);
    process.exit(1);
  }
})();
