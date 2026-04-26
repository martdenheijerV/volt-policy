import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-ubuntu",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Volt Policy Management",
  description: "Single source of truth for Volt political documents",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await getLang();
  return (
    <html lang={lang} className={ubuntu.variable}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only absolute left-2 top-2 z-50 rounded bg-volt-600 px-3 py-2 text-white focus:not-sr-only focus:outline-none"
        >
          Skip to content
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
