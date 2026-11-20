import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Actos Campus — نظام التواصل القابل للتنفيذ",
  description: "حوّل محادثاتك الجامعية إلى بطاقات فعل حيّة وخزنة التزامات يومية",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{ fontFamily: "'Cairo', sans-serif" }}
        className="bg-slate-950 text-slate-100 antialiased min-h-screen"
      >
        {children}
      </body>
    </html>
  );
}