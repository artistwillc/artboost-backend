const data={
content:["AI Content Generation","Create platform-ready titles, captions, hashtags, descriptions, and calls-to-action from your artwork or products."],
tools:["Creator Tools","Use AI generators, pricing calculators, POD profit tools, collection planning, store critique, trend tools, holiday planning, opportunity scanning, and AI business coaching."],
consultant:["AI Marketing Consultant","Get personalized recommendations for platforms, posting schedules, campaign ideas, automation strategy, and marketing direction."],
automation:["Smart Scheduling & Automation","Schedule future campaigns, build recurring workflows, rotate eligible products, and keep your marketing running consistently."],
library:["Store & Product Library","Connect supported stores and organize your artwork, product images, titles, and links in one centralized marketing library."],
analytics:["Analytics & Insights","Track campaign activity, automation health, publishing performance, and useful marketing signals."],
support:["AI Customer Support","Get ArtBoost-specific help for features, connections, stores, subscriptions, publishing workflows, and troubleshooting."],
publishing:["Multi-Platform Publishing","Create one campaign and publish through your connected social platforms using platform-aware workflows."]
};
const fm=document.getElementById("featureModal"),pm=document.getElementById("pricingModal"),toast=document.getElementById("toast");
function showToast(m){toast.textContent=m;toast.classList.add("show");clearTimeout(window._t);window._t=setTimeout(()=>toast.classList.remove("show"),2200)}
document.querySelectorAll("[data-feature]").forEach(el=>el.addEventListener("click",()=>{const f=data[el.dataset.feature];document.getElementById("featureTitle").textContent=f[0];document.getElementById("featureBody").textContent=f[1];fm.classList.add("open");fm.setAttribute("aria-hidden","false")}));
document.querySelectorAll("[data-close-feature]").forEach(el=>el.addEventListener("click",()=>{fm.classList.remove("open");fm.setAttribute("aria-hidden","true")}));
document.querySelectorAll("[data-pricing]").forEach(el=>el.addEventListener("click",()=>{fm.classList.remove("open");pm.classList.add("open");pm.setAttribute("aria-hidden","false")}));
document.querySelectorAll("[data-close-pricing]").forEach(el=>el.addEventListener("click",()=>{pm.classList.remove("open");pm.setAttribute("aria-hidden","true")}));
document.querySelectorAll("[data-toast]").forEach(el=>el.addEventListener("click",()=>showToast(el.dataset.toast)));
document.querySelector("[data-generate]").addEventListener("click",()=>showToast("Demo content generated — the full AI workflow runs inside ArtBoost."));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){fm.classList.remove("open");pm.classList.remove("open")}});