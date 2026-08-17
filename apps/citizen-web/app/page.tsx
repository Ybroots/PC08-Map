export default function HomePage() {
  return (
    <main className="public-map">
      <header className="public-head">
        <p className="public-brand">Bản đồ ATGT · Lâm Đồng</p>
        <span className="public-status">
          <i /> Dữ liệu đang hiệu lực
        </span>
      </header>
      <section className="public-stage">
        <div className="public-copy">
          <div>
            <h1>
              Đi đúng.
              <br />
              <span>Biết trước.</span>
            </h1>
            <p>
              Tra cứu các điểm nguy hiểm và đoạn đường hạn chế đã được PC08 kiểm
              tra, phê duyệt và công bố.
            </p>
            <div className="layer-legend">
              <span>
                <i className="danger" />
                Điểm nguy hiểm
              </span>
              <span>
                <i className="closure" />
                Đường hạn chế
              </span>
            </div>
          </div>
          <aside className="effective-note">
            <b>Phạm vi dữ liệu công khai</b>Chỉ hiển thị phiên bản PUBLISHED,
            phân loại public và còn hiệu lực tại thời điểm truy vấn.
          </aside>
        </div>
        <div
          className="public-canvas"
          role="img"
          aria-label="Sơ đồ minh họa bản đồ giao thông Đà Lạt bằng dữ liệu tổng hợp"
        >
          <div className="public-road r1" />
          <div className="public-road r2" />
          <div className="public-road r3" />
          <span className="hazard h1">01</span>
          <span className="hazard h2">02</span>
          <span className="hazard h3">03</span>
          <article className="map-card">
            <small>DP-DL-014 · MỨC CAO</small>
            <b>Khu vực Hòa Bình</b>
            <p>
              Điểm minh họa tổng hợp. Giảm tốc độ và tuân thủ biển báo tại hiện
              trường.
            </p>
          </article>
          <span className="map-coordinate">108.4384°E · 11.9404°N</span>
        </div>
      </section>
      <footer className="public-foot">
        <span>Dữ liệu demo · không dùng để điều hướng thực địa</span>
        <a href="/api/v1/public/map/layers/dangerous_points/features?bbox=108.40,11.90,108.50,11.98&zoom=13">
          Hợp đồng API công khai
        </a>
      </footer>
    </main>
  );
}
