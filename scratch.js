// ======================== PANTALLA DE CARGA ========================
window.addEventListener("DOMContentLoaded", () => {
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");
  const bubble = document.getElementById("progress-bubble");
  let percent = 0;

  const interval = setInterval(() => {
    percent++;
    fill.style.width = percent + "%";
    text.innerText = percent + "%";
    bubble.style.left = percent + "%";

    if (percent >= 100) {
      clearInterval(interval);
      document.getElementById("loading").style.display = "none";
      document.getElementById("game").style.display = "flex";
      iniciarRasca();
    }
  }, 40);
});

// ======================== CONFIG & ESTADO ==========================
const HOY = new Date().toISOString().split("T")[0];
const K_UID = "rasca_uid";
const K_ULTIMO = "ultimoRasca"; // 1 intento por día
const THRESHOLD = 0.65; // % revelado para habilitar premio

// Tabla de premios (pesos ajustables)
const PREMIOS = [
  { id: "BONO_25",  nombre: "25% BONO",   detalle: "Válido hasta 23:59",       peso: 42 },
  { id: "GIROS_10", nombre: "10 GIROS",   detalle: "En juego destacado",       peso: 30 },
  { id: "BONO_50",  nombre: "50% BONO",   detalle: "Mín. carg4 $X",            peso: 20 },
  { id: "BONO_100", nombre: "100% BONO",  detalle: "A los primeros 50",        peso: 7  },
  { id: "RETRY",    nombre: "OTRO INTENTO", detalle: "Rascá nuevamente",       peso: 1  },
];

// Audios
const musica = document.getElementById("musica-fondo");
const sonidoRascar = document.getElementById("sonido-rascar"); // <audio id="sonido-rascar">
const sonidoGanador = document.getElementById("sonido-ganador");

// ======================== UTILIDADES ===============================
function getQueryParam(name){ return new URLSearchParams(location.search).get(name); }

function getOrCreateUID() {
  let id = localStorage.getItem(K_UID);
  if (!id) {
    id = getQueryParam("user") || cryptoRandomId();
    localStorage.setItem(K_UID, id);
  }
  return id;
}
function cryptoRandomId(len=16){
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2,"0")).join("");
}

