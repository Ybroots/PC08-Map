const queue = [
  {
    code: "7KD2M8Q4VT9H",
    type: "Tai nạn giao thông",
    priority: "Khẩn cấp",
    received: "11:04:18",
    accuracy: "± 8,5 m",
    state: "Đã tiếp nhận",
  },
  {
    code: "C4N7X2P9W5TR",
    type: "Cứu nạn cứu hộ",
    priority: "Khẩn cấp",
    received: "10:58:42",
    accuracy: "± 24 m",
    state: "Chờ xác minh",
  },
  {
    code: "H8Q3V6M2K7PC",
    type: "Nguy hiểm đường bộ",
    priority: "Cao",
    received: "10:41:07",
    accuracy: "± 13 m",
    state: "Đang xử lý",
  },
] as const;

const feed = [
  { cursor: "000184", time: "11:04:18.421", state: "RECEIVED" },
  { cursor: "000183", time: "10:58:42.018", state: "PENDING_VERIFICATION" },
  { cursor: "000182", time: "10:41:07.864", state: "AUTO_SCREENING" },
] as const;

export default function IncidentQueuePage() {
  return (
    <main className="intake-shell">
      <header className="intake-masthead">
        <div>
          <p className="agency">PC08 · Công an tỉnh Lâm Đồng</p>
          <p className="intake-section">Bảng tín hiệu tiếp nhận khẩn cấp</p>
        </div>
        <div className="intake-mode" aria-label="Ranh giới môi trường">
          <span>Contract shell</span>
          <strong>Synthetic local</strong>
        </div>
      </header>

      <section className="signal-band" aria-label="Trạng thái luồng tiếp nhận">
        <div className="signal-live">
          <i aria-hidden="true" />
          PostgreSQL intake sẵn sàng
        </div>
        <div>
          <span>Resume cursor</span>
          <b>000184</b>
        </div>
        <div>
          <span>Provider path</span>
          <b>Không nằm trong ACK</b>
        </div>
        <div className="signal-clock">
          <span>UTC+7</span>
          <b>11:04:21</b>
        </div>
      </section>

      <div className="intake-titlebar">
        <div>
          <p className="eyebrow">T07 · Incident intake</p>
          <h1>Tiếp nhận SOS</h1>
        </div>
        <p>
          Quét theo thời điểm server xác nhận. Mã cursor cho phép tiếp tục feed
          sau khi mất kết nối mà không suy đoán trạng thái.
        </p>
      </div>

      <div className="intake-grid">
        <section className="queue-panel" aria-labelledby="queue-heading">
          <div className="intake-panel-head">
            <h2 id="queue-heading">Hàng đợi trong phạm vi</h2>
            <span>03 bản ghi mẫu</span>
          </div>
          <div className="queue-list">
            {queue.map((incident, index) => (
              <article
                className={`queue-item${index === 0 ? " queue-item--active" : ""}`}
                key={incident.code}
              >
                <span className="queue-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="queue-primary">
                  <div className="queue-line">
                    <strong>{incident.type}</strong>
                    <time>{incident.received}</time>
                  </div>
                  <code>{incident.code}</code>
                  <p>
                    {incident.state} · GPS {incident.accuracy}
                  </p>
                </div>
                <span
                  className={`priority priority--${incident.priority === "Khẩn cấp" ? "critical" : "high"}`}
                >
                  {incident.priority}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="incident-focus" aria-labelledby="focus-heading">
          <div className="intake-panel-head">
            <h2 id="focus-heading">Tín hiệu đang chọn</h2>
            <span>Cursor 000184</span>
          </div>
          <div className="focus-status">
            <span>Server ACK</span>
            <strong>Đã tiếp nhận</strong>
            <time>11:04:18.421</time>
          </div>
          <div className="incident-map" aria-label="Sơ đồ tọa độ synthetic">
            <span className="map-axis map-axis--x">108.4384 E</span>
            <span className="map-axis map-axis--y">11.9404 N</span>
            <i className="map-crosshair" aria-hidden="true" />
            <div className="accuracy-ring" aria-hidden="true">
              <b>SOS</b>
            </div>
            <p>Vị trí synthetic · EPSG:4326 · độ chính xác 8,5 m</p>
          </div>
          <dl className="incident-facts">
            <div>
              <dt>Loại sự cố</dt>
              <dd>TRAFFIC_ACCIDENT</dd>
            </div>
            <div>
              <dt>Nguồn</dt>
              <dd>WEB</dd>
            </div>
            <div>
              <dt>Phân loại</dt>
              <dd>SENSITIVE</dd>
            </div>
            <div>
              <dt>Phiên bản</dt>
              <dd>01</dd>
            </div>
          </dl>
        </section>

        <aside className="feed-panel" aria-labelledby="feed-heading">
          <div className="intake-panel-head">
            <h2 id="feed-heading">ACK rail</h2>
            <span>Liền mạch</span>
          </div>
          <div className="feed-rail">
            {feed.map((event, index) => (
              <article key={event.cursor}>
                <span className="feed-dot" aria-hidden="true">
                  {index === 0 ? "ACK" : ""}
                </span>
                <div>
                  <code>#{event.cursor}</code>
                  <strong>{event.state}</strong>
                  <time>{event.time}</time>
                </div>
              </article>
            ))}
          </div>
          <div className="feed-rule">
            <b>Quy tắc an toàn</b>
            <p>
              Chỉ “Đã tiếp nhận” sau khi transaction incident, history, audit,
              outbox và idempotency cùng commit.
            </p>
          </div>
        </aside>
      </div>

      <aside className="intake-boundary" aria-label="Ranh giới triển khai">
        <strong>D-02 / D-05 / D-09</strong>
        <p>
          Trang này là contract shell dùng dữ liệu synthetic. Chưa có đăng nhập
          cán bộ thật, địa bàn phục vụ thật hoặc ngưỡng tải production. Quyền
          area và data class vẫn được kiểm tra lại tại API/repository.
        </p>
      </aside>

      <footer className="dossier-footer">
        <span>ATGT / SOS / T07</span>
        <span>
          Không hiển thị IP · session · fingerprint · vị trí lực lượng
        </span>
      </footer>
    </main>
  );
}
