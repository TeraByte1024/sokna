export function LoadingIndicator({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center py-20">
      <div aria-hidden="true" className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground mt-4">{label}</p>
    </div>
  );
}
