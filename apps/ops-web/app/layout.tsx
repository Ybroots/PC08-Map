import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Điều hành ATGT Lâm Đồng",
  description: "Không gian tác nghiệp dành cho cán bộ được phân quyền.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
