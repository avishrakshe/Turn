import QRCode from "qrcode";
import { ButtonLink } from "@/components/ui/Button";
import { APP_PATH, SITE_URL } from "@/lib/site";
import { ChapterLabel } from "./Section";

export async function FinalCta() {
  const appUrl = `${SITE_URL}${APP_PATH}`;
  // Rendered on the server to a plain SVG, so the QR costs no client JavaScript.
  const qr = await QRCode.toString(appUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2b211aff", light: "#00000000" } });
  const share = `https://wa.me/?text=${encodeURIComponent(`Let's run our committee on Turn. Everyone pays in, everyone gets a turn, and nobody can run off with the pot: ${appUrl}`)}`;

  return (
    <section id="start" aria-labelledby="start-title" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="bg-marigold-soft border-marigold/30 rounded-[2rem] border p-7 sm:p-12 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12">
          <div>
            <ChapterLabel round={12} label="Your turn" />
            <h2 id="start-title" className="mt-4 max-w-xl text-4xl sm:text-6xl">
              Start your first circle tonight.
            </h2>
            <p className="text-ink-muted mt-5 max-w-lg text-lg">
              It takes a minute. Choose the amount, invite your people, and Turn takes care of the rest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={APP_PATH} size="lg">
                Start a circle
              </ButtonLink>
              <a
                href={share}
                target="_blank"
                rel="noopener noreferrer"
                className="border-line-strong bg-paper-raised text-ink hover:border-ink-muted inline-flex min-h-13 items-center gap-2 rounded-pill border px-6 font-semibold transition-colors"
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <path d="M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Share on WhatsApp
                <span className="sr-only">(opens WhatsApp)</span>
              </a>
            </div>
          </div>
          <figure className="mt-10 hidden flex-col items-center gap-3 sm:flex lg:mt-0">
            {/* Always dark-on-light: scanners need the contrast, whatever the theme. */}
            <div className="rounded-2xl bg-[#fffcf6] p-4 shadow-soft">
              <div className="size-40 [&_svg]:size-full" role="img" aria-label={`QR code that opens ${appUrl}`} dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
            <figcaption className="text-ink-muted text-sm">Scan to open Turn on your phone</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
