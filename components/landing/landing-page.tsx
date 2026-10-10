import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import type { SubscriptionPlan } from "@/types/database";

import { APP_ROUTES } from "@/lib/constants";
import {
  AI_BAND_IMAGE,
  AI_BULLETS,
  AI_NOTE,
  FEATURES,
  HERO_CHECKS,
  QUEUE_BULLETS,
  SHOWCASE,
  STEPS,
  TRUST_ITEMS,
  WEBSITE_BULLETS,
} from "./data";
import { FaqSection } from "./faq-section";
import { PricingSection } from "./pricing-section";
import { ProductFrame } from "./product-frame";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

type LandingPageProps = {
  signedIn: boolean;
  plans: SubscriptionPlan[];
};

/**
 * Public landing page for `/` — the approved MedBook AI marketing site v2.
 * All composition is server-rendered; the only client islands are the mobile
 * nav toggle (SiteHeader) and the native <details> FAQ. CTAs point at real
 * routes (signup / login / dashboard / billing checkout) and pricing reads the
 * live `subscription_plans` table.
 */
export function LandingPage({ signedIn, plans }: LandingPageProps) {
  return (
    <div className="landing">
      <SiteHeader signedIn={signedIn} />

      <main id="top">
        {/* Hero — real product screenshots in product frames. */}
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">✦ All-in-one clinic management</span>
              <h1>
                Everything your clinic needs. <em>One smart platform.</em>
              </h1>
              <p>
                Manage appointments, patients, prescriptions, AI-powered
                communication and your clinic website — all from one beautifully
                simple dashboard.
              </p>
              <div className="hero-actions">
                <a
                  className="btn btn-primary"
                  href={signedIn ? APP_ROUTES.app.dashboard : APP_ROUTES.auth.signup}
                >
                  Get Started <span>↗</span>
                </a>
                <a className="btn btn-outline" href="#how">
                  See How It Works <span>▶</span>
                </a>
              </div>
              <div className="hero-note">
                {HERO_CHECKS.map((check) => (
                  <span className="check" key={check}>
                    {check}
                  </span>
                ))}
              </div>
            </div>

            <div className="hero-real">
              <ProductFrame
                src="/marketing/dashboard.webp"
                alt="Real MedBook AI clinic dashboard showing appointment metrics and activity"
                label="MedBook AI · Clinic Dashboard"
                aspectRatio="1.56"
                priority
                sizes="(min-width: 701px) 45vw, 100vw"
              />
              <div className="product-frame hero-mini">
                <div className="browser-top" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <span>Patient Workspace</span>
                </div>
                <Image
                  src="/marketing/patients.webp"
                  alt="Real MedBook AI patient workspace"
                  fill
                  sizes="(min-width: 701px) 20vw, 45vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip. */}
        <div className="trust">
          <div className="container trust-row">
            <strong>Built for independent doctors & growing clinics</strong>
            {TRUST_ITEMS.map((item) => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
        </div>

        {/* Features. */}
        <section className="section" id="features">
          <div className="container">
            <div className="center">
              <span className="eyebrow">Everything in one place</span>
              <h2 className="section-title">A simpler way to run your clinic.</h2>
              <p className="section-sub">
                From the first appointment to the final follow-up, manage your
                daily workflow without juggling multiple tools.
              </p>
            </div>
            <div className="features-grid">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article className="feature" key={feature.title}>
                    <div className="feature-icon">
                      <Icon className="icon" />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.blurb}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Product showcases (real screenshots). */}
        <section className="section showcase" id="product">
          <div className="container">
            <div className="center">
              <span className="eyebrow">Real product screenshots</span>
              <h2 className="section-title">See MedBook AI in action.</h2>
              <p className="section-sub">
                Actual screens from the clinic management platform, presented in
                clean product frames. Sensitive details are obscured.
              </p>
            </div>
            <div className="showcase-grid">
              {SHOWCASE.map((item) => (
                <article className="showcase-card" key={item.title}>
                  <div className="showcase-image relative">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 700px) 90vw, (max-width: 950px) 45vw, 30vw"
                      className="object-contain object-top"
                    />
                  </div>
                  <div className="showcase-copy">
                    <h3>{item.title}</h3>
                    <p>{item.blurb}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* AI WhatsApp receptionist. */}
        <section className="section dark-band" id="ai">
          <div className="container split">
            <div>
              <span
                className="eyebrow"
                style={{
                  background: "#315746",
                  color: "#e3f2e5",
                  borderColor: "#48745b",
                }}
              >
                AI WhatsApp Receptionist
              </span>
              <h2>
                Helpful answers, even when your front desk is busy.
              </h2>
              <p>
                Give patients an easier way to ask about fees, services and
                appointments — with human handoff when needed.
              </p>
              <div className="bullets">
                {AI_BULLETS.map((bullet) => (
                  <div className="bullet" key={bullet}>
                    <span className="tick">✓</span>
                    {bullet}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "11px", marginTop: "23px" }}>{AI_NOTE}</p>
            </div>
            <div>
              <div className="real-ai">
                <Image
                  src={AI_BAND_IMAGE.src}
                  alt={AI_BAND_IMAGE.alt}
                  width={1440}
                  height={1012}
                  sizes="(min-width: 951px) 45vw, 90vw"
                />
              </div>
              <p className="product-caption">{AI_BAND_IMAGE.caption}</p>
            </div>
          </div>
        </section>

        {/* Website builder. */}
        <section className="section website-section" id="website">
          <div className="container split">
            <div>
              <span className="eyebrow">Your clinic, your website</span>
              <h2>Build your online presence. Keep everything connected.</h2>
              <p>
                Create and edit your clinic website, showcase doctors and
                services, connect your own domain and make it easier for
                patients to book.
              </p>
              <div className="bullets">
                {WEBSITE_BULLETS.map((bullet) => (
                  <div className="bullet" key={bullet}>
                    <span className="tick">✓</span>
                    {bullet}
                  </div>
                ))}
              </div>
            </div>
            <div className="real-website">
              {/*
                Builder frame leads. Swap `builder.webp` for a full-width
                capture of the website editor and add a published-site preview
                alongside — the two-column layout is sized for exactly that.
              */}
              <ProductFrame
                src="/marketing/builder.webp"
                alt="Website builder interface cropped from supplied screenshot"
                label="Website Editor"
                height={360}
                sizes="(max-width: 700px) 90vw, 55vw"
              />
              <ProductFrame
                src="/marketing/booking.webp"
                alt="Actual MedBook AI public booking page"
                label="Published Booking Page"
                height={360}
                sizes="(max-width: 700px) 90vw, 40vw"
              />
            </div>
          </div>
        </section>

        {/* Smart TV queue. */}
        <section className="section" id="queue">
          <div className="container queue-layout">
            <div className="product-frame queue-real">
              <div className="browser-top" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>Actual TV Queue Screen</span>
              </div>
              <Image
                src="/marketing/queue.webp"
                alt="Real MedBook AI waiting room queue, currently empty"
                width={1440}
                height={739}
                sizes="(min-width: 951px) 45vw, 90vw"
              />
            </div>
            <div>
              <span className="eyebrow">Smarter waiting rooms</span>
              <h2>Keep your patient queue moving.</h2>
              <p style={{ margin: "18px 0" }}>
                Reception check-in, token updates and waiting-room TV displays
                stay connected, so staff and patients can follow the day&apos;s flow
                more easily.
              </p>
              <div className="bullets">
                {QUEUE_BULLETS.map((bullet) => (
                  <div className="bullet" key={bullet}>
                    <span className="tick">✓</span>
                    {bullet}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works. */}
        <section className="section" id="how" style={{ background: "#fbfcfa" }}>
          <div className="container center">
            <span className="eyebrow">Simple setup</span>
            <h2 className="section-title">Get your clinic up and running.</h2>
            <p className="section-sub">
              Start with the essentials. Add integrations and advanced tools
              when you&apos;re ready.
            </p>
            <div className="steps">
              {STEPS.map((step, index) => (
                <div className="step" key={step.title}>
                  <div className="step-num">{index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing. */}
        <PricingSection plans={plans} signedIn={signedIn} />

        {/* Security band. */}
        <section style={{ padding: "55px 0 0" }}>
          <div className="container security">
            <span className="shield">
              <ShieldCheck className="icon" style={{ width: 33, height: 33 }} />
            </span>
            <div>
              <h3>Your clinic data stays protected.</h3>
              <p>
                Clinic-level data isolation, staff permissions and secure team
                invitations help protect sensitive information.
              </p>
            </div>
            <a className="btn btn-outline" href="#faq">
              Learn more →
            </a>
          </div>
        </section>

        {/* FAQ. */}
        <FaqSection />

        {/* Final CTA. */}
        <section className="final-cta">
          <div className="container">
            <div className="cta-box">
              <h2>A smarter way to run your clinic starts here.</h2>
              <p>
                Bring your patients, appointments, team and clinic website
                together.
              </p>
              <a className="btn btn-light" href="#pricing">
                Explore Plans →
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}