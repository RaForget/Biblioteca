import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from notifications.auth import issuer, require_reader


class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def authorize(self, **changes):
        claims = {"sub": "reader", "iss": issuer, "aud": "biblioteca-api",
                  "exp": int(time.time()) + 60, "realm_access": {"roles": ["leitor"]}}
        claims.update(changes)
        token = jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test"})
        with patch("notifications.auth.jwks.get_signing_key_from_jwt",
                   return_value=SimpleNamespace(key=self.key.public_key())):
            return require_reader(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))

    def test_signed_reader_token(self):
        self.assertEqual(self.authorize(), {"id": "reader", "roles": ["leitor"]})

    def test_malformed_roles_fail_closed_without_server_error(self):
        for access in [None, [], "leitor", {"roles": None}, {"roles": "nao-leitor"},
                       {"roles": {"leitor": True}}, {"roles": [None, 1, "bibliotecario"]}]:
            with self.subTest(access=access), self.assertRaises(HTTPException) as raised:
                self.authorize(realm_access=access)
            self.assertEqual(raised.exception.status_code, 403)

    def test_wrong_audience_issuer_expiry_or_identity(self):
        for changes in [{"aud": "other-api"}, {"iss": "http://other-issuer"},
                        {"exp": int(time.time()) - 60}, {"sub": ""}]:
            with self.subTest(changes=changes), self.assertRaises(HTTPException) as raised:
                self.authorize(**changes)
            self.assertEqual(raised.exception.status_code, 401)

    def test_invalid_signature_and_missing_expiration(self):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        for signing_key, claims in [
            (other_key, {"sub": "reader", "iss": issuer, "aud": "biblioteca-api", "exp": int(time.time()) + 60}),
            (self.key, {"sub": "reader", "iss": issuer, "aud": "biblioteca-api"}),
        ]:
            token = jwt.encode(claims, signing_key, algorithm="RS256")
            with patch("notifications.auth.jwks.get_signing_key_from_jwt",
                       return_value=SimpleNamespace(key=self.key.public_key())):
                with self.assertRaises(HTTPException) as raised:
                    require_reader(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
                self.assertEqual(raised.exception.status_code, 401)
