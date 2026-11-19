// IV Keys' newsletter window (src/main/index.js openNewsletterWindow): the shared box on a plain page.
import NewsletterBox from './NewsletterBox'

export default function NewsletterPage() {
  return (
    <main className="newsletter-page">
      <NewsletterBox api={window.keys.newsletter} />
      <div className="ivnl-card-actions">
        <button type="button" className="ivnl-secondary" onClick={() => window.close()}>Close</button>
      </div>
    </main>
  )
}
