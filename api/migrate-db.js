const pg = require('pg');

module.exports = async function handler(req, res) {
  // Allow GET/POST for quick trigger
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Temporary token-free execution for live audit migration
  const connectionString = 
    process.env.DATABASE_URL || 
    process.env.POSTGRES_URL || 
    process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;
    if (dbPassword) {
      const host = 'db.pdjnpqyzayidthpfmvjk.supabase.co';
      const user = 'postgres';
      const database = 'postgres';
      const port = 5432;
      const connectionStringBuilt = `postgres://${user}:${dbPassword}@${host}:${port}/${database}`;
      return await executeMigration(connectionStringBuilt, res);
    }
    
    return res.status(500).json({ 
      error: 'No database connection environment variable found.'
    });
  }

  return await executeMigration(connectionString, res);
}

async function executeMigration(connectionString, res) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    await client.query('BEGIN;');
    await client.query('ALTER TABLE public.candidates ALTER COLUMN password DROP NOT NULL;');
    await client.query('ALTER TABLE public.employers ALTER COLUMN password DROP NOT NULL;');
    await client.query('COMMIT;');
    
    await client.end();
    return res.status(200).json({ 
      ok: true, 
      message: 'Database schema successfully updated. Legacy password columns are now nullable.' 
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK;');
    } catch (e) {}
    try {
      await client.end();
    } catch (e) {}
    
    return res.status(500).json({ 
      ok: false, 
      error: err.message, 
      code: err.code 
    });
  }
}
