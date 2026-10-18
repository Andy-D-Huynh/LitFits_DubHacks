import Link from 'next/link';

const routes = [
  { href: '/studio', label: 'Studio — outline figure & closet' },
  { href: '/shop', label: 'Shop — sample catalog' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/compare', label: 'Compare' },
  { href: '/checkout', label: 'Checkout' },
  { href: '/embed', label: 'Embed' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="font-display text-4xl tracking-tight">FitMirror</h1>
      <p className="mt-2 max-w-lg text-sm text-[var(--fm-muted)]">
        Capture your outline once, then add the exact product from any store (URL or Chrome
        extension). Layers and outfits stay saved on this computer across tabs.
      </p>
      <Link href="/studio" className="fm-btn-primary mt-6 inline-flex">
        Open Studio
      </Link>
      <ul className="mt-8 space-y-1 text-sm">
        {routes.map(({ href, label }) => (
          <li key={href}>
            <Link className="underline underline-offset-2" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
