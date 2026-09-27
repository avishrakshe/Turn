import type { Metadata } from "next";
import { ProsePage } from "@/components/marketing/Prose";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <ProsePage title="Privacy" updated="27 September 2026">
      <p>
        <strong>Draft for the beta.</strong> This page explains, in plain words, what Turn stores and where. It will be reviewed
        before any wider launch.
      </p>
      <h2>What lives on your phone</h2>
      <p>
        Your passkey (Face ID or fingerprint) stays in your phone&rsquo;s secure storage, or your phone maker&rsquo;s password
        manager if you sync passkeys. Turn never sees it.
      </p>
      <h2>What is public on the blockchain</h2>
      <ul>
        <li>Your account address, the circles you join, your payments and payouts, and your chosen display currency.</li>
        <li>Your Turn Score record. It&rsquo;s public by design, so anyone can check it.</li>
      </ul>
      <p>Anything written to the blockchain can&rsquo;t be deleted, by us or by anyone.</p>
      <h2>What our servers see</h2>
      <ul>
        <li>The requests our relayer sends on your behalf, and the IP address they come from, used to prevent abuse.</li>
        <li>If you turn on Telegram reminders: your Telegram chat ID and language, so we can send them.</li>
        <li>If you answer our feedback question: your rating, used to measure how the beta is going.</li>
      </ul>
      <p>We don&rsquo;t sell data, show ads, or use tracking cookies.</p>
      <h2>Questions</h2>
      <p>
        Open an issue on <a href="https://github.com/avishrakshe/Turn">GitHub</a> or message us on X at @turncircle.
      </p>
    </ProsePage>
  );
}
