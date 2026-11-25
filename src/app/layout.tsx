import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mizanbooks.tech"),
  title: {
    default: "Mizan Books — Double-entry accounting for small businesses",
    template: "%s · Mizan Books",
  },
  description:
    "Mizan Books is double-entry accounting for small businesses, in English, Amharic, Afaan Oromo, Somali, and Arabic.",
  applicationName: "Mizan Books",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mizan Books",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Mizan Books",
    locale: "en",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mizan Books" }],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#E0973A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var l=localStorage.getItem("mizan_lang");if(l==="ar"){document.documentElement.lang="ar";document.documentElement.dir="rtl";}else if(l==="am"||l==="om"||l==="so"||l==="en"){document.documentElement.lang=l;document.documentElement.dir="ltr";}}catch(e){}',
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded once from the root layout, which wraps every page */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&family=Noto+Sans+Ethiopic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-mb-beige text-mb-cocoa">{children}</body>
    </html>
  );
}
