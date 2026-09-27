import type { Metadata } from "next";
import { ProsePage } from "@/components/marketing/Prose";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <ProsePage title="Terms" updated="27 September 2026">
      <p>
        <strong>Draft for the beta.</strong> These are plain-language terms for a hackathon beta. They will be replaced by reviewed
        terms before any wider launch.
      </p>
      <h2>What Turn is</h2>
      <p>
        Turn is software that lets a group of people who know each other run a savings circle. The rules of each circle are
        carried out by smart contracts. Turn isn&rsquo;t a bank, a lender, or an investment product, and doesn&rsquo;t hold your
        money.
      </p>
      <h2>Beta, unaudited</h2>
      <ul>
        <li>The contracts have not been audited. Bugs may exist and could lead to loss of funds.</li>
        <li>Amounts are capped during the beta. Please only use amounts you can afford to lose.</li>
        <li>Money is held in AUSD, a US-dollar stablecoin. Its value in your currency changes with exchange rates.</li>
      </ul>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Only join circles with people you know and trust.</li>
        <li>Check that savings circles are allowed where you live. Rules differ between countries and states.</li>
        <li>Keep your phone and passkey safe. We can&rsquo;t recover an account for you.</li>
      </ul>
      <h2>No warranty</h2>
      <p>The software is provided as is, under the MIT licence, without warranties of any kind.</p>
    </ProsePage>
  );
}
