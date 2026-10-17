from conftest import assert_error


def test_readiness_and_repeatable_reset(live_api):
    assert live_api.get("/health").json() == {"status": "ok"}
    expected = dict(status="reset_complete", seed=71, sports=["football", "basketball", "cricket", "esports"],
                    tenants=["tenant-alpha", "tenant-beta"], stock={"var-jersey-001-M": 2, "var-jersey-001-L": 5})
    for _ in range(2):
        response = live_api.post("/audit/v1/reset", json=dict(seed=71, stock={"var-jersey-001-M": 2}))
        assert response.status_code == 200 and response.json() == expected
        assert live_api.get("/audit/v1/inventory/var-jersey-001-M").json() == dict(variant_id="var-jersey-001-M", stock=2, reserved=0)


def test_schema_and_body_limit(live_api):
    assert_error(live_api.post("/audit/v1/reset", json={"seed": "42"}), 400, "VALIDATION_ERROR")
    assert_error(live_api.post("/audit/v1/reset", content="{"), 400, "VALIDATION_ERROR")
    assert_error(live_api.post("/audit/v1/reset", content=b" "*(1024*1024+1)), 413, "PAYLOAD_TOO_LARGE")
