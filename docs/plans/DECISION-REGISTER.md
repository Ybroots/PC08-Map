# Decision Register - ATGT Lam Dong

Cac quyet dinh con mo - KHONG tu suy doan. Phai duoc con nguoi phe duyet truoc khi code san xuat.

| ID   | Cau hoi                                     | Han chot      | Neu chua chot                              | Trang thai |
| ---- | ------------------------------------------- | ------------- | ------------------------------------------ | ---------- |
| D-01 | Stack chinh thuc va nang luc doi            | Truoc T00     | Dung reference stack; khong vao production | PENDING    |
| D-02 | IdP/SSO/MFA can bo                          | Truoc T03     | Dung mock OIDC local                       | PENDING    |
| D-03 | API/version/quota/SDK VietMap theo hop dong | Truoc T05     | Fake adapter; khong goi production         | PENDING    |
| D-04 | SLA/escalation va truc lien nganh           | Truoc T08     | Config mau disabled                        | PENDING    |
| D-05 | Danh muc unit/capability/service area       | Truoc T08/UAT | Synthetic fixtures                         | PENDING    |
| D-06 | Retention/legal hold tung lop               | Truoc T10/T12 | Khong auto-delete                          | PENDING    |
| D-07 | Quy trinh break-glass                       | Truoc T12     | Feature disabled                           | PENDING    |
| D-08 | Kenh notification va nha cung cap           | Truoc T15     | In-app/internal only                       | PENDING    |
| D-09 | Load profile va media limits                | Truoc T19     | Test matrix tham so                        | PENDING    |
| D-10 | Cap do ATTT va yeu cau bo sung              | Truoc rollout | Khong tuyen bo dat cap do                  | PENDING    |

## Rui ro du an

| Rui ro                       | Dau hieu som                                     | Giam thieu/owner                                       |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Microservice hoa som         | Nhieu repo/deploy nhung chua co vertical slice   | Giu modular monolith; Tech lead phe duyet ADR tach     |
| VietMap chi phoi luong SOS   | API provider nam trong transaction/required path | Outbox + adapter + fallback; backend owner             |
| An danh chi o UI             | PII van nam bang/log nghiep vu                   | Vault + log allowlist + negative tests; privacy owner  |
| Queue HA tren giay           | Mot broker/consumer khong idempotent             | Quorum/DLQ/inbox/chaos; SRE                            |
| DB auto failover split-brain | Hai node, khong DCS quorum tin cay               | Manual runbook hoac bo sung witness; DBA               |
| Scope creep                  | AI/OCR/navigation sau truoc SOS end-to-end       | Cong vertical slice va MVP scope; Product              |
| KPI khong do duoc            | Khong co timestamp/metric dictionary             | Instrument tu T07; Product/QA                          |
| Codex sua qua rong           | Diff lon ngoai ticket, test thieu                | One outcome/chat, AGENTS rules, diff review; Tech lead |
