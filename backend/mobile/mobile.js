const TOOLS={
content:{title:"AI Content Generation",body:"Create platform-ready marketing content for your artwork and products.",bullets:["Generate titles, captions, hashtags and calls-to-action.","Create reusable marketing content.","Prepare campaigns faster."]},
image:{title:"AI Image Generation",body:"Create supporting visual concepts and marketing imagery.",bullets:["Generate visual concepts.","Create campaign-supporting graphics.","Keep your workflow inside ArtBoost."]},
scheduler:{title:"Smart Scheduler",body:"Plan campaigns and automate recurring promotion.",bullets:["Schedule posts ahead of time.","Use repeat and automation workflows.","Coordinate connected platforms."]},
connect:{title:"Social Media Connect",body:"Connect supported stores and social networks to ArtBoost.",bullets:["Connect supported social platforms.","Connect and import supported stores.","Use connections in campaigns and automations."]},
chat:{title:"AI Chat Assistant",body:"Get ArtBoost guidance, feature help, troubleshooting and marketing assistance.",bullets:["Ask how to use ArtBoost.","Get troubleshooting guidance.","Get help with workflows."]},
caption:{title:"AI Caption Generation",body:"Generate polished captions matched to your artwork, product and goal.",bullets:["Create platform-ready captions.","Adjust messaging by campaign goal.","Pair captions with hashtags and CTAs."]},
analytics:{title:"Analytics & Reports",body:"Review ArtBoost activity and available performance data.",bullets:["Review campaign and posting activity.","Compare products and platforms.","Improve future campaigns."]},
hashtags:{title:"Hashtag Generator",body:"Build relevant hashtag groups for artwork, products and campaigns.",bullets:["Generate targeted hashtag sets.","Support different niches.","Speed up post preparation."]},
rewriter:{title:"AI Rewriter",body:"Refresh existing marketing copy while keeping the core message.",bullets:["Rewrite captions and descriptions.","Change tone quickly.","Create alternate versions."]},
keywords:{title:"Keyword Optimizer",body:"Improve discoverability with stronger listing and campaign keywords.",bullets:["Identify stronger phrasing.","Improve product language.","Support SEO-conscious copy."]},
uploader:{title:"Bulk Uploader",body:"Bring larger groups of products or artwork into ArtBoost efficiently.",bullets:["Support catalog-oriented importing.","Reduce repetitive entry.","Prepare products for campaigns."]},
settings:{title:"Settings",body:"Manage your ArtBoost account, connections, subscriptions and preferences.",bullets:["Review account settings.","Manage connected services.","Adjust ArtBoost preferences."]}
};

const menu=document.querySelector("#mobileMenu");
const menuBtn=document.querySelector(".menu-toggle");
const toolSheet=document.querySelector("#toolSheet");
const pricingSheet=document.querySelector("#pricingSheet");
const accountSheet=document.querySelector("#accountSheet");
const toast=document.querySelector("#toast");
let toastTimer;

function openSheet(el){
  document.querySelectorAll(".sheet.open").forEach(x=>x.classList.remove("open"));
  el.classList.add("open");el.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
}
function closeSheet(el){
  el.classList.remove("open");el.setAttribute("aria-hidden","true");
  if(!document.querySelector(".sheet.open"))document.body.style.overflow="";
}
function showToast(msg){clearTimeout(toastTimer);toast.textContent=msg;toast.classList.add("show");toastTimer=setTimeout(()=>toast.classList.remove("show"),2500)}

menuBtn.addEventListener("click",()=>{menu.classList.toggle("open");menuBtn.setAttribute("aria-expanded",menu.classList.contains("open")?"true":"false")});
document.querySelectorAll("#mobileMenu a,#mobileMenu button").forEach(x=>x.addEventListener("click",()=>menu.classList.remove("open")));

document.querySelectorAll("[data-tool]").forEach(btn=>btn.addEventListener("click",()=>{
  const t=TOOLS[btn.dataset.tool];if(!t)return;
  document.querySelector("#toolTitle").textContent=t.title;
  document.querySelector("#toolBody").textContent=t.body;
  document.querySelector("#toolList").innerHTML=t.bullets.map(x=>`<li>${x}</li>`).join("");
  openSheet(toolSheet);
}));
document.querySelectorAll("[data-close-tool]").forEach(x=>x.addEventListener("click",()=>closeSheet(toolSheet)));
document.querySelectorAll("[data-pricing]").forEach(x=>x.addEventListener("click",()=>openSheet(pricingSheet)));
document.querySelectorAll("[data-close-pricing]").forEach(x=>x.addEventListener("click",()=>closeSheet(pricingSheet)));
document.querySelectorAll("[data-close-account]").forEach(x=>x.addEventListener("click",()=>closeSheet(accountSheet)));

function setAccount(mode){
  const signup=mode!=="signin";
  document.querySelector("#accountTitle").textContent=signup?"Create your ArtBoost account":"Sign in to ArtBoost";
  document.querySelector("#accountCopy").textContent=signup?"Create your account and start on the Free tier.":"Open ArtBoost and sign in with your existing account.";
  const img=document.querySelector("#accountButtonImage");
  img.src=signup?"assets/create-account.webp":"assets/sign-in.webp";
  img.alt=signup?"Create an Account":"Sign In";
  document.querySelectorAll("[data-account-tab]").forEach(b=>b.classList.toggle("active",b.dataset.accountTab===(signup?"signup":"signin")));
}
document.querySelectorAll("[data-account]").forEach(x=>x.addEventListener("click",()=>{setAccount(x.dataset.account);openSheet(accountSheet)}));
document.querySelectorAll("[data-account-tab]").forEach(x=>x.addEventListener("click",()=>setAccount(x.dataset.accountTab)));
document.querySelector("#accountPrimary").addEventListener("click",()=>setTimeout(()=>showToast("If ArtBoost did not open, launch the ArtBoost app and continue there."),450));

document.querySelector("[data-demo-generate]").addEventListener("click",()=>{
  document.querySelector("#demoStatus").textContent="Demo generated — title, caption, hashtags and CTA are ready.";
  showToast("Demo content generated.");
});

document.addEventListener("keydown",e=>{if(e.key==="Escape"){[toolSheet,pricingSheet,accountSheet].forEach(closeSheet)}});

console.info("ArtBoost dedicated mobile build loaded.");
