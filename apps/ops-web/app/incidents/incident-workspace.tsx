"use client";

import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import type { OpsIncidentFeed } from "@atgt/contracts";
import { useMemo, useState } from "react";
import {
  emptyIncidentFeedState,
  mergeIncidentFeed,
  selectIncident,
} from "../../features/incidents/feed-model";
import { navigationForScope } from "../../features/navigation";

const fixture: OpsIncidentFeed = {
  nextCursor: "184",
  hasMore: false,
  items: [
    {
      cursor: "182",
      fromState: null,
      toState: "RECEIVED",
      changedAt: "2026-08-19T03:41:07.864Z",
      incident: {
        id: "00000000-0000-4000-8000-000000000702",
        publicCode: "H8Q3V6M2K7PC",
        incidentType: "ROAD_HAZARD",
        priority: "HIGH",
        coordinateLongitude: 108.4431,
        coordinateLatitude: 11.9362,
        accuracyMeters: 13,
        description: "Chướng ngại vật trên phần đường (FAKE)",
        occurredAt: "2026-08-19T03:40:31.000Z",
        receivedAt: "2026-08-19T03:41:07.864Z",
        state: "RECEIVED",
        areaId: "area-dalat",
        version: 1,
      },
    },
    {
      cursor: "183",
      fromState: null,
      toState: "RECEIVED",
      changedAt: "2026-08-19T03:58:42.018Z",
      incident: {
        id: "00000000-0000-4000-8000-000000000703",
        publicCode: "C4N7X2P9W5TR",
        incidentType: "RESCUE_REQUEST",
        priority: "CRITICAL",
        coordinateLongitude: 108.4358,
        coordinateLatitude: 11.9451,
        accuracyMeters: 24,
        occurredAt: "2026-08-19T03:58:11.000Z",
        receivedAt: "2026-08-19T03:58:42.018Z",
        state: "RECEIVED",
        areaId: "area-dalat",
        version: 1,
      },
    },
    {
      cursor: "184",
      fromState: null,
      toState: "RECEIVED",
      changedAt: "2026-08-19T04:04:18.421Z",
      incident: {
        id: "00000000-0000-4000-8000-000000000701",
        publicCode: "7KD2M8Q4VT9H",
        incidentType: "TRAFFIC_ACCIDENT",
        priority: "CRITICAL",
        coordinateLongitude: 108.4384,
        coordinateLatitude: 11.9404,
        accuracyMeters: 8.5,
        description: "Va chạm giao thông cần xác minh (FAKE)",
        occurredAt: "2026-08-19T04:03:49.000Z",
        receivedAt: "2026-08-19T04:04:18.421Z",
        state: "RECEIVED",
        areaId: "area-dalat",
        version: 1,
      },
    },
  ],
};

const initialState = mergeIncidentFeed(
  emptyIncidentFeedState(),
  fixture,
  new Date("2026-08-19T04:04:21.000Z"),
  "synthetic",
);

const localScope = createAccessScope({
  principalId: "synthetic-dispatcher",
  role: OfficerRole.DISPATCHER,
  areaIds: ["area-dalat"],
  maxDataClass: DataClass.SENSITIVE,
  authenticationMethods: ["local-mock", "mfa"],
});

const navigation = navigationForScope(localScope, "area-dalat");

const TYPE_LABEL: Readonly<Record<string, string>> = {
  TRAFFIC_ACCIDENT: "Tai nạn giao thông",
  RESCUE_REQUEST: "Yêu cầu cứu nạn",
  ROAD_HAZARD: "Nguy hiểm đường bộ",
};

function time(value: string, withSeconds = false): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(value));
}

