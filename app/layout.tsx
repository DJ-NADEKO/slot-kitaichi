import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "機種情報クイック参照",
  description: "DMMぱちタウンとハイエナくんの指定箇所を都度参照する個人用ツール",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
