import { AudioLines, Video } from "lucide-react";

export default function OverviewThesis() {
  return (
    <section className="overview-thesis" aria-labelledby="overview-thesis-title">
      <div className="overview-thesis-lead">
        <span className="overview-thesis-kicker">PERSONALIZED FEEDBACK</span>
        <h2 id="overview-thesis-title">Know what to <strong>improve.</strong></h2>
        <ol className="overview-thesis-steps" aria-label="Practice workflow">
          <li>Record</li><li>Review</li><li>Practice</li><li>Repeat</li>
        </ol>
      </div>
      <div className="overview-thesis-measures">
        <article>
          <Video size={21} strokeWidth={1.6} aria-hidden="true" />
          <h3>Visual delivery</h3>
          <p>Gaze · Movement · Expression</p>
          <span>4 visual measures</span>
        </article>
        <article>
          <AudioLines size={21} strokeWidth={1.6} aria-hidden="true" />
          <h3>Voice delivery</h3>
          <p>Pronunciation · Timing · Tone</p>
          <span>5 speech measures</span>
        </article>
      </div>
    </section>
  );
}
