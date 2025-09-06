export const metadata = {
  title: 'Collection',
};

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 h-screen flex flex-col">
      <main className="flex-1 overflow-hidden pointer-events-auto">{children}</main>
    </div>
  );
}


