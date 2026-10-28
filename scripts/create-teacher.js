/**
 * AutoScribe Secure Teacher Account Provisioning CLI
 * Creates an authorized examiner account directly in the database (SQLite or MySQL).
 * 
 * Usage:
 * node scripts/create-teacher.js "Dr. Evelyn Reed" "evelyn@autoscribe.edu" "SecurePassword123!"
 */

const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/database');

async function createTeacher(name, email, password) {
  if (!name || !email || !password) {
    console.error('Usage: node scripts/create-teacher.js <Full Name> <Email> <Password>');
    process.exit(1);
  }

  try {
    await db.initPool();
    const passwordHash = await bcrypt.hash(password, 12);
    const cleanEmail = email.trim().toLowerCase();

    await db.query(
      `INSERT INTO teachers (name, email, password_hash, role)
       VALUES (?, ?, ?, 'teacher')
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
      [name.trim(), cleanEmail, passwordHash]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details_json)
       VALUES ('cli', 'create-teacher.js', 'TEACHER_PROVISIONED', 'teacher', ?, ?)`,
      [cleanEmail, JSON.stringify({ name: name.trim(), email: cleanEmail })]
    );

    console.log(`✅ Teacher account created successfully: ${cleanEmail} (${name.trim()})`);
    return true;
  } catch (err) {
    console.error('❌ Failed to provision teacher:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  createTeacher(args[0], args[1], args[2]);
}

module.exports = createTeacher;
