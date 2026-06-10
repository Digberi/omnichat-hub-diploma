import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonConversation() {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 border-b border-border/50">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-1">
          <Skeleton className="h-4 w-14 rounded-sm" />
          <Skeleton className="h-4 w-4 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonConversationList({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonConversation key={i} />
      ))}
    </>
  );
}
