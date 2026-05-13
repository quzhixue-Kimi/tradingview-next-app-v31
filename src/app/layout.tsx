import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TradingView Chart",
  description: "Embedded TradingView chart with custom datafeed",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      style={{ height: "100%", margin: 0, padding: 0, background: "#0c0e11" }}
    >
      <body
        style={{
          height: "100%",
          margin: 0,
          padding: 0,
          background: "#0c0e11",
          overflow: "hidden",
        }}
      >
        {children}
      </body>
    </html>
  );
}
