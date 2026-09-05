import { createPool } from './db.js';
import { createApp } from './app.js';
import { fixtureExtractor, liveExtractor, fixtureDrafter, liveDrafter, fixtureDiscoverer, liveDiscoverer } from './extract/providers.js';

const pool = createPool();
const mode = process.env.EXTRACTION_MODE ?? 'fixture';
if (!['fixture','live'].includes(mode)) throw new Error('EXTRACTION_MODE must be fixture or live');
const extractor = mode === 'live' ? liveExtractor({ apiKey: process.env.OPENAI_API_KEY,model: process.env.OPENAI_MODEL }) : fixtureExtractor();
await pool.query('SELECT version FROM schema_migrations WHERE version=1');
const drafter = mode === 'live' ? liveDrafter({ apiKey: process.env.OPENAI_API_KEY,model: process.env.OPENAI_MODEL }) : fixtureDrafter();
const discoverer = mode === 'live' ? liveDiscoverer({ apiKey: process.env.OPENAI_API_KEY,model: process.env.OPENAI_MODEL }) : fixtureDiscoverer();
const app = createApp({ pool,secret: process.env.AUTH_SECRET,extractor,drafter,discoverer,extractionMode: mode,corsOrigin: process.env.CORS_ORIGIN });
const server = app.listen(Number(process.env.PORT ?? 3001),process.env.HOST ?? '127.0.0.1',() => {
  console.log(`Backend ready at http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 3001} (${mode} extraction)`);
});
async function shutdown() { server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
