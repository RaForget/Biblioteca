import os
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

issuer = os.getenv("KEYCLOAK_ISSUER", "http://localhost:8080/realms/biblioteca")
jwks = jwt.PyJWKClient(os.getenv("KEYCLOAK_JWKS_URL", f"{issuer}/protocol/openid-connect/certs"), timeout=5)
bearer = HTTPBearer(auto_error=False)


def require_reader(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None:
        raise HTTPException(401, "Faça login para consultar notificações.", headers={"WWW-Authenticate": "Bearer"})
    try:
        key = jwks.get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(credentials.credentials, key.key, algorithms=["RS256"],
            audience="biblioteca-api", issuer=issuer, options={"require": ["sub", "exp", "iss"]})
        if not isinstance(claims["sub"], str) or not claims["sub"]:
            raise jwt.InvalidTokenError("Identidade ausente")
    except (jwt.PyJWTError, OSError, ValueError):
        raise HTTPException(401, "Token inválido ou expirado.", headers={"WWW-Authenticate": "Bearer"})
    roles = claims.get("realm_access", {}).get("roles", [])
    if "leitor" not in roles:
        raise HTTPException(403, "Seu usuário não tem o papel de leitor.")
    return {"id": claims["sub"], "roles": roles}
