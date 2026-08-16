# Data Dictionary - ATGT Lam Dong Platform

**Status**: DRAFT — Update alongside each task migration

## Schemas

### incident schema

| Table     | Column      | Type                  | Description                 | Constraints             |
| --------- | ----------- | --------------------- | --------------------------- | ----------------------- |
| incidents | id          | UUID                  | Primary key                 | PK, NOT NULL            |
| incidents | public_code | VARCHAR(16)           | Random tracking code        | UNIQUE, NOT NULL        |
| incidents | type        | VARCHAR(50)           | Incident type               | NOT NULL                |
| incidents | priority    | VARCHAR(20)           | CRITICAL/HIGH/MEDIUM/LOW    | NOT NULL                |
| incidents | geom        | geography(Point,4326) | Location                    | NOT NULL                |
| incidents | accuracy_m  | NUMERIC(8,2)          | GPS accuracy meters         |                         |
| incidents | occurred_at | TIMESTAMPTZ           | When incident happened      | NOT NULL                |
| incidents | state       | VARCHAR(30)           | Current state machine state | NOT NULL                |
| incidents | source      | VARCHAR(20)           | MOBILE_SOS/WEB/MANUAL       | NOT NULL                |
| incidents | version     | INTEGER               | Optimistic lock             | NOT NULL, DEFAULT 1     |
| incidents | created_at  | TIMESTAMPTZ           |                             | NOT NULL, DEFAULT NOW() |
| incidents | updated_at  | TIMESTAMPTZ           |                             | NOT NULL                |

| Table          | Column      | Type        | Description           |
| -------------- | ----------- | ----------- | --------------------- |
| status_history | id          | UUID        | PK                    |
| status_history | incident_id | UUID        | FK incidents.id       |
| status_history | from_state  | VARCHAR(30) |                       |
| status_history | to_state    | VARCHAR(30) |                       |
| status_history | actor       | VARCHAR     | Officer ref (not PII) |
| status_history | reason      | TEXT        |                       |
| status_history | created_at  | TIMESTAMPTZ | Append-only           |

### dispatch schema

| Table       | Key columns                                                              | Notes                                 |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------- |
| units       | unit_id, capability[], service_area(geometry), availability, contact_ref | Not public; versioned                 |
| assignments | incident_id, unit_id, eta_sec, route_quality, assigned/ack/on_scene_at   | SLA timer; unique active per incident |

### report schema

| Table   | Key columns                                                               | Notes                         |
| ------- | ------------------------------------------------------------------------- | ----------------------------- |
| reports | id, public_code, category, geom, plate_text_unverified, state, risk_score | PII-free; plate is UNVERIFIED |

### evidence schema

| Table   | Key columns                                                                | Notes                              |
| ------- | -------------------------------------------------------------------------- | ---------------------------------- |
| objects | owner_type/id, object_key, sha256, mime, size, scan_state, retention_class | Private bucket; checksum immutable |

### privacy schema (RESTRICTED ACCESS)

| Table          | Key columns                                           | Notes                              |
| -------------- | ----------------------------------------------------- | ---------------------------------- |
| identity_links | subject_ref, sealed_identity, reason, retention_until | Separate role/key; no default join |

### identity schema

| Table                    | Key columns                                                                                        | Notes                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| citizen_sessions         | session_id, token_hash, device_class, rotate_after, expires_at, revoked_at, replaced_by_session_id | Anonymous; hash only, no IP/fingerprint/account/PII |
| revoked_officer_sessions | session_id_hash, revoked_at, expires_at, reason_code                                               | OIDC `sid` hash only; no bearer token               |

### map schema

| Table     | Key columns                                                                 | Notes                      |
| --------- | --------------------------------------------------------------------------- | -------------------------- |
| features  | layer_id, version_id, geom, properties, valid_from, valid_to, publish_state | PostGIS; version immutable |
| approvals | version_id, submitter, approver, decision, comment                          | Maker-checker              |

### platform schema

| Table  | Key columns                                                   | Notes                           |
| ------ | ------------------------------------------------------------- | ------------------------------- |
| outbox | event_id, aggregate, type, payload, occurred_at, published_at | Same transaction; index pending |

### integration schema

| Table          | Key columns                                              | Notes                |
| -------------- | -------------------------------------------------------- | -------------------- |
| provider_usage | provider, api, key_alias, request_count, latency, status | No key/query in logs |

### audit schema (APPEND-ONLY)

| Table        | Key columns                                                        | Notes                         |
| ------------ | ------------------------------------------------------------------ | ----------------------------- |
| audit_events | who, action, object, scope, outcome, reason, trace_id, happened_at | App role cannot UPDATE/DELETE |

## State machines

### Incident state machine

```
RECEIVED -> AUTO_SCREENING -> PENDING_VERIFICATION -> VERIFIED
VERIFIED -> ASSIGNED -> ACKNOWLEDGED -> EN_ROUTE -> ON_SCENE -> RESOLVED -> CLOSED
PENDING_VERIFICATION -> REJECTED | DUPLICATE
ASSIGNED -> ESCALATED | REASSIGNED
[any active] -> CANCELLED (requires reason + authority)
```

### Report state machine

```
RECEIVED -> SCREENING -> PENDING_VERIFICATION -> VERIFIED | REJECTED | DUPLICATE
VERIFIED -> IN_PROCESS -> RESOLVED -> CLOSED -> ARCHIVED
```

### Map version state machine

```
DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED -> EXPIRED | WITHDRAWN -> ARCHIVED
```

## Conventions

- All timestamps: UTC in DB; display as Asia/Ho_Chi_Minh in UI
- All IDs: UUID or ULID; public_code is random base32
- Coordinates: EPSG:4326, [longitude, latitude] in GeoJSON
- Money/quota: INTEGER (not float)
- plate_text: always suffixed _unverified, never used for enforcement
