// ==============================================================================
// MONTAÑA REDONDA PARADISE - CONFIGURACIÓN PARA HOSTING COMPARTIDO (cPanel)
// ==============================================================================
// Este archivo ya viene preconfigurado con tu Backend oficial activo en Render:
// https://montana-redonda-backend-0jt9.onrender.com/api
// ==============================================================================

window.MRP_CONFIG = {
  API_URL: "https://montana-redonda-backend-0jt9.onrender.com/api"
};

// Normalizar /montana/index.html a /montana/ para el enrutador de Next.js
if (typeof window !== "undefined" && window.location.pathname.endsWith("/index.html")) {
  var cleanPath = window.location.pathname.replace(/\/index\.html$/, "/");
  window.history.replaceState(null, "", cleanPath + window.location.search + window.location.hash);
}
