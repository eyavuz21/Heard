"use client";

type DemoTechPointsProps = {
  points: readonly {
    title: string;
    body: string;
  }[];
};

export function DemoTechPoints({ points }: DemoTechPointsProps) {
  return (
    <ol className="demo-tech-rail mx-auto mt-10 w-full max-w-lg md:mt-12">
      {points.map((point, i) => (
        <li key={point.title} className="demo-tech-step">
          <div className="demo-tech-index" aria-hidden>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {i < points.length - 1 ? (
              <span className="demo-tech-spine" />
            ) : null}
          </div>
          <div className="demo-tech-copy">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ink">
              {point.title}
            </p>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink-soft">
              {point.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
