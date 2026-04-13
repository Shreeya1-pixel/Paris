import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-bg-base text-text-primary px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-6xl">📍</span>
        <h1 className="text-3xl font-bold font-display text-accent-gold mt-2">Lost in the city?</h1>
        <p className="text-text-muted text-base max-w-xs">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link
        href="/map"
        className="px-6 py-3 rounded-pill bg-accent-gold text-bg-base font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Back to the map
      </Link>
    </main>
  );
}
