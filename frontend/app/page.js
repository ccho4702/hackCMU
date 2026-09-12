"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Mic2, Video, Upload, Play, AudioLines } from "lucide-react";
import { PageShell } from "@/components/ui/studio";
import { UploadPanel } from "@/components/upload/UploadPanel";
import OverviewDemo from "@/components/OverviewDemo";

export default function HomePage(){
  const router=useRouter();
  const [upload,setUpload]=useState(false);
  useEffect(()=>{const run=new URLSearchParams(window.location.search).get("run");if(run&&/^[a-f0-9]{32}$/.test(run))router.replace(`/evaluation?run=${run}`);},[router]);
  return <PageShell><div className="studio-home">
    <div className="studio-filter"><span className="selected">Overview</span><Link href="/leaderboard">Your sessions</Link></div>
    <section className="studio-feature">
      <div className="feature-art"><Image src="/studio-cover.jpg" alt="Blue flowing fabric" width={600} height={600} priority/><AudioLines size={54} strokeWidth={1.4}/><span>THE NEXT TAKE</span></div>
      <div className="feature-copy"><span className="studio-kicker">YOUR PERSONAL SPEAKING STUDIO</span><h2>Sound more like<br/>your best self.</h2><p>Record your ideas. Find your rhythm. Turn a good rehearsal into a great delivery.</p><div className="feature-actions"><Link href="/live" className="studio-primary"><Play size={16} fill="currentColor"/> Start recording</Link><button className="studio-secondary" onClick={()=>setUpload(!upload)} aria-expanded={upload} aria-controls="studio-upload"><Upload size={16}/> Upload a video</button></div></div>
    </section>
    {upload&&<section id="studio-upload" className="studio-upload"><div className="studio-section-heading"><h2>Bring your own recording</h2><button onClick={()=>setUpload(false)} className="studio-secondary">Close</button></div><UploadPanel/></section>}
    <section><div className="studio-section-heading"><h2>Find your next take</h2><span>ONE SESSION, THREE WAYS TO IMPROVE</span></div>
      <div className="studio-collection">
        <Link href="/live" className="studio-album"><div className="album-art album-record"><Video size={40}/><span>01 / RECORD</span><i><ArrowUpRight size={21}/></i></div><h3>Put your ideas on record</h3><p>Camera on. A fresh take starts here.</p></Link>
        <Link href="/evaluation" className="studio-album"><div className="album-art album-review"><ListBars/><span>02 / REFINE</span><i><ArrowUpRight size={21}/></i></div><h3>Hear what could be better</h3><p>Delivery feedback. A clearer script.</p></Link>
        <Link href="/practice" className="studio-album"><div className="album-art album-practice"><Mic2 size={40}/><span>03 / REHEARSE</span><i><ArrowUpRight size={21}/></i></div><h3>Make the words your own</h3><p>Listen, follow along, and try again.</p></Link>
      </div>
    </section>
    <OverviewDemo />
    <section className="studio-list"><div className="studio-section-heading"><h2>Built around your voice</h2><span>YOUR REHEARSAL TOOLKIT</span></div>{[["01","See your delivery","Eye contact, gestures & posture","/evaluation"],["02","Shape your message","Choose a language & script style","/live"],["03","Find your rhythm","Reference audio & word-by-word practice","/practice"]].map(([n,title,detail,href])=><Link href={href} key={n}><span>{n}</span><strong>{title}</strong><p>{detail}</p><ArrowUpRight size={17}/></Link>)}</section>

  </div></PageShell>;
}
function ListBars(){return <div className="album-bars" aria-hidden="true">{[24,50,32,74,100,62,88,45,68,32,55,25].map((h,i)=><b key={i} style={{height:h}}/>)}</div>;}
