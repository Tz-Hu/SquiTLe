import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "科研排期 · Research Gantt", description: "轻量、直观的个人科研甘特图与时间线排期工具。", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
