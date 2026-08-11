import app from './app.js';import { config } from './config/env.js';import { pool } from './db/pool.js';
const host='0.0.0.0';const server=app.listen(config.port,host,()=>console.log(`Orbit API listening on http://${host}:${config.port}`));const shutdown=async()=>{server.close();await pool.end();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
