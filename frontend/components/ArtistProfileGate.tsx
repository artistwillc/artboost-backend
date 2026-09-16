// ARTBOOST_ARTIST_PROFILE_GATE_V1_20260916
import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";
import { supabase } from "@/lib/supabase";
export default function ArtistProfileGate(){
 const pathname=usePathname(); const routing=useRef(false);
 useEffect(()=>{let alive=true;
  async function enforce(){if(routing.current||pathname==="/artist-profile-onboarding")return; const {data:{user}}=await supabase.auth.getUser(); if(!alive||!user)return; const version=Number(user.user_metadata?.artboost_artist_profile_onboarding_version||0); if(version>=1)return; routing.current=true; router.replace("/artist-profile-onboarding" as any); setTimeout(()=>{routing.current=false;},1000);}
  enforce(); const {data}=supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_IN"||event==="USER_UPDATED")enforce();});
  return()=>{alive=false;data.subscription.unsubscribe();};
 },[pathname]); return null;
}
