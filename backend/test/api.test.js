import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/server.js';
import { valid } from './fixtures.js';
async function server(t, options = {}) {
  const instance = createApp({ production: false, client: false, ...options }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise((resolve) => instance.once('listening', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        instance.close(resolve);
        instance.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${instance.address().port}`;
}
const post = (url, body, token) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
test('production refuse de démarrer sans secrets solides', () => {
  assert.throws(() => createApp({ production: true, password: '', secret: '' }));
});
test('accès protégé, connexion, jeton falsifié et mot de passe incorrect', async (t) => {
  const base = await server(t, { password: 'un-mot-de-passe-test-solide', secret: 'x'.repeat(40) });
  assert.equal((await post(`${base}/api/generate-excel`, valid())).status, 401);
  assert.equal((await post(`${base}/api/login`, { password: 'incorrect' })).status, 401);
  const login = await post(`${base}/api/login`, { password: 'un-mot-de-passe-test-solide' });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.equal((await post(`${base}/api/generate-excel`, valid(), `${token}x`)).status, 401);
  assert.equal((await post(`${base}/api/generate-excel`, valid(), token)).status, 200);
  const body = Buffer.from(JSON.stringify({ exp: Date.now() - 1 })).toString('base64url');
  const signature = createHmac('sha256', 'x'.repeat(40)).update(body).digest('base64url');
  assert.equal(
    (await post(`${base}/api/generate-excel`, valid(), `${body}.${signature}`)).status,
    401,
  );
});

test('trop de tentatives de connexion sont limitées', async (t) => {
  const base = await server(t, { password: 'un-mot-de-passe-test-solide', secret: 'x'.repeat(40) });
  for (let i = 0; i < 8; i++)
    assert.equal((await post(`${base}/api/login`, { password: 'faux' })).status, 401);
  assert.equal((await post(`${base}/api/login`, { password: 'faux' })).status, 429);
});

test('fichier non audio refusé avant tout appel payant', async (t) => {
  let calls = 0;
  const base = await server(t, {
    client: {
      audio: {
        transcriptions: {
          create: () => {
            calls++;
          },
        },
      },
    },
  });
  const fd = new FormData();
  fd.append('audio', new Blob(['not audio'], { type: 'text/plain' }), 'test.txt');
  const res = await fetch(`${base}/api/transcribe`, { method: 'POST', body: fd });
  assert.equal(res.status, 415);
  assert.equal(calls, 0);
});

test('erreur du prestataire ne révèle pas ses détails', async (t) => {
  const base = await server(t, {
    client: {
      chat: {
        completions: {
          create: async () => {
            throw new Error('private-upstream-detail');
          },
        },
      },
    },
  });
  const res = await post(`${base}/api/analyze`, { text: 'texte', block: 'vehicle' });
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes('private-upstream-detail'));
});

test('capacité simultanée bornée et libérée après traitement', async (t) => {
  let releases = [],
    calls = 0;
  const client = {
    chat: {
      completions: {
        create: () => {
          calls++;
          return new Promise((resolve) =>
            releases.push(() =>
              resolve({
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: JSON.stringify({
                        vehicle: {},
                        mechanics: {},
                        body: [],
                        cell: [],
                        warnings: [],
                      }),
                    },
                  },
                ],
              }),
            ),
          );
        },
      },
    },
  };
  const base = await server(t, { client });
  const first = post(`${base}/api/analyze`, { text: 'test 1', block: 'vehicle' });
  const second = post(`${base}/api/analyze`, { text: 'test 2', block: 'vehicle' });
  // Wait for the mock provider to receive both requests, with a bounded timeout.
  const start = Date.now();
  while (calls < 2 && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 2);
  assert.equal(
    (await post(`${base}/api/analyze`, { text: 'test 3', block: 'vehicle' })).status,
    429,
  );
  releases.forEach((release) => release());
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});
test('validation serveur refuse une date incorrecte et ne fuit pas de détails', async (t) => {
  const base = await server(t),
    d = valid();
  d.vehicle.mec = 'date incorrecte';
  const res = await post(`${base}/api/generate-excel`, d);
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.some((e) => e.path === 'vehicle.mec'));
});
test('origine inconnue refusée', async (t) => {
  const base = await server(t);
  const res = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});
test('dictée indisponible répond clairement sans empêcher la saisie manuelle', async (t) => {
  const base = await server(t);
  assert.equal((await post(`${base}/api/analyze`, { text: 'test', block: 'vehicle' })).status, 503);
  assert.equal((await post(`${base}/api/generate-excel`, valid())).status, 200);
});
test('upload audio puis analyse restent deux opérations distinctes', async (t) => {
  let transcriptions = 0,
    analyses = 0;
  const client = {
    audio: {
      transcriptions: {
        create: async (args) => {
          transcriptions++;
          assert.equal(args.model, 'gpt-4o-transcribe');
          assert.deepEqual(args.include, ['logprobs']);
          return {
            text: 'Réparation 123 euros et 45 centimes',
            logprobs: [
              { token: '123', logprob: -2 },
              { token: 'Réparation', logprob: -0.1 },
            ],
          };
        },
      },
    },
    chat: {
      completions: {
        create: async () => {
          analyses++;
          return {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    vehicle: {},
                    mechanics: {},
                    body: [{ desc: 'Réparation', amount: '123.45' }],
                    cell: [],
                    warnings: [],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  };
  const base = await server(t, { client }),
    fd = new FormData();
  fd.append('audio', new Blob(['test audio simulé'], { type: 'audio/webm' }), 'dictee.webm');
  const res = await fetch(`${base}/api/transcribe`, { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).uncertain, ['123']);
  assert.equal(transcriptions, 1);
  assert.equal(analyses, 0);
  const analysis = await post(`${base}/api/analyze`, {
    text: 'Réparation 123 euros et 45 centimes',
    block: 'body',
  });
  assert.equal(analysis.status, 200);
  assert.equal((await analysis.json()).data.body[0].amount, '123.45');
  assert.equal(analyses, 1);
});
test('entrée analyse et charge utile excessives refusées avant appel payant', async (t) => {
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: () => {
          calls++;
        },
      },
    },
  };
  const base = await server(t, { client });
  assert.equal(
    (await post(`${base}/api/analyze`, { text: 'x'.repeat(18001), block: 'vehicle' })).status,
    400,
  );
  assert.equal((await post(`${base}/api/analyze`, { text: 'test', block: 'unknown' })).status, 400);
  assert.equal(
    (await post(`${base}/api/analyze`, { text: 'x'.repeat(600000), block: 'vehicle' })).status,
    413,
  );
  assert.equal(calls, 0);
});
