import { SlotSchema } from '@fitmirror/shared';

// M2: pairing-code entry, then an iframe of the web app's /embed route.
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>FitMirror</h1>
      <p style={{ color: '#71717a' }}>Pairing arrives in M2.</p>
      <p style={{ color: '#71717a', fontSize: 12 }}>Slots: {SlotSchema.options.join(', ')}</p>
    </main>
  );
}
