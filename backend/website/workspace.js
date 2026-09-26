async function bootWorkspace(){
  const root=document.querySelector("#workspaceMain");
  try{
    const configResponse=await fetch("/api/public-auth-config",{headers:{Accept:"application/json"}});
    const config=await configResponse.json();
    if(!configResponse.ok||!config.supabaseUrl||!config.supabasePublishableKey) throw new Error(config.error||"Authentication is not configured.");
    const client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
    const {data:{session}}=await client.auth.getSession();
    if(!session){window.location.replace("/");return;}
    document.querySelector("#workspaceUser").textContent=session.user.email||"ArtBoost account";
    document.querySelector("#signOut").addEventListener("click",async()=>{await client.auth.signOut();window.location.replace("/")});
    root.innerHTML=`<p class="eyebrow">ARTBOOST WEB WORKSPACE</p><h1>Welcome back.<br><span>Your marketing command center.</span></h1><p class="lead" style="margin-left:0;text-align:left">Your web workspace uses the same ArtBoost account as the app. Core creator, store, campaign and publishing tools are being connected here without a separate account.</p>
    <section class="workspace-grid">
      <a class="workspace-card" href="#" data-coming><b>AI</b><h2>AI Consultant</h2><p>Marketing guidance, business help, product strategy and ArtBoost assistance.</p></a>
      <a class="workspace-card" href="#" data-coming><b>CREATE</b><h2>Content & Video</h2><p>Create marketing copy and promotional video content for your artwork and products.</p></a>
      <a class="workspace-card" href="#" data-coming><b>CATALOG</b><h2>Products & Stores</h2><p>Manage imported artwork, products and supported store connections.</p></a>
      <a class="workspace-card" href="#" data-coming><b>PUBLISH</b><h2>Social Connections</h2><p>Manage supported social platforms and publishing connections.</p></a>
      <a class="workspace-card" href="#" data-coming><b>AUTOMATE</b><h2>Scheduler</h2><p>Build scheduled campaigns and recurring promotional automation.</p></a>
      <a class="workspace-card" href="#" data-coming><b>ACCOUNT</b><h2>Account & Subscription</h2><p>Review your ArtBoost account, plan and connected services.</p></a>
    </section>`;
    root.querySelectorAll("[data-coming]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();}));
  }catch(error){root.innerHTML=`<div class="workspace-loading">${error?.message||"Unable to load the workspace."}<br><br><a class="secondary-btn" href="/">Return home</a></div>`;}
}
bootWorkspace();