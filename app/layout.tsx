import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AntdRegistry from "@/lib/AntdRegistry";
import { ThemeProvider } from "@/components/Providers/ThemeContext";
import { UserProvider } from "@/components/Providers/UserContext";
import { LanguageProvider } from "@/components/Providers/LanguageContext";
import { App } from 'antd';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "emfulfill | Modern Fulfillment for POD & Dropshipping",
  description: "Advanced job-based fulfillment for high-volume POD and dropshipping sellers.",
};

export const preferredRegion = 'hnd1'; // Tokyo

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body
        className={`${inter.variable} antialiased font-sans`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <LanguageProvider>
            <AntdRegistry>
              <App>
                <UserProvider>
                  {children}
                </UserProvider>
              </App>
            </AntdRegistry>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
