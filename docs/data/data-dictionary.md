# Data Dictionary - ATGT Lam Dong Platform

**Status**: DRAFT — Update alongside each task migration

## Schemas

### incident schema

| Table     | Column      | Type                  | Description                           | Constraints             |
| --------- | ----------- | --------------------- | ------------------------------------- | ----------------------- |
| incidents | id          | UUID                  | Internal primary key                  | PK, NOT NULL            |
| incidents | public_code | CHAR(12)              | Random Crockford-base32 tracking code | UNIQUE, regex           |
| incidents | type        | TEXT                  | Incident catalog code                 | FK catalog, NOT NULL    |
| incidents | priority    | TEXT                  | CRITICAL/HIGH/MEDIUM/LOW              | CHECK, NOT NULL         |
| incidents | longitude   | DOUBLE PRECISION      | EPSG:4326 longitude                   | -180..180, NOT NULL     |
| incidents | latitude    | DOUBLE PRECISION      | EPSG:4326 latitude                    | -90..90, NOT NULL       |
| incidents | geom        | geography(Point,4326) | Generated from longitude and latitude | STORED, GiST index      |
| incidents | accuracy_m  | NUMERIC(8,2)          | GPS accuracy meters                   | 0..10000                |
| incidents | description | TEXT                  | Citizen-provided description          | 1..500 when present     |
| incidents | occurred_at | TIMESTAMPTZ           | When incident happened                | NOT NULL                |
| incidents | state       | TEXT                  | Current state-machine value           | CHECK, NOT NULL         |
| incidents | source      | TEXT                  | MOBILE_SOS/WEB/MANUAL                 | CHECK, NOT NULL         |
| incidents | area_id     | TEXT                  | Opaque authorization-area reference   | NOT NULL                |
| incidents | data_class  | TEXT                  | Data classification                   | CHECK, NOT NULL         |
| incidents | version     | INTEGER               | Optimistic lock                       | > 0, DEFAULT 1          |
| incidents | created_at  | TIMESTAMPTZ           | Created in UTC                        | NOT NULL, DEFAULT NOW() |
| incidents | updated_at  | TIMESTAMPTZ           | Last mutation in UTC                  | >= created_at           |

| Table          | Column        | Type            | Description                          |
| -------------- | ------------- | --------------- | ------------------------------------ |
| status_history | id            | UUID            | PK                                   |
| status_history | incident_id   | UUID            | FK incidents.id                      |
| status_history | from_state    | VARCHAR(30)     |                                      |
| status_history | to_state      | VARCHAR(30)     |                                      |
| status_history | actor_ref     | VARCHAR         | Hashed/opaque actor ref              |
| status_history | reason        | TEXT            |                                      |
| status_history | trace_id      | TEXT            | 32-char trace ID                     |
| status_history | created_at    | TIMESTAMPTZ     | Append-only                          |
| status_history | feed_sequence | BIGINT IDENTITY | Internal monotonic ops resume cursor |

`incident.incidents` has no citizen session, IP, fingerprint, account, token or
identity-link column. `incident.status_history` grants the app INSERT/SELECT but
revokes UPDATE/DELETE/TRUNCATE. T07 protects accepted `public_code`, type,
priority, coordinate, accuracy, description, occurred time and source with a
database trigger; corrections must be append-only rather than overwriting the
citizen-submitted payload. `feed_sequence` is internal and is never returned by
public tracking.

### dispatch schema

| Table       | Key columns                                                              | Notes                                                   |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| units       | unit_id, capability[], service_area(geometry), availability, contact_ref | Not public; versioned                                   |
| assignments | incident_id, unit_id, assigned_by_ref, assigned/ack/on_scene/ended_at    | Unique active per incident; SLA/route fields remain T08 |

### report schema

| Table                | Key columns                                                                                                                                        | Notes                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| category_catalog     | code, label_vi, label_en, enabled                                                                                                                  | Local seed is explicitly synthetic                          |
| reports              | id, public_code, category_code, longitude/latitude/geom, description, plate_text_unverified, reported_at, state, risk_score, verification_sequence | PII-free; queue cursor assigned on PENDING_VERIFICATION     |
| status_history       | report_id, from/to state, actor_ref, reason, trace_id, created_at                                                                                  | Append-only                                                 |
| duplicate_candidates | report_id, candidate_report_id, signals, status, observed_at, source_ref, version, resolution                                                      | Suggestion-only; immutable evidence + one manual resolution |

