# T09 - Citizen mobile SOS

## Outcome

Công dân có một luồng React Native tối giản để lấy vị trí, xác nhận loại sự cố
và gửi SOS text/toạ độ. Yêu cầu được ghi vào secure storage trước khi thử gửi,
dùng cùng một idempotency key qua retry/restart, tự gửi lại khi có mạng và chỉ
hiển thị mã hồ sơ sau phản hồi `202` hợp lệ từ T07. Khi data không dùng được,
người dùng vẫn có thể gọi trực tiếp `112/113/114/115`.

## Source requirements

- REQ-01 và Section 9.1: SOS lấy GPS/accuracy/time, tối đa ba thao tác, có
  confirm và click-to-call.
- Section 9.2: encrypted local queue, stable client event/idempotency metadata,
  explicit device/sending/server-ack/failed states, text/coordinate trước media.
- UAT-01..05: online, low accuracy, offline/reconnect, double submit và provider
  outage không làm mất acknowledgement.
- ADR-002: React Native TypeScript native development build; không dùng Expo Go.
- ADR-009: API coordinate order là longitude/latitude EPSG:4326.
- T07 executable contract: `POST /api/v1/public/sos`, header
  `Idempotency-Key`, response `SosAcceptedSchema`.

## Current state

- T07 đã nhận SOS atomically, replay idempotent, không phụ thuộc VietMap/
  notification và trả public tracking code sau server acknowledgement.
- Feature/composition, encrypted queue, tests và React Native 0.73 Android/iOS
  shell đã tồn tại trong `apps/citizen-mobile`.
- Android debug APK build pass với application ID development
  `com.atgtlamdong.dev`; không có attached device/emulator và iOS không thể build
  trên Windows, nên permission/deep-link UAT và release signing chưa được giả vờ
  đã kiểm chứng.

## Decisions and blockers

- D-03 vẫn pending: không thêm VietMap SDK hoặc reverse geocoding vào critical
  path; SOS chỉ dùng fix từ location service của OS.
- D-09 vẫn pending: không thêm media, media size, compression hoặc load tuning.
  Queue ghi `mediaChecksum: null` để giữ schema mở rộng nhưng không tuyên bố đã
  hỗ trợ media.
- Location UX dùng ngưỡng client có tên, inject được (freshness và low accuracy),
  không dùng ngưỡng đó để từ chối SOS. Mặc định T09 chỉ phục vụ cảnh báo UI và
  được ghi trong runbook; backend vẫn validate range/accuracy theo contract.
- Secure queue phải fail closed nếu native keychain không sẵn sàng; tuyệt đối
  không fallback sang AsyncStorage/plaintext.
- Không có server ACK thì không có public code và không dùng từ ngữ “đã nhận”.

## Design direction

Đối tượng là công dân đang chịu áp lực; màn hình chỉ có một việc: gửi tối thiểu
hoặc gọi khẩn cấp. Hướng thị giác là **phiếu tín hiệu cứu hộ** thay cho dashboard.

- Color tokens: `rescue-red #C9282D`, `night-blue #102A43`, `paper #F7F9FC`,
  `warning #B96B00`, `ack-green #167A5B`, `line #CCD6E0`.
- Type: system heavy cho hành động/tiêu đề, system regular cho hướng dẫn và
  monospace cho accuracy/time/public code.
- Signature: một “receipt rail” bốn mốc `Trên máy -> Đang gửi -> Server đã nhận ->
Cần thử lại`; chỉ một mốc được nhấn và mỗi mốc có chữ, không dựa riêng vào màu.
- Chuyển động chỉ dùng cho mốc đang gửi và phải tắt khi reduced-motion bật.

```text
+----------------------------------+
| SOS LÂM ĐỒNG        [CÓ/MẤT MẠNG]|
| Vị trí + accuracy / cảnh báo     |
| [Loại sự cố]                     |
| [Mô tả ngắn - không bắt buộc]    |
| [      KIỂM TRA VÀ GỬI SOS      ]|
| Trên máy -- Đang gửi -- Server ✓ |
| Hướng dẫn an toàn                |
| Gọi 112 | 113 | 114 | 115        |
+----------------------------------+
```

Tự critique: màn hình “nút đỏ khổng lồ + card gradient” quá chung và dễ làm mờ
trạng thái delivery. Thiết kế cuối giữ màu đỏ cho đúng một hành động, dành phần
nhận diện cho receipt rail và copy chính xác về nơi dữ liệu đang nằm.

## Change map

