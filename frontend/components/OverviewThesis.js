import { AudioLines, Video } from "lucide-react";

const VIDEO_SCORES = ["time on camera", "facial activity", "head stability", "facial range"];
const AUDIO_SCORES = ["pronunciation", "pace", "rhythm", "intonation", "emphasis"];

export default function OverviewThesis() {
  return (
    <section className="overview-thesis" aria-labelledby="overview-thesis-title">
      <div className="overview-thesis-lead">
        <span className="overview-thesis-kicker">THE PROBLEM</span>
        <h2 id="overview-thesis-title">
          You can&apos;t <strong>optimize</strong> what you can&apos;t <strong>measure</strong>.
        </h2>
        <p>
          Pitches, demo days, and interviews get rehearsed on <strong>feel</strong>, so there is nothing to improve against except a vague sense of <q>I looked nervous.</q>
        </p>
      </div>

      <div className="overview-thesis-measures">
        <article>
          <span className="overview-thesis-kicker"><Video size={14} aria-hidden="true" /> FROM VIDEO</span>
          <h3>Every second, <strong>four scores</strong></h3>
          <ul>
            {VIDEO_SCORES.map((score) => <li key={score}>{score}</li>)}
          </ul>
        </article>
        <article>
          <span className="overview-thesis-kicker"><AudioLines size={14} aria-hidden="true" /> FROM AUDIO</span>
          <h3>Every word, <strong>five scores</strong></h3>
          <ul>
            {AUDIO_SCORES.map((score) => <li key={score}>{score}</li>)}
          </ul>
        </article>
      </div>

      <div className="overview-thesis-loop">
        <p>
          We turned that into <strong>numbers</strong> — an <strong>objective function</strong> and <strong>decision variables</strong>. The product is the loop: <strong>record</strong>, get scored, <strong>practice</strong> against a reference, get scored again. Each take is an <strong>iteration</strong>, and the timestamps tell you which second to fix.
        </p>
        <ol>
          <li>Record</li>
          <li>Get scored</li>
          <li>Practice</li>
          <li>Score again</li>
        </ol>
      </div>
    </section>
  );
}
