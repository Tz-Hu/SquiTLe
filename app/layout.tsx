import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Squitle · Schedule quickly in TimeLine",
  description: "快速、直观的个人时间线排期与 TodoList。",
  applicationName: "Squitle",
  icons: { icon: "/brand/squitle-pixel.png", shortcut: "/brand/squitle-pixel.png", apple: "/brand/squitle-pixel.png" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
