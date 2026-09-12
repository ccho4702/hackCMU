export default function DeliveryFeedback({ title, description, items, pending, onSeek }) {
  return (
    <section className="panel feedback-card" aria-label={title}>
      <div className="card-heading"><h2>{title}</h2>{items && <span className="count-pill">{items.length} moments</span>}</div>
      <p className="card-description">{description}</p>
      <div className="feedback-list">
        {items ? items.length ? items.map((item, index) => (
          <article key={index} className="feedback-item">
            <button className="time-link" onClick={() => onSeek(item.start_time)}>
              ▷ {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}
            </button>
            <p>{item.content}</p>
          </article>
        )) : <p className="empty-result">No clear issues were flagged in this category.</p>
          : <p className="muted">{pending ? "Your feedback is being prepared." : "This analysis is not available for this saved session."}</p>}
      </div>
    </section>
  );
}
