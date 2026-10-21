import Keycloak from 'keycloak-js';

export const auth = new Keycloak({ url: 'http://localhost:8080', realm: 'biblioteca', clientId: 'biblioteca-web' });
export function readerName(): string { return String(auth.tokenParsed?.name ?? auth.tokenParsed?.preferred_username ?? ''); }
export async function initializeAuth() {
  await auth.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false });
}
export function login() { return auth.login({ redirectUri: `${window.location.origin}/` }); }
export function logout() { return auth.logout({ redirectUri: `${window.location.origin}/` }); }
export async function accessToken(): Promise<string | undefined> {
  if (!auth.authenticated) return undefined;
  await auth.updateToken(30);
  return auth.token;
}
