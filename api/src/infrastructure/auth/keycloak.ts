import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Principal { id: string; name: string; roles: string[] }
export type TokenVerifier = (token: string) => Promise<Principal>;
export class AuthenticationError extends Error {}

export function createTokenVerifier(): TokenVerifier {
  const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/biblioteca';
  const jwks = createRemoteJWKSet(new URL(process.env.KEYCLOAK_JWKS_URL ?? `${issuer}/protocol/openid-connect/certs`));
  return async token => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer, audience: 'biblioteca-api', algorithms: ['RS256'], requiredClaims: ['sub', 'exp'],
      });
      const access = payload.realm_access as { roles?: unknown } | undefined;
      const roles = Array.isArray(access?.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
      const name = typeof payload.name === 'string' ? payload.name : payload.preferred_username;
      if (!payload.sub || typeof name !== 'string') throw new Error('Identidade incompleta');
      return { id: payload.sub, name, roles };
    } catch { throw new AuthenticationError('Token inválido ou expirado. Faça login novamente.'); }
  };
}
