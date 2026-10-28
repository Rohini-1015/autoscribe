/**
 * AutoScribe Enterprise Audit Logging Service
 * Records audit logs for compliance, security tracking, and submission integrity.
 */

const db = require('../config/database');

async function logAction(actorType, actorId, action, targetType = null, targetId = null, details = null, ipAddress = null) {
  try {
    if (!db.isConnected()) return;

    const detailsJson = details ? JSON.stringify(details) : null;
    await db.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actorType, actorId, action, targetType, targetId, detailsJson, ipAddress]
    );
  } catch (err) {
    console.warn(`[AutoScribe Audit Warning] Failed to log action '${action}':`, err.message);
  }
}

module.exports = {
  logAction
};
