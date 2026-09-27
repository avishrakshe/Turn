import { LINKS } from "@/lib/site";
import { readDeployments, repoFileExists } from "@/lib/deployments";

const CONTRACTS = ["CircleFactory", "Circle (implementation)", "CreditRegistry", "TurnAccount", "TurnKeeper"];

/** Deployed addresses per network, read from contracts/deployments at build time. */
export function ContractAddresses() {
  const deployments = readDeployments();
  if (deployments.length === 0) {
    return (
      <div className="not-prose bg-paper-sunk my-6 rounded-2xl p-5">
        <p className="font-semibold">Not deployed yet</p>
        <p className="text-ink-muted mt-1">
          No deployment files exist in <code>contracts/deployments/</code> yet. Addresses appear here automatically after the first
          deploy. They are never typed into these pages by hand.
        </p>
        <ul className="text-ink-muted mt-3 flex flex-wrap gap-2 text-sm">
          {CONTRACTS.map((c) => (
            <li key={c} className="bg-paper-raised border-line rounded-lg border px-2.5 py-1">
              {c}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <>
      {deployments.map((d) => (
        <div key={d.chainId} className="not-prose my-6">
          <p className="font-semibold">
            {d.network} <span className="text-ink-muted font-normal">· chain {d.chainId}</span>
          </p>
          <div className="border-line mt-2 overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(d.contracts).map(([name, address]) => (
                  <tr key={name} className="border-line border-b last:border-0">
                    <th scope="row" className="px-4 py-3 text-start font-semibold">{name}</th>
                    <td className="px-4 py-3">
                      <a href={`${d.explorer}/address/${address}`} className="text-teal-ink font-mono text-xs break-all underline underline-offset-4">
                        {address}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * A link to a source file on GitHub, rendered only if the file exists in this repo. Until then it
 * says so, rather than linking to a page that 404s.
 */
export function Source({ path, children }: { path: string; children?: React.ReactNode }) {
  const label = children ?? <code>{path.split("/").pop()}</code>;
  if (!repoFileExists(path)) {
    return (
      <span className="text-ink-muted">
        {label} <span className="text-xs">(source not published yet)</span>
      </span>
    );
  }
  return <a href={`${LINKS.github}/blob/main/${path}`}>{label}</a>;
}
