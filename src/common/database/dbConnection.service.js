const { Pool } = require("pg");
const logger = require("../logger/logger.service");

class DatabaseService {
  constructor() {
    this.pool = null;
  }

  async getPool() {
    if (this.pool) {
      return this.pool;
    }

    try {
      this.pool = new Pool({
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || "pdf_tools_db",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      logger.info("✅ Database connected successfully");
      client.release();

      // Handle pool errors
      this.pool.on("error", (err) => {
        logger.error("Unexpected database error:", err);
      });

      return this.pool;
    } catch (error) {
      logger.error("❌ Database connection failed:", error);
      throw error;
    }
  }

  async query(text, params) {
    const pool = await this.getPool();
    const start = Date.now();
    
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug("Executed query", {
        text,
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error("Query error:", { text, error: error.message });
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info("Database connection closed");
    }
  }
}

module.exports = new DatabaseService();
