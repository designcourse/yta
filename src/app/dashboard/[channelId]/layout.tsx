import DashboardLayout from "@/components/DashboardLayout";

export default async function ChannelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout channelId={channelId}>
      {children}
    </DashboardLayout>
  );
}


