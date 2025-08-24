import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SplineBackground from "@/components/SplineBackground";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube Analytics",
  description: "AI-powered YouTube analytics for creators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SplineBackground />
        <div className="relative z-10 pointer-events-none min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 flex items-center justify-center">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}