import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { AuthenticationError, createTokenVerifier } from '../src/infrastructure/auth/keycloak.js';

test('verificador valida assinatura, emissor, audiencia, expiracao e papeis com JWKS real', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const previous = { issuer: process.env.KEYCLOAK_ISSUER, jwks: process.env.KEYCLOAK_JWKS_URL };
  process.env.KEYCLOAK_ISSUER = `http://127.0.0.1:${address.port}/realm`;
  process.env.KEYCLOAK_JWKS_URL = `http://127.0.0.1:${address.port}/certs`;
  const verifier = createTokenVerifier();
  const claims: JWTPayload = {
    sub: 'reader', iss: process.env.KEYCLOAK_ISSUER, aud: 'biblioteca-api',
    exp: Math.floor(Date.now() / 1000) + 60, name: 'Leitor', realm_access: { roles: ['leitor'] },
  };
  const sign = (payload: JWTPayload, key = privateKey) => new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key);
  try {
    assert.deepEqual(await verifier(await sign(claims)), { id: 'reader', name: 'Leitor', roles: ['leitor'] });
    for (const changed of [{ aud: 'other-api' }, { iss: 'http://other-issuer' },
      { exp: 1 }, { exp: undefined }, { sub: '' }, { name: undefined, preferred_username: undefined }]) {
      await assert.rejects(verifier(await sign({ ...claims, ...changed })), AuthenticationError);
    }
    const otherKey = await generateKeyPair('RS256');
    await assert.rejects(verifier(await sign(claims, otherKey.privateKey)), AuthenticationError);
    for (const access of [null, [], { roles: 'nao-leitor' }, { roles: {} }]) {
      assert.deepEqual((await verifier(await sign({ ...claims, realm_access: access }))).roles, []);
    }
  } finally {
    if (previous.issuer === undefined) delete process.env.KEYCLOAK_ISSUER;
    else process.env.KEYCLOAK_ISSUER = previous.issuer;
    if (previous.jwks === undefined) delete process.env.KEYCLOAK_JWKS_URL;
    else process.env.KEYCLOAK_JWKS_URL = previous.jwks;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