`report.reports` contains no citizen session, IP, device, account, token or
identity-link column. A database trigger protects the acknowledged category,
location, description, unverified plate, reported time, area and classification.
The app role cannot delete report rows or update/delete/truncate history. T11B1
may set an unowned `evidence.objects` owner to this report only after the object
is READY and both HMAC capabilities plus a live citizen session are valid. The
ownership cannot be reassigned. Raw report capability material is not stored in
the business table or idempotency response. T11B2A duplicate candidates store only
signal kinds (`TIME/SPACE/HASH/PLATE`) and never thresholds. T11B2B1 generates
only `HASH`, by exact equality against READY report evidence in the same area;
migration 13 adds the supporting partial SHA-256/owner index. The worker does not
write risk score and never concludes a report. Only a scoped
dispatcher may resolve PENDING to CONFIRMED/FALSE_POSITIVE through an optimistic
transaction; fuzzy candidate generation and risk scoring remain blocked.

### evidence schema

| Table        | Key columns                                                                                                      | Notes                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| uploads      | upload_id, capability_hash, quarantine_object_key, declared_sha256/mime/size, state                              | No citizen identity; declaration immutable     |
| objects      | evidence_id, owner_type/id/area_id, data_class, original/derivative key, sha256, mime, size, scan engine/version | READY only; integrity/classification protected |
| scan_history | evidence_id, from/to state, outcome_code, engine/version, trace_id                                               | Append-only; no key, URL or scan detail        |

`owner_type/owner_id/area_id` remain null until an incident/report attachment
authorizes the link; once attached they cannot be reassigned. App role
cannot delete uploads/objects or update/delete scan history. Retention version is
`PENDING`, legal hold defaults false, and no archive/delete job exists while D-06
is pending.

Migration 11 exposes `evidence.attach_ready_to_report` as the narrow atomic
ownership boundary. Invalid upload capability, non-READY state and existing
ownership all return no row so the public API cannot enumerate evidence state.

Once classified `restricted`, an evidence object cannot be downgraded. Scoped
viewer lookup requires exact `area_id + owner_id(case) + evidence_id`, a linked
`incident|report` owner and READY upload state; storage keys remain server-only.

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

| Table               | Key columns                                                                 | Notes                                |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| layers              | layer_key, layer_name, layer_type, is_public                                | Base catalog                         |
| features            | layer_id, version_id, geom, properties, valid_from, valid_to, publish_state | Valid EPSG:4326 geometry; GiST index |
| layer_schemas       | layer_id, schema_version, geometry_type, schema_json, is_active             | Versioned import/property registry   |
| layer_versions      | version_number, schema_version, area_id, data_class, state, validity        | T06 lifecycle aggregate              |
| approvals           | version_id, decision, actor_ref, trace_id, decided_at                       | Append-only maker-checker decision   |
| version_transitions | version_id, from_state, to_state, actor_ref, trace_id                       | Append-only lifecycle audit          |

For the T13A public traffic-alert projection, an eligible current feature must
contain a strict `properties.alert` object with `priority`, Vietnamese
`warning_vi`, Vietnamese `action_vi`, and unique `vehicle_types`. The API never
returns the remaining arbitrary `properties`; a malformed alert on an otherwise
eligible public/PUBLISHED/current version makes the query fail closed. This is a
bbox-only projection and does not imply route proximity, travel direction, or
anti-repeat policy.

### platform schema

| Table            | Key columns                                                                    | Notes                                           |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| outbox           | event_id, aggregate, event_type/version, payload, trace_id, occurred/published | Same transaction as aggregate state change      |
| inbox_messages   | consumer_name, message_id, event_type, trace_id, processed_at                  | Composite PK; duplicate claim loses             |
| idempotency_keys | key, request_hash, state, response, expires_at                                 | SOS claim/response completes in the incident TX |

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