| Area               | Files                                                 | Change                                                    | Risk                               |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| Mobile model       | `apps/citizen-mobile/src/features/sos/model.ts`       | Queue item/version/delivery and location quality          | False acknowledgement              |
| Mobile application | `submission-service.ts`, `api-client.ts`              | Persist-before-send, serialized drain, exact 202 contract | Duplicate/lost retry               |
| Native adapters    | `keychain-store.ts`, `location.ts`, `connectivity.ts` | OS secure storage, permission/GPS, reconnect              | Plaintext fallback/native drift    |
| Mobile UI          | `SosScreen.tsx`, `styles.ts`                          | Confirm, warnings, receipt rail, calls/accessibility      | Stress UX/accessibility            |
| Native shell       | `android/`, `ios/`, `App.tsx`, `native-config.ts`     | Permissions, autolink, debug config, release block        | Bundle/signing/config drift        |
| Tests              | `apps/citizen-mobile/src/features/sos/*.spec.ts(x)`   | Offline/restart/double tap/ACK/location/a11y              | False confidence without simulator |
| Docs               | README, runbook, UAT, handoff                         | Configuration, test evidence and native-shell boundary    | Operational ambiguity              |

## Implementation sequence

1. Define versioned queue item, delivery states, ports and location assessment.
2. Implement keychain-backed store with no plaintext fallback.
3. Implement T07 API adapter and persist-before-send submission service with a
   single-flight queue drain and stable idempotency key.
4. Bind OS location, network reconnect, UUID generation and privacy-safe
   analytics ports.
5. Build the SOS screen and explicit confirmation/receipt/call fallback.
6. Add deterministic tests, docs and full repository gates.
7. Generate the RN 0.73 native shell, lock debug-only identifiers/configuration,
   autolink native adapters and verify an installable Android APK build.

## Test plan

- Unit/application: online exact ACK; offline saved; reconnect drains; double tap
  dedupe; restart converts interrupted `SENDING` to retryable state with same key;
  retryable/permanent/protocol errors never create ACK.
- Location: permission denied, stale fix, low accuracy, coordinate mapping.
- Secure storage: versioned round-trip, corrupt payload fail closed, no plaintext
  storage adapter in composition.
- Contract: request header/body match T07 and only validated `202` creates receipt.
- UI/accessibility: labeled controls, 48px targets, live delivery status, call
  links, confirm step and public code hidden before ACK.
- Native: Metro release bundle and Android debug APK build are automated locally;
  permission prompts, airplane-mode reconnect and `tel:` still require attached
  Android device/emulator. iOS build/UAT requires macOS.

## Rollout and rollback

- Mobile feature is opt-in through explicit runtime composition/API base URL;
  missing keychain or config fails closed while emergency call links remain.
- No database migration or backend rollout is required; T07 remains backward
  compatible.
- Deploy API T07 before a mobile build containing T09.
- Rollback the mobile bundle while preserving keychain queue data. Do not clear
  unacknowledged queue items or acknowledged tracking codes during rollback.

## Definition of done

- [x] Persist-before-send encrypted queue with stable UUID idempotency.
- [x] Offline/reconnect/restart and double-action are deterministic and safe.
- [x] UI never claims server receipt or reveals code before validated `202` ACK.
- [x] Permission/accuracy/staleness guidance and four tel fallbacks exist.
- [x] Accessibility assertions and privacy-safe analytics tests pass.
- [x] RN 0.73 Android/iOS shell, permissions and fail-closed release entry exist.
- [x] Android native modules autolink and an installable debug APK builds.
- [ ] UAT-01..04 pass on an attached Android target; iOS build/UAT passes on macOS.
- [x] `format:check`, lint, typecheck, tests, contract, integration, e2e and build
      pass; final diff/secret scan reviewed.

## Progress log

- [x] 2026-08-17: inspected T07, ADR-002/009, source Section 9 and UAT.
- [x] 2026-08-17: locked T09 scope to text/coordinate; D-03/D-09 boundaries kept.
- [x] 2026-08-17: implemented keychain queue, transport, reconnect, location and UI.
- [x] 2026-08-17: 23 tests pass across model/store/transport/service/screen suites.
- [x] 2026-08-17: full local gates pass; 167 covered tests, 45 integration tests,
      19 contract tests and 13 package builds.
- [x] 2026-08-17: published feature commit `a8c8772`; GitHub CI run
      `31996841150` passed all six jobs including cold-start integration.
- [x] 2026-08-17: generated RN 0.73 Android/iOS shell with dev-only
      `com.atgtlamdong.dev`, location permissions and release-blocked fallback.
- [x] 2026-08-17: 31 mobile tests pass across 8 suites; Metro production bundle
      and Android `assembleDebug` pass with all four native adapters autolinked.
- [x] 2026-08-17: published native integration commit `2b54b57`; GitHub CI run
      `31998881133` passed all six jobs including cold-start integration/build.

## Handoff

- Changed files: RN native shell/entry/config tests, mobile package/lockfile,
  README, runbook, UAT and handoff.
- Tests run/results: 31 mobile tests; Metro production bundle, Android debug APK
  and full local repository gates pass; CI run `31998881133` is green.
- Remaining risks: no attached Android target, iOS requires macOS, and production
  application ID/API endpoint/signing remain intentionally unconfigured.
- Rollback steps: remove T09 mobile bundle; retain secure queue/keychain entries.
