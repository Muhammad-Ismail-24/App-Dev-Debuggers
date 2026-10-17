"""HS256 JWTs; secret comes from the shared startup configuration."""
import time
from uuid import uuid4

import jwt


class InvalidToken(ValueError):
    pass


class JwtService:
    def __init__(self, secret: str, issuer="nascon", audience="nascon-api"):
        if not isinstance(secret, str) or len(secret.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 bytes; no default secret is provided")
        self.secret, self.issuer, self.audience = secret, issuer, audience

    def issue(self, user_id: str, lifetime_seconds: int = 7200) -> str:
        if not user_id or lifetime_seconds < 3600:
            raise ValueError("A subject and lifetime of at least one hour are required")
        now = int(time.time())
        return jwt.encode(dict(sub=user_id, iss=self.issuer, aud=self.audience,
                               iat=now, exp=now+lifetime_seconds, jti=str(uuid4())),
                          self.secret, algorithm="HS256")

    def verify(self, token: str) -> str:
        try:
            claims = jwt.decode(token, self.secret, algorithms=["HS256"], audience=self.audience,
                                issuer=self.issuer, options={"require": ["sub", "exp", "iat", "iss", "aud", "jti"]})
            if not isinstance(claims["sub"], str) or not claims["sub"]:
                raise InvalidToken("Invalid subject")
            if any(type(claims[k]) is not int for k in ("exp", "iat")) or claims["exp"] <= claims["iat"]:
                raise InvalidToken("Invalid token times")
            return claims["sub"]
        except (jwt.InvalidTokenError, TypeError, ValueError) as exc:
            raise InvalidToken("Invalid bearer token") from exc
