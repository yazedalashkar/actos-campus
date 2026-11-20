import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Actos Campus — نظام التواصل القابل للتنفيذ",
    short_name: "Actos Campus",
    description: "حوّل محادثاتك الجامعية إلى بطاقات فعل حيّة وخزنة التزامات يومية",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#06b6d4",
    dir: "rtl",
    lang: "ar",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}