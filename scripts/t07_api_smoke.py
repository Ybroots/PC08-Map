"""HTTP smoke for provider-independent T07 SOS acknowledgement and replay."""

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


BASE = "http://127.0.0.1:3000/api/v1"
KEY = str(uuid4())
BODY = json.dumps(
    {
        "coordinateLongitude": 108.4384,
        "coordinateLatitude": 11.9404,
        "accuracyMeters": 8.5,
        "incidentType": "TRAFFIC_ACCIDENT",
        "description": "Synthetic HTTP smoke",
        "clientEventAt": "2026-08-17T04:00:00.000Z",
    }
).encode()


def request(path: str, method: str = "GET", body=None, headers=None):
    req = Request(BASE + path, data=body, method=method, headers=headers or {})
    try:
        with urlopen(req, timeout=20) as response:
            return response.status, dict(response.headers), response.read().decode()
    except HTTPError as error:
        raise AssertionError(f"HTTP {error.code}: {error.read().decode()}") from error


headers = {"Content-Type": "application/json", "Idempotency-Key": KEY}
status, response_headers, raw = request("/public/sos", "POST", BODY, headers)
assert status == 202
assert response_headers["Idempotency-Replayed"] == "false"
accepted = json.loads(raw)
assert accepted["status"] == "RECEIVED"
assert len(accepted["publicCode"]) == 12

status, replay_headers, replay_raw = request("/public/sos", "POST", BODY, headers)
assert status == 202
assert replay_headers["Idempotency-Replayed"] == "true"
assert json.loads(replay_raw) == accepted

status, tracking_headers, tracking_raw = request(
    f"/public/cases/{accepted['publicCode']}"
)
assert status == 200
assert tracking_headers["Cache-Control"] == "no-store"
tracking = json.loads(tracking_raw)
assert set(tracking) == {"publicCode", "status", "receivedAt", "lastUpdatedAt"}
assert tracking["status"] == "RECEIVED"

status, _, metrics = request("/metrics")
assert status == 200
assert "atgt_sos_intake_accepted_total 1" in metrics
assert "atgt_sos_intake_replayed_total 1" in metrics

print(
    json.dumps(
        {
            "public_code": accepted["publicCode"],
            "idempotency_key": KEY,
        }
    )
)
