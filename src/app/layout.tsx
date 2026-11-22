import SplashScreen from "@/components/SplashScreen";
import type { Metadata, Viewport } from "next";
import PwaManager from "@/components/PwaManager";
import "./globals.css";
export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Actos Campus — نظام التواصل القابل للتنفيذ",
  description: "حوّل محادثاتك الجامعية إلى بطاقات فعل حيّة وخزنة التزامات يومية",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Actos Campus",
  },
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
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif" }}
        className="bg-[#09090b] text-zinc-100 antialiased min-h-[100dvh] selection:bg-zinc-800 selection:text-zinc-100"
      >
        <SplashScreen />
        <PwaManager />
        {children}
      </body>
    </html>
  );
}