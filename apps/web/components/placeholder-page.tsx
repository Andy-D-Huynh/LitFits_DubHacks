// Temporary stand-in for routes that get built in later milestones.
export function PlaceholderPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2">Not built yet ({milestone}).</p>
    </main>
  );
}
