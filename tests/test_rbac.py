import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json
import time

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes import fixtures, ping, rbac
from app.schemas.rbac import Principal, Resource, ROLES
from app.security.jwt import InvalidToken, JwtService
from app.security.rate_limit import MemoryWindowLimiter, RedisWindowLimiter, SecurityMiddleware
from app.security.rbac import is_allowed
from conftest import contract_test_app

# Deliberately test-only secret; production has no fallback.
SECRET = "unit-tests-only-" * 4


class Source:
    def __init__(self):
        self.users = {role: Principal(role, role, "tenant-alpha", frozenset(["league-alpha-1"]) if role == "league_organizer" else frozenset(),
                         frozenset(["club-alpha-1"]) if role == "club_manager" else frozenset(),
                         "player-alpha-1" if role == "player" else None) for role in ROLES}

    def get_principal(self, id_):
        return self.users.get(id_)

    def get_resource(self, kind, id_):
        valid = [f"{kind}-alpha-1", f"{kind}-alpha-2", f"{kind}-beta-1"]
        if id_ not in valid:
            raise HTTPException(404, detail=dict(code="LEAGUE_NOT_FOUND", message="Missing", details={}))
        return Resource(id_, "tenant-beta" if "beta" in id_ else "tenant-alpha",
                        id_.replace("player", "club") if kind == "player" else None)

    def demo_principals(self):
        return self.users

    def scenario_context(self):
        context = dict(tenant_id="tenant-alpha", foreign_tenant_id="tenant-beta")
        for kind in ("league", "club", "player"):
            for scope, suffix in (("own", "alpha-1"), ("other", "alpha-2"), ("foreign", "beta-1")):
                context[f"{scope}_{kind}_id"] = f"{kind}-{suffix}"
        return context


@pytest.fixture
def client():
    app = contract_test_app(rbac.router, ping.router, fixtures.router)
    app.state.jwt_service = JwtService(SECRET)
    app.state.authorization_source = Source()
    app.add_middleware(SecurityMiddleware, limiter=MemoryWindowLimiter())
    return TestClient(app)


PROBES = [("POST", "/tenants", {"super_admin"}), ("GET", "/platform/config", {"super_admin"})]
for suffix in ("alpha-1", "alpha-2", "beta-1"):
    PROBES += [("POST", f"/leagues/league-{suffix}/fixtures", {"super_admin", "league_organizer"} if suffix == "alpha-1" else {"super_admin"})]
    for action in ("roster", "products"):
        PROBES += [("POST", f"/clubs/club-{suffix}/{action}", {"super_admin", "club_manager"} if suffix == "alpha-1" else {"super_admin"})]
    PROBES += [("PATCH", f"/players/player-{suffix}", {"super_admin", "club_manager", "player"} if suffix == "alpha-1" else {"super_admin"})]
    PROBES += [("GET", f"/clubs/club-{suffix}", set(ROLES) if suffix.startswith("alpha") else {"super_admin"})]


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("method,path,allowed", PROBES)
def test_permission_matrix(client, role, method, path, allowed):
    token = client.app.state.jwt_service.issue(role)
    r = client.request(method, "/audit/v1/rbac"+path, headers={"Authorization": "Bearer " + token}, json={})
    assert r.status_code == (200 if role in allowed else 403), r.text
    assert r.json() == {"authorized": True} if role in allowed else r.json()["error"]["code"] == "FORBIDDEN"


def test_matrix_issues_real_tokens_and_seed_context(client):
    r = client.post("/audit/v1/rbac-matrix")
    assert r.status_code == 200 and set(r.json()["tokens"]) == set(ROLES)
    assert r.json()["context"] == Source().scenario_context()
    for role, token in r.json()["tokens"].items():
        claims = jwt.decode(token, SECRET, algorithms=["HS256"], issuer="nascon", audience="nascon-api")
        assert claims["exp"] - time.time() >= 3600
        assert client.app.state.jwt_service.verify(token) == role


@pytest.mark.parametrize("bad", ["missing", "malformed", "none", "expired", "tampered", "wrong_aud", "wrong_iss", "missing_exp", "future", "bad_subject", "bad_time", "unknown_user"])
def test_invalid_auth(client, bad):
    service = client.app.state.jwt_service
    claims = dict(sub="super_admin", exp=int(time.time())+7200, iat=int(time.time()), aud="nascon-api", iss="nascon", jti="test")
    if bad == "expired":
        claims.update(exp=int(time.time())-1, iat=int(time.time())-7200)
    if bad == "future":
        claims["iat"] += 100
    if bad == "wrong_aud":
        claims["aud"] = "other"
    if bad == "wrong_iss":
        claims["iss"] = "other"
    if bad == "missing_exp":
        del claims["exp"]
    if bad == "bad_subject":
        claims["sub"] = 123
    if bad == "bad_time":
        claims["exp"] = str(claims["exp"])
    if bad == "unknown_user":
        claims["sub"] = "unregistered"
    token = jwt.encode(claims, SECRET, algorithm="HS256")
    if bad == "none":
        token = jwt.encode(claims, "", algorithm="none")
    if bad == "tampered":
        head, payload, signature = token.split(".")
        token = ".".join([head, payload, ("a" if signature[0] != "a" else "b")+signature[1:]])
    headers = {} if bad == "missing" else {"Authorization": "Bearer broken" if bad == "malformed" else "Bearer " + token}
    r = client.get("/audit/v1/rbac/platform/config", headers=headers)
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_authorization_precedes_body_and_resource_lookup(client):
    path = "/audit/v1/rbac/leagues/missing/fixtures"
    assert client.post(path, content="malformed").status_code == 401
    headers = {"Authorization": "Bearer " + client.app.state.jwt_service.issue("super_admin")}
    assert client.post(path, headers=headers, content="malformed").status_code == 404
    assert client.post("/audit/v1/rbac/tenants", headers=headers, content="malformed").json() == {"authorized": True}
    client.app.state.authorization_source.users["super_admin"] = replace(client.app.state.authorization_source.users["super_admin"], role="viewer")
    assert client.post("/audit/v1/rbac/tenants", headers=headers).status_code == 403


