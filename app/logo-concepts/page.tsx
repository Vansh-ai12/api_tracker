import fs from "fs";
import path from "path";

const concepts = [
  {
    id: "01-calendar-date",
    title: "Calendar + crossed date",
    description:
      "Renewal-date awareness. A minimal calendar grid with one date circled and slashed — the day you decided to cancel before billing.",
    file: "01-calendar-date.svg",
  },
  {
    id: "02-nudge-bell",
    title: "Nudge bell",
    description:
      "Evolution of the current bell, not a mute-slash. Keeps the bell silhouette but adds a pre-renewal nudge arc and a check badge — reminded, then decided.",
    file: "02-nudge-bell.svg",
  },
  {
    id: "03-cycle-check",
    title: "Cycle → check",
    description:
      "Abstract subscription-cycle mark. A circular renewal arrow resolves into a checkmark — recurring billing brought under control.",
    file: "03-cycle-check.svg",
  },
  {
    id: "04-wallet-pulse",
    title: "Wallet pulse",
    description:
      "Spending awareness. A minimal card shape with recurring dots and a pulse line — tracking what keeps charging you.",
    file: "04-wallet-pulse.svg",
  },
];

function readSvg(filename: string) {
  const filePath = path.join(
    process.cwd(),
    "design",
    "logo-concepts",
    filename,
  );
  return fs.readFileSync(filePath, "utf8");
}

function ConceptMark({
  svg,
  label,
  variant,
}: {
  svg: string;
  label: string;
  variant: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-2xl border p-8 ${
        isDark
          ? "border-gray-800 bg-[#0a0a0a] text-emerald-400"
          : "border-gray-200 bg-white text-emerald-500"
      }`}
    >
      <div
        className="h-6 w-6 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
        <div
          className="h-6 w-6 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span className={isDark ? "text-gray-50" : "text-[#0a0a0a]"}>
          Unsub
        </span>
      </div>
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-xl border ${
          isDark ? "border-gray-800 bg-gray-950" : "border-gray-100 bg-gray-50"
        }`}
      >
        <div
          className="h-10 w-10 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <p
        className={`text-xs font-medium uppercase tracking-wide ${
          isDark ? "text-gray-500" : "text-gray-400"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export default function LogoConceptsPage() {
  const svgs = Object.fromEntries(
    concepts.map((c) => [c.file, readSvg(c.file)]),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-sm font-medium text-emerald-500">
            Step 1 — Logo concepts
          </p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">
            Unsub logo directions
          </h1>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            Four mark concepts matching the existing icon weight: 24×24 viewBox,
            2.5px stroke, round caps, no fill,{" "}
            <code className="text-sm">currentColor</code>. Each shown at nav
            size (24px), with wordmark, and enlarged (40px) on light and dark
            backgrounds. Pick a direction and I&apos;ll build the production
            version.
          </p>
        </div>

        <div className="mb-10 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-6">
          <p className="mb-3 text-sm font-semibold">Current icon (reference)</p>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-emerald-500">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.3 2.1a1.94 1.94 0 0 1 3.4 0" />
                <path d="M4 14.9A9 9 0 1 1 20 15" />
                <path d="M8 20h8" />
                <path d="M10 20v2" />
                <path d="M14 20v2" />
                <path d="M2 2l20 20" />
              </svg>
              Unsub
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bell + diagonal slash. Inline SVG duplicated in nav and footer (
              <code className="text-xs">app/page.tsx</code>), emerald-500 in
              nav, muted gray in footer. No shared component or favicon yet.
            </p>
          </div>
        </div>

        <div className="space-y-16">
          {concepts.map((concept) => (
            <section key={concept.id}>
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight">
                  {concept.title}
                </h2>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  {concept.description}
                </p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <ConceptMark
                  svg={svgs[concept.file]}
                  label="Light background"
                  variant="light"
                />
                <ConceptMark
                  svg={svgs[concept.file]}
                  label="Dark background"
                  variant="dark"
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
