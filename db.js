/**
 * AutoScribe Database Manager & Connection Interface
 * Delegates to config/database.js for unified SQLite / MySQL database management.
 */

const dbManager = require('./config/database');

module.exports = {
  dbConfig: dbManager.config,
  DEFAULT_SUBJECTS: dbManager.DEFAULT_SUBJECTS,
  AUTHORIZED_STUDENTS: dbManager.AUTHORIZED_STUDENTS,
  initDatabase: () => dbManager.initPool(),
  query: (sql, params) => dbManager.query(sql, params),
  transaction: (callback) => dbManager.transaction(callback),
  getPool: () => dbManager.getPool(),
  getSqliteDb: () => dbManager.getSqliteDb(),
  isConnected: () => dbManager.isConnected(),
  isSqlite: () => dbManager.isSqlite(),
  getConnectionError: () => dbManager.getLastError()
};
