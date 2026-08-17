import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Bản đồ ATGT Lâm Đồng",
  description: "Dữ liệu giao thông công khai đang có hiệu lực.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
