import { BrandLogo } from "@/components/brand-logo";

/**
 * Landing footer. Only links that resolve to real destinations are rendered —
 * Privacy/Terms pages do not exist yet, so they are deliberately omitted rather
 * than left as dead links.
 */
export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="container footer-inner">
        <a className="brand" href="#top" aria-label="MedBook AI — back to top">
          <BrandLogo variant="footer-light" />
        </a>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#website">Website Builder</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <p>© 2026 MedBook AI. All rights reserved.</p>
      </div>
    </footer>
  );
}