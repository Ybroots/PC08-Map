# KPI Dictionary - ATGT Lam Dong

**Status**: DRAFT — Baseline measured in T20 pilot

## KPI list

| ID     | Ten KPI                            | Don vi | Nguon do                      | Dimensions                 | Muc tieu (draft)   | Owner    |
| ------ | ---------------------------------- | ------ | ----------------------------- | -------------------------- | ------------------ | -------- |
| KPI-01 | SOS server acknowledgement p95     | ms     | `atgt_sos_intake_duration_ms` | none (no sensitive labels) | PENDING D-04       | Backend  |
| KPI-02 | Hien thi ops p95                   | ms     | Feed cursor timestamps        | area                       | PENDING D-04       | Backend  |
| KPI-03 | Availability core                  | %      | Synthetic + API metrics       | -                          | >= 99.9%/thang     | SRE      |
| KPI-04 | SLA on-time rate                   | %      | Assignment timestamps         | incident_type              | > 90% (chua chot)  | Ops      |
| KPI-05 | SOS khong mat sau accept           | count  | Outbox/queue audit            | -                          | 0                  | SRE      |
| KPI-06 | Thoi gian phan cong trung binh     | s      | Assignment events             | type, area                 | TBD                | Ops      |
| KPI-07 | Ti le phan anh xac minh thanh cong | %      | Report states                 | category                   | TBD                | Ops      |
| KPI-08 | VietMap quota su dung              | %      | Adapter metrics               | api, key_alias             | Alert at 70/85/95% | Backend  |
| KPI-09 | DB replication lag                 | s      | WAL metrics                   | -                          | < 30s alert        | SRE      |
| KPI-10 | Tat ca doc nhay cam duoc log       | %      | Audit reconciliation          | action                     | 100%               | Security |

## Quy tac

- Khong hard-code muc tieu chua duoc phe duyet vao code
- Baseline duoc do trong T20 pilot; target duoc phe duyet sau
- Metric dictionary phai duoc cap nhat cung code (T07 tro di)
- Small-cell suppression: o co so luong nho (< 5) trong dashboard leader phai duoc an
- T07 exports aggregate accepted/replayed/failure counters and duration
  count/sum. No production SLO target or incident/location label is encoded.
