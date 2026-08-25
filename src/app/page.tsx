export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        Revive<span className="text-emerald-600">AI</span>
      </h1>
      <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
        Bring dead revenue back to life.
      </p>
      <div className="mt-8 rounded-xl border border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        Phase 1 complete — synthetic data batch generated.
        <br />
        Run <code className="font-mono">npm run generate-data</code> to rebuild{" "}
        <code className="font-mono">data/synthetic.db</code>.
      </div>
    </main>
  );
}
