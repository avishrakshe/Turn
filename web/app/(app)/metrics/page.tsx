"use client";
// Hidden page: real time-to-first-transaction numbers (landing → confirmed join) and feedback, for the submission.
import { useQuery } from "@tanstack/react-query";
import { Card, Screen, Stat } from "@/components/ui";

type Metrics = {
  count: number;
  medianSeconds: number | null;
  medianTaps: number | null;
  fastestSeconds: number | null;
  runs: { id: string; flow: string; seconds: number; taps: number; startedAt: number; passkeyAt?: number; at: number }[];
};

export default function MetricsPage() {
  const m = useQuery({ queryKey: ["metrics"], queryFn: async () => (await (await fetch("/api/metrics")).json()) as Metrics, refetchInterval: 5000 });
  const f = useQuery({
    queryKey: ["feedback"],
    queryFn: async () => (await (await fetch("/api/feedback")).json()) as { count: number; averageRating: number | null; items: { rating: number; answer: string; at: number }[] },
  });
  return (
    <Screen title="Metrics" nav={false}>
      <Card className="grid grid-cols-2 gap-5">
        <Stat label="Runs" value={m.data?.count ?? "…"} />
        <Stat label="Median time to first transaction" value={m.data?.medianSeconds != null ? `${m.data.medianSeconds.toFixed(1)} s` : "–"} />
        <Stat label="Median taps" value={m.data?.medianTaps ?? "–"} />
        <Stat label="Fastest" value={m.data?.fastestSeconds != null ? `${m.data.fastestSeconds.toFixed(1)} s` : "–"} />
      </Card>
      <Card>
        <h2 className="mb-2 font-extrabold">Recent runs</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {(m.data?.runs ?? []).map((r) => (
            <li key={r.id} className="num flex justify-between">
              <span>
                {r.flow} · {new Date(r.at).toLocaleString()}
              </span>
              <span>
                {r.seconds.toFixed(1)} s · {r.taps} taps{r.passkeyAt ? ` · Face ID at ${((r.passkeyAt - r.startedAt) / 1000).toFixed(1)} s` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-extrabold">Feedback</h2>
        <p className="text-sm text-muted">
          {f.data?.count ?? 0} answers · average {f.data?.averageRating?.toFixed(1) ?? "–"} / 5
        </p>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {(f.data?.items ?? []).map((i) => (
            <li key={i.at}>
              {"★".repeat(i.rating)} {i.answer}
            </li>
          ))}
        </ul>
      </Card>
    </Screen>
  );
}
