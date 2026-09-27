import { getUsdRates } from "@/lib/fx";
import { getLiveStats } from "@/lib/stats";
import { Section } from "./Section";
import { StatsRow } from "./StatsRow";

/** Live numbers from the indexer, labelled with their network. No indexer, no numbers. */
export async function LiveStats() {
  const stats = await getLiveStats();
  const rates = stats ? await getUsdRates() : {};
  return (
    <Section
      id="live"
      round={5}
      label="Live"
      title="Circles running right now"
      intro={
        stats ? (
          <>Read straight from the blockchain by our indexer, refreshed every minute. Network: {stats.network}.</>
        ) : null
      }
    >
      {stats ? (
        <StatsRow stats={stats} rates={rates} />
      ) : (
        <div className="bg-paper-raised border-line rounded-card flex flex-col gap-2 border p-6 sm:p-8">
          <p className="font-display text-2xl">Live numbers appear here once the first circles are running.</p>
          <p className="text-ink-muted max-w-2xl">
            We only show real figures, read from the blockchain: circles running, total saved, the share
            of payments made on time, and how quickly payouts arrive. Until our first circles are live,
            there&rsquo;s nothing honest to show.
          </p>
        </div>
      )}
    </Section>
  );
}
