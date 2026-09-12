export const PROCESSING_STAGES = [
  {id:"prepare",label:"Prepare",provider:"Optune",title:"Preparing your recording",detail:"Getting the video and audio ready for review."},
  {id:"nonverbal_analysis",label:"Delivery",provider:"Gemini",title:"Gemini is reviewing your delivery",detail:"Watching your movements and listening to how you speak."},
  {id:"transcription",label:"Transcript",provider:"ElevenLabs",title:"ElevenLabs is transcribing your speech",detail:"Turning this recording into your original transcript."},
  {id:"script_analysis",label:"Script",provider:"Gemini",title:"Gemini is refining your script",detail:"Keeping your meaning and adapting the wording to your scenario."},
  {id:"voice_cloning",label:"Your voice",provider:"ElevenLabs",title:"ElevenLabs is creating your voice",detail:"Making a fresh voice clone from this recording."},
  {id:"speech_generation",label:"Reference",provider:"ElevenLabs",title:"ElevenLabs is generating your reference",detail:"Reading the improved script in your voice and adding word timing."},
];
export function processingStage(stage) {
  return PROCESSING_STAGES.find(item=>item.id===stage) || {id:"queued",label:"Queued",provider:"Optune",title:"Your recording is queued",detail:"Your review will start shortly."};
}
