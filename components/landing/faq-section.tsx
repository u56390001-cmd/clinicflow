import { FAQS } from "./data";

/**
 * FAQ accordion. Uses native <details>/<summary> so it is fully server-
 * rendered with zero JavaScript and is keyboard accessible out of the box.
 */
export function FaqSection() {
  return (
    <section className="section" id="faq">
      <div className="container">
        <div className="center">
          <span className="eyebrow">Frequently asked questions</span>
          <h2 className="section-title">Questions? We have answers.</h2>
        </div>
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}