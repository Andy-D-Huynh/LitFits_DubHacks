import Link from 'next/link';

const routes = ['/studio', '/onboarding', '/compare', '/checkout', '/embed'] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">FitMirror</h1>
      <ul className="mt-4 space-y-1">
        {routes.map((href) => (
          <li key={href}>
            <Link className="underline" href={href}>
              {href}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
