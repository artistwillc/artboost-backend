const featureCopy = {
  "AI Content Generation":"Create titles, captions, hashtags, product descriptions, and calls-to-action from your artwork or products.",
  "Creator Tools":"Use AI generators, pricing calculators, POD profit tools, collection planning, store critique, trend tools, and business coaching.",
  "AI Marketing Consultant":"Get AI recommendations for platforms, posting schedules, campaign ideas, automation strategy, and marketing direction.",
  "Smart Scheduling & Automation":"Schedule campaigns, create recurring posting workflows, rotate eligible products, and keep your marketing running.",
  "Store & Product Library":"Connect supported stores and organize imported artwork and products in one centralized marketing library.",
  "Analytics & Insights":"Track publishing activity, campaign health, automation performance, and useful marketing signals.",
  "AI Customer Support":"Get ArtBoost-specific guidance for features, social connections, stores, publishing, subscriptions, and troubleshooting.",
  "Multi-Platform Publishing":"Create one campaign and publish across connected social platforms using platform-aware workflows."
};

const featureModal = document.getElementById("featureModal");
const pricingModal = document.getElementById("pricingModal");
const toast = document.getElementById("toast");
const featureTitle = document.getElementById("featureModalTitle");
const featureText = document.getElementById("featureModalCopy");

function showToast(message){
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>toast.classList.remove("show"),2200);
}

function closeFeature(){
  featureModal.classList.remove("open");
  featureModal.setAttribute("aria-hidden","true");
}

function closePricing(){
  pricingModal.classList.remove("open");
  pricingModal.setAttribute("aria-hidden","true");
}

document.querySelectorAll("[data-feature]").forEach(el=>{
  el.addEventListener("click",()=>{
    const name = el.dataset.feature;
    featureTitle.textContent = name;
    featureText.textContent = featureCopy[name] || "";
    featureModal.classList.add("open");
    featureModal.setAttribute("aria-hidden","false");
  });
});

document.querySelectorAll("[data-open-pricing]").forEach(el=>{
  el.addEventListener("click",()=>{
    closeFeature();
    pricingModal.classList.add("open");
    pricingModal.setAttribute("aria-hidden","false");
  });
});

document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeFeature));
document.querySelectorAll("[data-close-pricing]").forEach(el=>el.addEventListener("click",closePricing));

document.querySelectorAll("[data-coming-soon]").forEach(el=>{
  el.addEventListener("click",()=>showToast(`${el.dataset.comingSoon} link coming soon.`));
});

document.querySelectorAll("[data-generate]").forEach(el=>{
  el.addEventListener("click",()=>showToast("Demo content generated — the live app performs the full AI workflow."));
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeFeature();closePricing();}
});
