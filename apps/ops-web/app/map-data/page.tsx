const versions = [
  {
    version: "V.04",
    state: "IN_REVIEW",
    owner: "Tổ dữ liệu Đà Lạt",
    time: "17.08 · 07:40",
  },
  {
    version: "V.03",
    state: "PUBLISHED",
    owner: "Phòng PC08",
    time: "15.08 · 16:20",
  },
  {
    version: "V.02",
    state: "EXPIRED",
    owner: "Phòng PC08",
    time: "01.08 · 00:00",
  },
] as const;

export default function MapDataPage() {
  return (
    <main className="dossier-shell">
      <header className="dossier-nav">
        <div>
          <p className="agency">PC08 · Lâm Đồng</p>
          <p className="nav-section">Hồ sơ dữ liệu bản đồ</p>
        </div>
        <div className="environment">T06 · Contract shell</div>
      </header>

      <section className="dossier-heading" aria-labelledby="map-data-title">
        <div>
          <p className="eyebrow">Lớp dữ liệu / MAP-DP-01</p>
          <h1 id="map-data-title">Điểm đen nguy hiểm</h1>
          <p className="lede">
            Kiểm soát từng phiên bản trước khi dữ liệu xuất hiện trên bản đồ
            công khai.
          </p>
        </div>
        <div
          className="record-stamp"
          aria-label="Trạng thái phiên bản hiện hành"
        >
          <span>Hiện hành</span>
          <strong>V.03</strong>
          <small>PUBLIC · ĐÀ LẠT</small>
        </div>
      </section>

      <section className="validity-strip" aria-label="Hiệu lực phiên bản">
        <span>UTC+7</span>
        <div>
          <b>Hiệu lực từ</b>
          <time>15.08.2026 · 16:20</time>
        </div>
        <div>
          <b>Hết hiệu lực</b>
          <time>Không giới hạn</time>
        </div>
        <div className="validity-live">
          <i /> Đang công bố
        </div>
      </section>

      <div className="workspace-grid">
        <section className="survey-map" aria-labelledby="survey-title">
          <div className="panel-label">
            <span>01</span>
            <h2 id="survey-title">Phạm vi khảo sát</h2>
            <small>EPSG:4326</small>
          </div>
          <div
            className="map-canvas"
            role="img"
            aria-label="Sơ đồ tuyến đường Đà Lạt với ba điểm kiểm tra dữ liệu tổng hợp"
          >
            <span className="coordinate coord-a">11.956°N</span>
            <span className="coordinate coord-b">108.438°E</span>
            <div className="road road-a" />
            <div className="road road-b" />
            <div className="road road-c" />
            <div className="map-pin pin-a">
              <b>01</b>
              <span>Hòa Bình</span>
            </div>
            <div className="map-pin pin-b">
              <b>02</b>
              <span>Trần Phú</span>
            </div>
            <div className="map-pin pin-c">
              <b>03</b>
              <span>Ba Tháng Hai</span>
            </div>
            <div className="scale">
              0 <i /> 500 m
            </div>
          </div>
        </section>

        <section className="version-ledger" aria-labelledby="ledger-title">
          <div className="panel-label">
            <span>02</span>
            <h2 id="ledger-title">Sổ phiên bản</h2>
            <small>3 bản ghi</small>
          </div>
          <div className="ledger-list">
            {versions.map((item) => (
              <article
                className={`ledger-row state-${item.state.toLowerCase()}`}
                key={item.version}
              >
                <strong>{item.version}</strong>
                <div>
                  <b>{item.state}</b>
                  <p>{item.owner}</p>
                </div>
                <time>{item.time}</time>
              </article>
            ))}
          </div>
          <aside className="auth-boundary">
            <b>Biên kiểm soát D02</b>
            <p>
              Thao tác tạo, gửi duyệt và công bố chỉ mở sau khi API xác thực
              đúng vai trò cùng phạm vi <code>area-dalat</code>.
            </p>
          </aside>
        </section>

        <section className="change-sheet" aria-labelledby="change-title">
          <div className="panel-label">
            <span>03</span>
            <h2 id="change-title">Phiếu thay đổi V.04</h2>
            <small>so với V.03</small>
          </div>
          <div className="change-stats">
            <div>
              <b>+03</b>
              <span>Thêm mới</span>
            </div>
            <div>
              <b>02</b>
              <span>Điều chỉnh</span>
            </div>
            <div>
              <b>−01</b>
              <span>Loại khỏi bản</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Mã đối tượng</th>
                <th>Thay đổi</th>
                <th>Kết quả kiểm tra</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>DP-DL-014</td>
                <td>Mức độ MEDIUM → HIGH</td>
                <td>
                  <span className="pass">Hợp lệ</span>
                </td>
              </tr>
              <tr>
                <td>DP-DL-019</td>
                <td>Thêm tọa độ điểm</td>
                <td>
                  <span className="pass">Hợp lệ</span>
                </td>
              </tr>
              <tr>
                <td>DP-DL-021</td>
                <td>Vòng polygon tự cắt</td>
                <td>
                  <span className="fail">Từ chối · dòng 21</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <footer className="dossier-footer">
        <span>Dữ liệu hiển thị là tổng hợp phục vụ phát triển.</span>
        <span>Maker ≠ Checker · audit append-only</span>
      </footer>
    </main>
  );
}
