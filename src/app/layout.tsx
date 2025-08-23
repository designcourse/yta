import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthButtons from "@/components/AuthButtons";

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
        <header className="border-b border-black/10 dark:border-white/10 p-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="font-semibold">YouTube Analytics</h1>
            <AuthButtons />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}