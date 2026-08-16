const checkpoints = [
  {
    label: "Danh tính cán bộ",
    detail: "Chờ cấu hình OIDC/SSO chính thức (D-02)",
    state: "pending",
  },
  {
    label: "Phạm vi tác nghiệp",
    detail: "Địa bàn · đơn vị · vụ việc · phân loại dữ liệu",
    state: "ready",
  },
  {
    label: "Chính sách truy cập",
    detail: "Deny-by-default, kiểm tra tại API",
    state: "ready",
  },
] as const;

export default function HomePage() {
  return (
    <main className="auth-shell">
      <header className="masthead">
        <p className="agency">PC08 · Công an tỉnh Lâm Đồng</p>
        <p className="environment">Môi trường phát triển</p>
      </header>

      <section className="access-panel" aria-labelledby="access-title">
        <div className="title-block">
          <p className="kicker">Cổng điều hành</p>
          <h1 id="access-title">Chưa mở phiên đăng nhập cán bộ</h1>
          <p className="summary">
            Hệ thống chỉ mở không gian tác nghiệp sau khi nhà cung cấp danh
            tính, MFA và ánh xạ phạm vi được phê duyệt. Mock OIDC chỉ hoạt động
            ở local và test.
          </p>
        </div>

        <div className="route" aria-label="Trạng thái kiểm soát truy cập">
          {checkpoints.map((checkpoint, index) => (
            <article className="checkpoint" key={checkpoint.label}>
              <div
                className={`marker marker--${checkpoint.state}`}
                aria-hidden="true"
              >
                {index + 1}
              </div>
              <div>
                <p className="checkpoint-label">{checkpoint.label}</p>
                <p className="checkpoint-detail">{checkpoint.detail}</p>
              </div>
            </article>
          ))}
        </div>

        <aside className="notice" aria-label="Hướng dẫn truy cập">
          <span className="notice-code">D-02</span>
          <p>
            Cần chốt issuer, audience, JWKS URI và claim mapping trước khi bật
            đăng nhập ngoài môi trường phát triển.
          </p>
        </aside>
      </section>

      <footer>
        Việc ẩn chức năng trên giao diện không thay thế kiểm tra quyền tại API.
      </footer>
    </main>
  );
}
