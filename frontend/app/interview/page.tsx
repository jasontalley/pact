import { AppLayout } from '@/components/layout';
import { InterviewChat } from '@/components/interview/InterviewChat';

export default function InterviewPage() {
  return (
    <AppLayout showSidebar={false}>
      <div className="h-[calc(100vh-73px)]">
        <InterviewChat />
      </div>
    </AppLayout>
  );
}
