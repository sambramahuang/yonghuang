import express from 'express';
import multer from 'multer';
import { authenticate, requireCapability } from './auth/rbac.js';
import { loginHandler } from './auth/login.js';
import { ensure, HttpError } from './errors.js';
import { ingest } from './ingest/index.js';
import { intake } from './regulatory/intake.js';
import { analyse } from './impact/match.js';
import { editPatch, submit, approve, resolve } from './workflow/review.js';
import { artefactDetail, impactDetail, listImpacts } from './queries.js';

export function createApp({ pool, secret, extractor, extractionMode = 'fixture', corsOrigin = 'http://localhost:5173' }) {
  const app = express();
  app.disable('x-powered-by');
  // Accepts a comma-separated list so Vite's port fallback (5173 -> 5174) does
  // not silently break every request with an opaque CORS failure.
  const allowedOrigins = new Set(String(corsOrigin).split(',').map(o => o.trim()).filter(Boolean));
  app.use((req,res,next) => {
    const origin = req.get('origin');
    if (origin && allowedOrigins.has(origin)) {
      res.set('Access-Control-Allow-Origin',origin);
      res.set('Vary','Origin');
      res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
    }
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cache-Control','no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health',async (req,res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', extraction_mode: extractionMode });
  });
  // Sign-in is the only route reachable without a token.
  app.post('/api/login',loginHandler(pool,secret));
  app.use('/api',authenticate(pool,secret));
  app.param('id',(req,res,next,id) => {
    if (!/^[1-9]\d{0,17}$/.test(id)) return next(new HttpError(400,'Invalid resource id'));
    next();
  });
  const reviewer = requireCapability('REVIEWER'), approver = requireCapability('APPROVER');
  app.get('/api/me',(req,res) => res.json(req.user));
  app.get('/api/users',async (req,res) => res.json((await pool.query('SELECT id,name,capability FROM users ORDER BY id')).rows));
  app.get('/api/artefacts',async (req,res) => res.json((await pool.query(`SELECT a.*,v.version FROM artefacts a
    JOIN artefact_versions v ON v.id=a.current_version_id ORDER BY a.id`)).rows));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } });
  app.post('/api/artefacts',reviewer,upload.single('file'),async (req,res) => {
    ensure(req.file,400,'Attach a DOCX or JSON file in multipart field file');
    res.status(201).json(await ingest(pool,{ buffer: req.file.buffer,name: req.file.originalname,type: req.body.type,userId: req.user.id,extractor }));
  });
  app.get('/api/artefacts/:id',async (req,res) => res.json(await artefactDetail(pool,req.params.id)));
  app.get('/api/artefacts/:id/download',async (req,res) => {
    const artefact = await artefactDetail(pool,req.params.id);
    const filename = artefact.format === 'JSON' ? artefact.name : `${artefact.name.replace(/\.docx$/i,'')}.txt`;
    res.attachment(filename).type(artefact.format === 'JSON' ? 'application/json' : 'text/plain').send(artefact.current_version.raw_text);
  });
  app.post('/api/regulatory-updates',reviewer,async (req,res) => {
    const result = await intake(pool,req.body); res.status(result.created ? 201 : 200).json(result);
  });
  app.get('/api/regulatory-updates',async (req,res) => res.json((await pool.query('SELECT id,provider_ref,title,source_url,gazetted_date,effective_date FROM regulatory_updates ORDER BY id DESC')).rows));
  app.get('/api/regulatory-updates/:id',async (req,res) => {
    const update = (await pool.query('SELECT id,provider_ref,title,source_url,gazetted_date,effective_date FROM regulatory_updates WHERE id=$1',[req.params.id])).rows[0];
    ensure(update,404,'Regulatory update not found');
    res.json({ ...update,changes: (await pool.query('SELECT * FROM regulatory_changes WHERE update_id=$1 ORDER BY id',[req.params.id])).rows });
  });
  app.post('/api/regulatory-updates/:id/analyse',reviewer,async (req,res) => res.json(await analyse(pool,req.params.id)));
  app.get('/api/impacts',async (req,res) => res.json(await listImpacts(pool,req.query)));
  app.get('/api/impacts/:id',async (req,res) => res.json(await impactDetail(pool,req.params.id)));
  app.patch('/api/impacts/:id/patch',reviewer,async (req,res) => res.json(await editPatch(pool,req.params.id,req.user,req.body ?? {})));
  app.post('/api/impacts/:id/submit',reviewer,async (req,res) => res.json(await submit(pool,req.params.id,req.user,req.body ?? {})));
  app.post('/api/impacts/:id/approve',approver,async (req,res) => res.json(await approve(pool,req.params.id,req.user,req.body ?? {})));
  app.post('/api/impacts/:id/reject',approver,async (req,res) => res.json(await resolve(pool,req.params.id,req.user,req.body ?? {},'REJECTED')));
  app.post('/api/impacts/:id/escalate',reviewer,async (req,res) => res.json(await resolve(pool,req.params.id,req.user,req.body ?? {},'ESCALATED')));
  app.use((req,res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request body' });
    const status = error.status || 500;
    if (status === 500) console.error('Request failed:',error.code ?? error.name);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
  });
  return app;
}
