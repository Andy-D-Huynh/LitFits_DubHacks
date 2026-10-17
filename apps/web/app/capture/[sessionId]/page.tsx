import { PlaceholderPage } from '@/components/placeholder-page';

export default async function CapturePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PlaceholderPage title={`Capture ${sessionId}`} milestone="M4" />;
}
