import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './routes/api.js';
import { hasLiveModel } from './llm/grokClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'client')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`CourtSim listening on :${port}`);
  console.log(
    hasLiveModel()
      ? `Grok model: ${process.env.GROK_MODEL || 'grok-4'} via ${process.env.GROK_BASE_URL || 'https://api.x.ai/v1'}`
      : 'No GROK_API_KEY set — running in offline demo mode (deterministic mock agents).'
  );
});
