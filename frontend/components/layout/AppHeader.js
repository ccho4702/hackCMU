"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Video, ListMusic, Mic2, Library, AudioLines, ArrowUpRight } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";
const NAV=[{href:"/",label:"Overview",icon:Home},{href:"/live",label:"Record",icon:Video},{href:"/evaluation",label:"Evaluation",icon:ListMusic,keepsRun:true},{href:"/practice",label:"Practice",icon:Mic2,keepsRun:true},{href:"/leaderboard",label:"History",icon:Library}];
export function AppHeader({title,subtitle,right,mock,runId}) {
  const pathname=usePathname();
  return <><aside className="studio-sidebar">
    <Link href="/" aria-label="Optune home" className="studio-logo"><Image src="/optune-logo-white.png" alt="Optune" width={1326} height={680} priority /></Link>
    <nav aria-label="Studio pages">{NAV.map(({href,label,icon:Icon,keepsRun})=><Link key={href} href={keepsRun&&runId?`${href}?run=${runId}`:href} aria-current={pathname===href?"page":undefined}><Icon size={20}/><span>{label}</span></Link>)}</nav>
    <div className="sidebar-library"><span><AudioLines size={18}/> YOUR STUDIO</span><p>A little practice.<br/>A better next take.</p><Link href="/live">Start a session <ArrowUpRight size={16}/></Link></div>
    <p className="sidebar-caption">Optimize your voice.<br/>Hear your best.</p>
  </aside><header className="studio-topbar"><div><h1>{title || "Your studio"}</h1><p>{subtitle || "Make room for your next great take."}</p></div><div className="studio-account">{mock&&<span>Mock analyzer</span>}{right}<UserMenu/></div></header></>;
}
