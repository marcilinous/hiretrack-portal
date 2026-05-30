const pg = require('pg');

module.exports = async function handler(req, res) {
  // Allow only POST or GET for simplicity of execution
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security check: use a secret token from query string or headers
  const token = req.query.token || req.headers['x-migration-token'];
  const expectedToken = process.env.ADMIN_SECRET || 'pdjnpqyzayidthpfmvjk';
  
  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Determine database connection string
  const connectionString = 
    process.env.DATABASE_URL || 
    process.env.POSTGRES_URL || 
    process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    // If no full connection string is found, try to build it from components
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;
    if (dbPassword) {
      const host = 'db.pdjnpqyzayidthpfmvjk.supabase.co';
      const user = 'postgres';
      const database = 'postgres';
      const port = 5432;
      const connectionStringBuilt = `postgres://${user}:${dbPassword}@${host}:${port}/${database}`;
      return await executeMigration(connectionStringBuilt, res);
    }
    
    // Output all available environment variable keys (but not values) for debugging
    const envKeys = Object.keys(process.env).filter(k => 
      k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('SUPABASE') || k.includes('URL') || k.includes('KEY')
    );
    
    return res.status(500).json({ 
      error: 'No database connection environment variable found.',
      detected_keys: envKeys
    });
  }

  return await executeMigration(connectionString, res);
}

async function executeMigration(connectionString, res) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase SSL connection
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database successfully.');
    
    // Execute SQL queries to make legacy password columns nullable
    await client.query('BEGIN;');
    
    console.log('Altering public.candidates...');
    await client.query('ALTER TABLE public.candidates ALTER COLUMN password DROP NOT NULL;');
    
    console.log('Altering public.employers...');
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
    
    console.error('Migration failed:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message, 
      code: err.code 
    });
  }
}
