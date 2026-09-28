
function auroraHostOrigin(){return window.AURORA_HOST_ORIGIN||(location.protocol==='file:'?'null':location.origin)}
function auroraTargetOrigin(){return auroraHostOrigin()==='null'?'*':auroraHostOrigin()}
function auroraTrustedParent(e){return parent!==window&&e.source===parent&&e.origin===auroraHostOrigin()}
window.AURORA_BOOTED=false;
try{const c=localStorage.getItem('aurora-chrome-colour');if(/^#[a-f0-9]{6}$/i.test(c||'')){document.documentElement.style.setProperty('--boot-base',c);document.documentElement.style.backgroundColor=c;document.querySelector('meta[name=theme-color]').content=c}}catch{}
try{document.documentElement.dataset.bootTheme=localStorage.getItem('aurora-boot-theme')||'light'}catch{document.documentElement.dataset.bootTheme='light'}
window.AURORA_ATOMIC=true;window.AURORA_RELEASE_APP=true;window.AURORA_FORCE_PREVIEW=false;
window.AURORA_AUTH_RETURN=null;
const authHash=new URLSearchParams(location.hash.slice(1));
if(authHash.has('access_token')||authHash.has('error_description')){
 window.AURORA_AUTH_RETURN={access_token:authHash.get('access_token'),refresh_token:authHash.get('refresh_token'),error:authHash.get('error_description')};
 history.replaceState(null,'',location.pathname+location.search);
}
