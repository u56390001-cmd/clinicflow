"use client";

import { useState } from "react";
import Image from "next/image";

import { LANDING_NAV_LINKS } from "./data";
import { APP_ROUTES } from "@/lib/constants";

type SiteHeaderProps = {
  signedIn: boolean;
};

/**
 * Sticky marketing header (approved landing page v2). The mobile menu needs
 * client state; anything else stays server-rendered. Auth-aware: signed-in
 * visitors get a direct path back to their dashboard.
 */
export function SiteHeader({ signedIn }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);

  const appUrl = APP_ROUTES.app.dashboard;
  const primaryUrl = signedIn ? appUrl : APP_ROUTES.auth.signup;

  return (
    <header className="landing-header">
      <nav className="container nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="MedBook AI — home">
          <Image
            src="/marketing/medbook-logo.png"
            alt="MedBook AI"
            width={1456}
            height={261}
            priority
          />
        </a>

        <div className={`nav-links${open ? " open" : ""}`}>
          {LANDING_NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <a
            className="nav-login"
            href={signedIn ? appUrl : APP_ROUTES.auth.login}
            onClick={() => setOpen(false)}
          >
            {signedIn ? "Dashboard" : "Log in"}
          </a>
        </div>

        <div className="nav-actions">
          {signedIn ? (
            <a className="login" href={appUrl}>
              Dashboard
            </a>
          ) : (
            <a className="login" href={APP_ROUTES.auth.login}>
              Log in
            </a>
          )}
          <a className="btn btn-primary" href={primaryUrl}>
            {signedIn ? "Open App" : "Get Started"} →
          </a>
          <button
            type="button"
            className="menu-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </nav>
    </header>
  );
}