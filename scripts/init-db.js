/**
 * AutoScribe Database Schema Initialization Script
 * Connects and initializes tables for SQLite (default) or MySQL.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dbManager = require('../config/database');

async function initSchema() {
  const dbClient = (process.env.DB_CLIENT || 'sqlite').toLowerCase();

  if (dbClient === 'sqlite') {
    const dbPath = process.env.SQLITE_DB_PATH
      ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
      : path.join(__dirname, '..', 'autoscribe.db');

    console.log(`[AutoScribe Migration] Connecting to SQLite database at ${dbPath}...`);
    try {
      await dbManager.initSqlite();
      console.log(`✅ [AutoScribe Migration] SQLite database connected and all tables initialized successfully!`);
      return true;
    } catch (err) {
      console.error(`❌ [AutoScribe Migration Error]:`, err.message);
      return false;
    }
  }

  // MySQL Migration
  const mysql = require('mysql2/promise');
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'autoscribe_db';

  console.log(`[AutoScribe Migration] Connecting to MySQL at ${host}:${port}...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });

    console.log(`[AutoScribe Migration] Ensuring database '${database}' exists...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await connection.changeUser({ database });

    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`[AutoScribe Migration] Applying schema.sql tables...`);
    await connection.query(sql);

    console.log(`✅ [AutoScribe Migration] All database tables and indexes initialized successfully!`);
    await connection.end();
    return true;
  } catch (err) {
    console.error(`❌ [AutoScribe Migration Error]:`, err.message);
    if (connection) await connection.end();
    return false;
  }
}

if (require.main === module) {
  initSchema().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = initSchema;