export function IncidentWorkspace() {
  const [state, setState] = useState(initialState);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL">("ALL");
  const [checked, setChecked] = useState(false);
  const visible = useMemo(
    () =>
      state.incidents.filter(
        (incident) => filter === "ALL" || incident.priority === filter,
      ),
    [filter, state.incidents],
  );
  const selected =
    state.incidents.find(
      (incident) => incident.id === state.selectedIncidentId,
    ) ?? state.incidents[0];

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <div>
          <p className="ops-agency">PC08 · Công an tỉnh Lâm Đồng</p>
          <p className="ops-title">Bàn tiếp nhận tín hiệu</p>
        </div>
        <nav aria-label="Không gian được phép hiển thị">
          {navigation.map((item) => (
            <a
              aria-current={item.href === "/incidents" ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ops-boundary">
          <span>Local contract shell</span>
          <strong>Chỉ đọc · Synthetic</strong>
        </div>
      </header>

      <section className="ops-freshness" aria-label="Tình trạng dữ liệu">
        <div className="ops-freshness-state">
          <i aria-hidden="true" />
          <span>Mẫu hợp đồng đã xác thực</span>
        </div>
        <div>
          <small>Cursor tiếp tục</small>
          <code>#{state.cursor.padStart(6, "0")}</code>
        </div>
        <div>
          <small>Lần xác thực mẫu</small>
          <time dateTime={state.lastValidatedAt}>
            {time(state.lastValidatedAt!, true)} · UTC+7
          </time>
        </div>
        <button
          type="button"
          onClick={() => setChecked(true)}
          aria-describedby="fixture-status"
        >
          Kiểm tra lại mẫu
        </button>
        <p id="fixture-status" className="sr-only" aria-live="polite">
          {checked
            ? "Mẫu local không đổi. Không có yêu cầu mạng nào được gửi."
            : "Chưa kiểm tra lại mẫu."}
        </p>
      </section>

      <section className="ops-heading">
        <div>
          <p className="ops-kicker">T14A · Read-only resume workspace</p>
          <h1>Tin báo trong phạm vi</h1>
        </div>
        <p>
          Ưu tiên tín hiệu khẩn cấp, giữ nguyên cursor sau gián đoạn và luôn cho
          biết dữ liệu đang là mẫu, mới hay đã cũ.
        </p>
      </section>

      <div className="ops-workspace">
        <section className="ops-queue" aria-labelledby="ops-queue-title">
          <div className="ops-panel-head">
            <div>
              <span>01 / Queue</span>
              <h2 id="ops-queue-title">Hàng đợi</h2>
            </div>
            <div className="ops-filter" aria-label="Lọc mức ưu tiên">
              <button
                type="button"
                aria-pressed={filter === "ALL"}
                onClick={() => setFilter("ALL")}
              >
                Tất cả
              </button>
              <button
                type="button"
                aria-pressed={filter === "CRITICAL"}
                onClick={() => setFilter("CRITICAL")}
              >
                Khẩn cấp
              </button>
            </div>
          </div>
          <div className="ops-queue-list">
            {visible.map((incident) => (
              <button
                type="button"
                className="ops-queue-item"
                data-selected={incident.id === selected?.id}
                onClick={() =>
                  setState((current) => selectIncident(current, incident.id))
                }
                key={incident.id}
              >
                <span
                  className={`ops-priority ops-priority--${incident.priority.toLowerCase()}`}
                >
                  {incident.priority === "CRITICAL" ? "Khẩn" : "Cao"}
                </span>
                <span className="ops-queue-copy">
                  <strong>
                    {TYPE_LABEL[incident.incidentType] ?? incident.incidentType}
                  </strong>
                  <code>{incident.publicCode}</code>
                  <small>
                    GPS ± {incident.accuracyMeters.toLocaleString("vi-VN")} m
                  </small>
                </span>
                <time dateTime={incident.receivedAt}>
                  {time(incident.receivedAt)}
                </time>
              </button>
            ))}
          </div>
        </section>

        {selected ? (
          <section className="ops-focus" aria-labelledby="ops-focus-title">
            <div className="ops-panel-head">
              <div>
                <span>02 / Selected signal</span>
                <h2 id="ops-focus-title">
                  {TYPE_LABEL[selected.incidentType] ?? selected.incidentType}
                </h2>
              </div>
              <span className="ops-state">{selected.state}</span>
            </div>
            <div
              className="ops-map"
              role="img"
              aria-label="Sơ đồ tọa độ synthetic của tin báo đang chọn"
            >
              <span className="ops-map-lon">
                {selected.coordinateLongitude.toFixed(4)} E
              </span>
              <span className="ops-map-lat">
                {selected.coordinateLatitude.toFixed(4)} N
              </span>
              <i className="ops-road ops-road-a" aria-hidden="true" />
              <i className="ops-road ops-road-b" aria-hidden="true" />
              <div className="ops-location" aria-hidden="true">
                <b>SOS</b>
              </div>
              <p>Vị trí synthetic · EPSG:4326 · không gọi VietMap</p>
            </div>
            <dl className="ops-facts">
              <div>
                <dt>Mã tiếp nhận</dt>
                <dd>{selected.publicCode}</dd>
              </div>
              <div>
                <dt>Độ chính xác</dt>
                <dd>± {selected.accuracyMeters.toLocaleString("vi-VN")} m</dd>
              </div>
              <div>
                <dt>Phân loại</dt>
                <dd>SENSITIVE</dd>
              </div>
              <div>
                <dt>Phiên bản</dt>
                <dd>{String(selected.version).padStart(2, "0")}</dd>
              </div>
            </dl>
            <aside className="ops-action-lock">
              <div>
                <span>Thao tác nghiệp vụ</span>
                <strong>Đang khóa</strong>
              </div>
              <p>
                Assignment, SLA và chuyển cấp chờ D-04/D-05. Ẩn nút tại đây
                không thay thế kiểm tra quyền và optimistic version ở API.
              </p>
            </aside>
          </section>
        ) : null}

        <aside className="ops-rail" aria-labelledby="ops-rail-title">
          <div className="ops-panel-head">
            <div>
              <span>03 / Resume rail</span>
              <h2 id="ops-rail-title">Đường tiếp tục</h2>
            </div>
          </div>
          <div className="ops-rail-line">
            {state.events.map((event, index) => (
              <article key={event.cursor}>
                <span className="ops-rail-marker" aria-hidden="true">
                  {index === 0 ? "ACK" : ""}
                </span>
                <div>
                  <code>#{event.cursor.padStart(6, "0")}</code>
                  <strong>{event.toState}</strong>
                  <time dateTime={event.changedAt}>
                    {time(event.changedAt, true)}
                  </time>
                </div>
              </article>
            ))}
          </div>
          <div className="ops-rail-rule">
            <strong>Không suy đoán khoảng trống</strong>
            <p>
              Cursor là toàn cục và có thể bỏ số giữa các địa bàn. Client chỉ
              reject khi cursor server lùi hoặc payload sai contract.
            </p>
          </div>
        </aside>
      </div>

      <aside className="ops-warning" aria-label="Ranh giới triển khai">
        <strong>D-02 · D-04 · D-05 · D-09</strong>
        <p>
          Đây là dữ liệu tổng hợp để kiểm tra UX. Chưa có đăng nhập cán bộ thật,
          realtime cadence, đơn vị phục vụ hay SLA production được phê duyệt.
        </p>
      </aside>
    </main>
  );
}
