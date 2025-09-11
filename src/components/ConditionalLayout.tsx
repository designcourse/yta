"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  
  // Check if current page is a dashboard page (exclude collection page)
  const isDashboardPage = (pathname.startsWith("/dashboard") && 
                           !pathname.startsWith("/dashboard/collection")) || 
                          pathname.startsWith("/account") || 
                          pathname.startsWith("/billing") ||
                          pathname.startsWith("/support");

  const isCollectionPage = pathname.startsWith('/collection');

  return (
    <div className="relative z-10 h-screen flex flex-col">
      {!isDashboardPage && <Header />}
      <main className="flex-1 overflow-hidden pointer-events-auto">{children}</main>
      {!isDashboardPage && !isCollectionPage && <Footer />}
    </div>
  );
}