// PRNG determinístico (mulberry32)
function mulberry32(seed){
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function hashStrToInt(str){
  let h = 0;
  for (let i=0; i<str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return (h >>> 0);
}
function pickWeighted(rnd, items){
  const total = items.reduce((s,x)=>s + (x.peso||1), 0);
  let n = rnd()*total;
  for (const it of items){
    const w = it.peso || 1;
    if (n < w) return it;
    n -= w;
  }
  return items[0];
}

// Fade audio
function fadeOut(audio, duration = 1000) {
  if (!audio) return;
  let step = 0.05;
  const it = setInterval(() => {
    if (audio.volume > step) {
      audio.volume = Math.max(0, audio.volume - step);
    } else {
      audio.volume = 0;
      audio.pause();
      clearInterval(it);
    }
  }, duration * step);
}
function fadeIn(audio, volumeTarget = 0.4, duration = 1000) {
  if (!audio) return;
  audio.volume = 0;
  audio.play().catch(()=>{});
  let step = 0.05;
  const it = setInterval(() => {
    if (audio.volume < volumeTarget - step) {
      audio.volume = Math.min(volumeTarget, audio.volume + step);
    } else {
      audio.volume = volumeTarget;
      clearInterval(it);
    }
  }, duration * step);
}

// ======================== POPUPS ================================
function mostrarPopupAviso() {
  const popup = document.getElementById("popup-aviso");
  popup.classList.remove("hidden");
  const box = popup.querySelector(".popup");
  box.style.animation = "none"; void box.offsetWidth;
  box.style.animation = "popupEntrada 0.5s ease-out, popupPulse 1.5s ease-in-out infinite";
}
function cerrarPopupAviso() {
  document.getElementById("popup-aviso").classList.add("hidden");
}
function mostrarPopupPremio(texto, detalle){
  const popup = document.getElementById("popup-premio");
  // Compatibilidad con tu HTML: #texto-premio (popup) y #prize-text (carta)
  const t1 = document.getElementById("texto-premio");
  if (t1) t1.textContent = texto;
  const det = document.getElementById("detalle-premio");
  if (det) det.textContent = detalle || "";

  popup.classList.remove("hidden");
  const box = popup.querySelector(".popup");
  box.style.animation = "none"; void box.offsetWidth;
  box.style.animation = "popupEntrada 0.5s ease-out, popupPulse 1.5s ease-in-out infinite";

  confetti({
    particleCount: 150,
    spread: 90,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: ['#00ffd0', '#00c780', '#ffffff'],
    zIndex: 1000
  });
}
function cerrarPopup() {
  document.getElementById("popup-premio").classList.add("hidden");
  fadeIn(musica);
}

// ======================== RASCA: CORE ===========================
function iniciarRasca(){
  // Si ya jugó hoy, mostrar aviso (UX). El “lock” es local.
  if (localStorage.getItem(K_ULTIMO) === HOY) {
    mostrarPopupAviso();
  }

  // 1) Determinar premio (determinístico): uid + fecha + campaña
  const uid = getOrCreateUID();
  const campaign = getQueryParam("campaign") || "default";
  const seedStr = `${uid}|${HOY}|${campaign}`;
  const rnd = mulberry32(hashStrToInt(seedStr));
  const premio = pickWeighted(rnd, PREMIOS);

  // Reflejar premio en la carta y popup
  const prizeText = document.getElementById("prize-text");
  if (prizeText) prizeText.textContent = premio.nombre;
  const popupTexto = document.getElementById("texto-premio");
  if (popupTexto) popupTexto.textContent = premio.nombre;
  const popupDetalle = document.getElementById("detalle-premio");
  if (popupDetalle) popupDetalle.textContent = premio.detalle || "";

  // 2) Preparar canvas de rasca
  const canvas = document.getElementById("scratch-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ajustarCanvas(canvas);
  pintarMascara(ctx, canvas);

  // 3) Interacción de rascar (mouse/touch)
  let rascando = false;
  const pincel = { size: 28 };

  canvas.addEventListener("pointerdown", (e)=>{ rascando = true; rascar(e, canvas, ctx, pincel); playScratch(); });
  canvas.addEventListener("pointermove", (e)=>{ if (rascando) rascar(e, canvas, ctx, pincel); });
  canvas.addEventListener("pointerup",   ()=>{ rascando = false; stopScratch(); verificarRevelado(canvas, ctx, premio); });
  canvas.addEventListener("pointerleave",()=>{ rascando = false; stopScratch(); });

  window.addEventListener("resize", ()=>{ ajustarCanvas(canvas); pintarMascara(ctx, canvas); }, { passive:true });
}

function ajustarCanvas(canvas){
  const card = document.querySelector(".scratch-card");
  const rect = card.getBoundingClientRect();
  canvas.width  = Math.floor(rect.width);
  canvas.height = Math.floor(rect.height);
}

function pintarMascara(ctx, canvas){
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#9aa3a5"; // plata
  ctx.fillRect(0,0,canvas.width, canvas.height);
  // textura suave
  dibujarRuido(ctx, canvas.width, canvas.height, 0.08);
}

function dibujarRuido(ctx, w, h, density=0.08){
  const count = Math.floor(w*h*density/10);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let i=0;i<count;i++){
    const x = Math.random()*w, y = Math.random()*h, r = Math.random()*2+0.5;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
}

function rascar(e, canvas, ctx, pincel){
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width/rect.width);
  const y = (e.clientY - rect.top)  * (canvas.height/rect.height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, pincel.size, 0, Math.PI * 2);
  ctx.fill();
}

function playScratch(){
  if (!sonidoRascar) return;
  if (sonidoRascar.paused){
    sonidoRascar.currentTime = 0;
    sonidoRascar.volume = 0.55;
    sonidoRascar.loop = true;
    sonidoRascar.play().catch(()=>{});
  }
}
function stopScratch(){
  if (!sonidoRascar) return;
  sonidoRascar.pause();
  sonidoRascar.currentTime = 0;
}

function verificarRevelado(canvas, ctx, premio){
  // muestreo cada 8px para rendimiento
  const step = 8;
  const data = ctx.getImageData(0,0,canvas.width, canvas.height).data;
  let transparentes = 0, total = 0;
  for (let y=0; y<canvas.height; y+=step){
    for (let x=0; x<canvas.width; x+=step){
      const a = data[(y*canvas.width + x)*4 + 3]; // canal alpha
      total++;
      if (a === 0) transparentes++;
    }
  }
  const ratio = transparentes / total;
  if (ratio >= THRESHOLD){
    onRevelado(premio);
  }
}

function onRevelado(premio){
  // marcar intento del día
  if (premio.id !== "RETRY") {
    localStorage.setItem(K_ULTIMO, HOY);
  }
  // feedback
  if (sonidoGanador){
    sonidoGanador.currentTime = 0;
    sonidoGanador.volume = 0.9;
    sonidoGanador.play().catch(()=>{});
  }
  // popup premio
  mostrarPopupPremio(premio.nombre, premio.detalle);

  // si querés permitir "RETRY", podés rearmar la máscara acá y no setear el lock
  // if (premio.id === "RETRY") { ... }
}