def test_strict_jwt_configuration_and_closed_policy():
    with pytest.raises(ValueError):
        JwtService("short")
    with pytest.raises(ValueError):
        JwtService(SECRET).issue("user", 3599)
    assert not is_allowed(Principal("a", "super_admin", None), "unknown_action")
    assert not is_allowed(Principal("b", "viewer", "t"), "platform_config", Resource("c", "t"))
    assert not is_allowed(Principal("x", "unknown", "t"), "read_club", Resource("c", "t"))


def test_sliding_window_and_audit_exemption(client):
    responses = [client.get("/api/v1/ping") for _ in range(150)]
    assert responses[0].json() == {"pong": True}
    assert sum(r.status_code == 429 for r in responses) == 50
    assert all(int(r.headers["retry-after"]) >= 1 for r in responses if r.status_code == 429)
    for _ in range(105):
        r = client.post("/audit/v1/fixtures", json=dict(format="round_robin", teams=["a", "b"]))
        assert r.status_code == 200


def test_window_expiry_is_rolling_and_ip_isolation():
    clock = [0]
    limiter = MemoryWindowLimiter(clock=lambda: clock[0])
    for _ in range(50):
        assert asyncio.run(limiter.check("a")) == 0
    clock[0] = 5
    for _ in range(50):
        assert asyncio.run(limiter.check("a")) == 0
    assert asyncio.run(limiter.check("a")) == 5
    assert asyncio.run(limiter.check("b")) == 0
    clock[0] = 10
    for _ in range(50):
        assert asyncio.run(limiter.check("a")) == 0
    assert asyncio.run(limiter.check("a")) == 5
    clock[0] = 21
    assert asyncio.run(limiter.check("a")) == 0
    assert "b" not in limiter.requests


def test_limiter_atomic_across_threads():
    limiter = MemoryWindowLimiter(clock=lambda: 0)
    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(lambda _: asyncio.run(limiter.check("one")), range(150)))
    assert results.count(0) == 100


def test_large_and_chunked_bodies(client):
    for payload in (b"x"*(1024*1024+1), iter([b"x"*600000, b"y"*600000])):
        r = client.post("/audit/v1/fixtures", content=payload)
        assert r.status_code == 413 and r.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_actual_redis_limiter_when_configured():
    import os
    if not os.getenv("NASCON_REDIS_URL"):
        pytest.skip("Set NASCON_REDIS_URL to verify atomic Lua against actual Redis")
    from redis.asyncio import Redis
    from uuid import uuid4

    async def run():
        redis = Redis.from_url(os.environ["NASCON_REDIS_URL"])
        limiter = RedisWindowLimiter(redis, prefix=f"nascon:test:{uuid4()}:")
        try:
            results = await asyncio.gather(*(limiter.check("a") for _ in range(150)))
            assert results.count(0) == 100
            assert sum(r > 0 for r in results) == 50
        finally:
            await redis.aclose()
    asyncio.run(run())


def test_live_permission_matrix(live_api):
    r = live_api.post("/audit/v1/rbac-matrix")
    assert r.status_code == 200, r.text
    tokens = r.json()["tokens"]
    for role in ROLES:
        for method, path, allowed in PROBES:
            response = live_api.request(method, "/audit/v1/rbac"+path, json={}, headers={"Authorization": "Bearer " + tokens[role]})
            assert response.status_code == (200 if role in allowed else 403), (role, path, response.text)


def test_live_rate_limit(live_api):
    from concurrent.futures import ThreadPoolExecutor
    start = time.perf_counter()
    first = live_api.get("/api/v1/ping")
    assert first.status_code == 200 and first.json() == {"pong": True}
    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(lambda _: live_api.get("/api/v1/ping"), range(149)))
    assert time.perf_counter() - start <= 5
    denied = [r for r in results if r.status_code == 429]
    assert len(denied) >= 40 and all("Retry-After" in r.headers for r in denied)
    time.sleep(11)
    assert live_api.get("/api/v1/ping").status_code == 200
