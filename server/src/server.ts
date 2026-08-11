import app from './app.js';import { config } from './config/env.js';import { pool } from './db/pool.js';
const server=app.listen(config.port,()=>console.log(`Orbit API listening on http://localhost:${config.port}`));const shutdown=async()=>{server.close();await pool.end();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
