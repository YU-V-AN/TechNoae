import { translations, t, applyTranslations } from "./translations.js";

// =========================================================
// 1. STATE VARIABLES & CONFIGURATION
// 3-Tier System: Home Resident -> Scrap Shop -> Industrial Recycler
// =========================================================
let activeTab = "home";          // "home" | "shop" | "recycler"
let shopActiveSubtab = "homePickups"; // "homePickups" | "stock"
let currentFilter = "all";
let currentLang = "en";
let residentUid = null;
let allRequests = [];

let unsubAll = null;

// Default Coordinates (Chennai Central Scrap Hub)
const DEFAULT_HOME_LAT = 13.0827;
const DEFAULT_HOME_LNG = 80.2707;

const DEFAULT_SHOP_LAT = 13.0850;
const DEFAULT_SHOP_LNG = 80.2760;

const DEFAULT_RECYCLER_LAT = 13.0450;
const DEFAULT_RECYCLER_LNG = 80.2100;

// 5-Stage Lifecycle for the 3-Tier supply chain
const STATUS_STEPS = [
  "Requested",          // 1. Home resident requested pickup
  "Shop Accepted",      // 2. Scrap Shop agreed to visit home
  "In Shop",            // 3. Collected and resting in Scrap Shop
  "Recycler Assigned",  // 4. Recycler truck dispatched to Scrap Shop
  "Completed"           // 5. 100% Recycled at industrial plant
];

const CATEGORY_I18N_KEY = {
  "Printed Circuit Boards (PCBs)": "cat.pcb",
  "Copper Cables & Wires": "cat.copper",
  "Batteries (Li-ion/Lead Acid)": "cat.battery",
  "Display Screens / CRTs": "cat.display",
  "Mixed Electronic Scrap": "cat.mixed"
};

// =========================================================
// 1A. THEME SWITCHER (BRIGHT & DARK MODE)
// =========================================================
export function initTheme() {
  const savedTheme = localStorage.getItem("technova_theme") || "light";
  applyTheme(savedTheme);
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
    });
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("technova_theme", theme);
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === "dark" ? "Mode: Dark" : "Mode: Bright";
  }
}

// =========================================================
// 1B. SMS NOTIFICATION BANNER & ON-DEMAND OTP SENDER
// =========================================================
export function showSmsBanner(phone, otp) {
  const banner = document.getElementById("smsAlertBanner");
  if (!banner) return;
  banner.innerHTML = `
    <div class="sms-banner-content">
      <span class="sms-banner-badge">Incoming SMS</span>
      <span class="sms-banner-text">Alert to <strong>+91 ${phone}</strong>: Your doorstep scrap pickup verification OTP is <span class="sms-banner-code">${otp}</span>. Share this code with the scrap shop collector upon arrival.</span>
    </div>
    <button type="button" class="sms-banner-close" aria-label="Dismiss">&times;</button>
  `;
  banner.style.display = "flex";
  const closeBtn = banner.querySelector(".sms-banner-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      banner.style.display = "none";
    });
  }
}

export async function sendOtpToResident(id, phone) {
  try {
    const res = await fetch(`/api/requests/${id}/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "household" })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const item = allRequests.find(r => r.id === id);
      if (item) {
        item.householdOtp = data.otp;
        item.householdOtpVerified = false;
      }
      const targetPhone = phone || data.phone || "Resident";
      // Populate the SMS banner strictly inside the Resident page (#homeDashboardPanel)
      showSmsBanner(targetPhone, data.otp);
      renderAllViews();

      // Open the verification input modal for the Scrap Shop without showing the OTP code here
      openOtpModal(id, "household");
      if (otpSuccessMsg) {
        otpSuccessMsg.textContent = `OTP sent to Resident (+91 ${targetPhone}). Check the Resident page for the 4-digit code.`;
        otpSuccessMsg.style.display = "block";
      }
    } else {
      alert(data.error || "Failed to send OTP to resident.");
    }
  } catch (err) {
    console.error("Error sending OTP to resident:", err);
    alert("Could not connect to server to send OTP.");
  }
}

// =========================================================
// 1C. AUTHENTICATION & MULTI-PORTAL ACCESS SESSIONS
// =========================================================
export function getResidentSession() {
  try {
    const raw = localStorage.getItem("technova_auth_resident");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function getShopSession() {
  try {
    const raw = localStorage.getItem("technova_auth_shop");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function getRecyclerSession() {
  try {
    const raw = localStorage.getItem("technova_auth_recycler");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function setResidentSession(session) {
  if (session) {
    localStorage.setItem("technova_auth_resident", JSON.stringify(session));
    if (session.id) localStorage.setItem("technova_resident_id", session.id);
    if (session.phone) localStorage.setItem("technova_resident_phone", session.phone);
    residentUid = session.id;
    const nameEl = document.getElementById("residentName");
    const phoneEl = document.getElementById("residentPhone");
    if (nameEl) nameEl.value = session.name || "";
    if (phoneEl) phoneEl.value = session.phone || "";
  } else {
    localStorage.removeItem("technova_auth_resident");
  }
}

export function setShopSession(session) {
  if (session) {
    localStorage.setItem("technova_auth_shop", JSON.stringify(session));
    const nameInput = document.getElementById("shopNameInput");
    const phoneInput = document.getElementById("shopPhoneInput");
    if (nameInput) nameInput.value = session.name || "";
    if (phoneInput) phoneInput.value = session.phone || "";
  } else {
    localStorage.removeItem("technova_auth_shop");
  }
}

export function setRecyclerSession(session) {
  if (session) {
    localStorage.setItem("technova_auth_recycler", JSON.stringify(session));
  } else {
    localStorage.removeItem("technova_auth_recycler");
  }
}

// =========================================================
// 2. HELPER FUNCTIONS
// =========================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return "0.5";
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
}

function categoryLabel(type) {
  const key = CATEGORY_I18N_KEY[type];
  return key ? t(currentLang, key) : type;
}

function debounce(fn, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function extractAreaLabel(nominatimResult) {
  const addr = nominatimResult.address || {};
  const locality = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || "";
  const city = addr.city || addr.town || addr.county || "";
  const label = [locality, city].filter(Boolean).join(", ");
  if (label) return label;
  return (nominatimResult.display_name || "").split(",").slice(0, 2).join(",").trim() || "Chennai Central";
}

async function reverseGeocodeArea(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return extractAreaLabel(data);
  } catch (err) {
    return "Chennai Central";
  }
}

function statusToKey(status) {
  switch (status) {
    case "Requested": return "status.requested";
    case "Shop Accepted": return "status.shop_accepted";
    case "In Shop": return "status.in_shop";
    case "Recycler Assigned": return "status.recycler_assigned";
    case "Completed": return "status.completed";
    default: return "status.requested";
  }
}

function statusToClass(status) {
  switch (status) {
    case "Requested": return "requested";
    case "Shop Accepted": return "shop_accepted";
    case "In Shop": return "in_shop";
    case "Recycler Assigned": return "recycler_assigned";
    case "Completed": return "completed";
    default: return "requested";
  }
}

function statusBadge(status) {
  return `<span class="badge ${statusToClass(status)}">${t(currentLang, statusToKey(status))}</span>`;
}

function buildProgressTrackHTML(status) {
  const idx = Math.max(STATUS_STEPS.indexOf(status), 0);
  const steps = STATUS_STEPS.map((s, i) => {
    const cls = i < idx ? "is-done" : (i === idx ? "is-current" : "");
    return `<span class="progress-step ${cls}"></span>`;
  }).join("");

  const labels = STATUS_STEPS.map((s, i) => {
    const isCur = i === idx ? ' style="font-weight:700; color:var(--color-copper);"' : "";
    return `<span${isCur}>${t(currentLang, statusToKey(s))}</span>`;
  }).join("");

  const trackLabel = `${t(currentLang, "home.trackTitle")}: ${t(currentLang, statusToKey(status))}`;
  return `<div class="progress-track" role="img" aria-label="${trackLabel}">${steps}</div><div class="progress-labels">${labels}</div>`;
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const statCache = {};
function animateStat(id, targetValue, decimals = 0, prefix = "", suffix = "") {
  const el = document.getElementById(id);
  if (!el) return;
  const start = statCache[id] ?? 0;
  statCache[id] = targetValue;

  if (prefersReducedMotion) {
    el.textContent = prefix + targetValue.toFixed(decimals) + suffix;
    return;
  }

  const duration = 400;
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = start + (targetValue - start) * progress;
    el.textContent = prefix + value.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = prefix + targetValue.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(tick);
}

// =========================================================
// 3. INTERACTIVE MATERIAL CAROUSEL (1 Card Full-Width & Auto-Swipe)
// =========================================================
const eWasteTypeInput = document.getElementById("eWasteType");
const materialCards = document.querySelectorAll(".material-swipe-card");
const materialTrack = document.getElementById("materialTrack");
const carouselWrapper = document.querySelector(".material-carousel-wrapper");
const carouselPrevBtn = document.getElementById("carouselPrevBtn");
const carouselNextBtn = document.getElementById("carouselNextBtn");
const carouselDots = document.querySelectorAll(".carousel-dot");
const carouselCounter = document.getElementById("carouselCounter");

let currentCardIndex = 0;
const AUTO_SWIPE_INTERVAL = 3500;
let autoSwipeTimer = null;
let userInteractionResumeTimer = null;
let isUserInteracting = false;

function selectCardByIndex(index, smoothScroll = true) {
  if (index < 0 || index >= materialCards.length) return;
  currentCardIndex = index;

  materialCards.forEach((c, i) => {
    const isSelected = i === index;
    c.classList.toggle("active", isSelected);
    c.setAttribute("aria-checked", isSelected ? "true" : "false");
  });

  carouselDots.forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });

  const activeCard = materialCards[index];
  if (activeCard && eWasteTypeInput) {
    const selectedCategory = activeCard.getAttribute("data-category");
    eWasteTypeInput.value = selectedCategory;
  }

  if (carouselCounter) {
    carouselCounter.textContent = `${index + 1} / ${materialCards.length}`;
  }

  if (activeCard && materialTrack) {
    const targetScroll = activeCard.offsetLeft;
    materialTrack.scrollTo({
      left: targetScroll,
      behavior: smoothScroll ? "smooth" : "auto"
    });
  }
}

function startAutoSwipe() {
  stopAutoSwipe();
  if (activeTab !== "home" || !materialCards || !materialCards.length) return;

  autoSwipeTimer = setInterval(() => {
    if (isUserInteracting || document.hidden || activeTab !== "home") return;
    const nextIdx = (currentCardIndex + 1) % materialCards.length;
    selectCardByIndex(nextIdx, true);
  }, AUTO_SWIPE_INTERVAL);
}

function stopAutoSwipe() {
  if (autoSwipeTimer) {
    clearInterval(autoSwipeTimer);
    autoSwipeTimer = null;
  }
}

function pauseAutoSwipeTemporarily(resumeDelay = 4500) {
  isUserInteracting = true;
  stopAutoSwipe();
  if (userInteractionResumeTimer) {
    clearTimeout(userInteractionResumeTimer);
  }
  userInteractionResumeTimer = setTimeout(() => {
    isUserInteracting = false;
    startAutoSwipe();
  }, resumeDelay);
}

// Bind carousel controls
materialCards.forEach((card, idx) => {
  card.addEventListener("click", () => {
    selectCardByIndex(idx, true);
    pauseAutoSwipeTemporarily(6000);
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectCardByIndex(idx, true);
      pauseAutoSwipeTemporarily(6000);
    }
  });
});

if (carouselPrevBtn) {
  carouselPrevBtn.addEventListener("click", () => {
    const nextIdx = (currentCardIndex - 1 + materialCards.length) % materialCards.length;
    selectCardByIndex(nextIdx, true);
    pauseAutoSwipeTemporarily(5000);
  });
}

if (carouselNextBtn) {
  carouselNextBtn.addEventListener("click", () => {
    const nextIdx = (currentCardIndex + 1) % materialCards.length;
    selectCardByIndex(nextIdx, true);
    pauseAutoSwipeTemporarily(5000);
  });
}

carouselDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const targetIdx = parseInt(dot.getAttribute("data-index"), 10);
    selectCardByIndex(targetIdx, true);
    pauseAutoSwipeTemporarily(5000);
  });
});

if (carouselWrapper) {
  carouselWrapper.addEventListener("mouseenter", () => {
    isUserInteracting = true;
    stopAutoSwipe();
  });
  carouselWrapper.addEventListener("mouseleave", () => {
    isUserInteracting = false;
    startAutoSwipe();
  });
}

if (materialTrack) {
  materialTrack.addEventListener("touchstart", () => {
    isUserInteracting = true;
    stopAutoSwipe();
  }, { passive: true });

  materialTrack.addEventListener("touchend", () => {
    pauseAutoSwipeTemporarily(4000);
  }, { passive: true });

  let scrollSyncTimer = null;
  materialTrack.addEventListener("scroll", () => {
    clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(() => {
      const trackWidth = materialTrack.clientWidth;
      if (!trackWidth || materialCards.length === 0) return;
      const scrollPos = materialTrack.scrollLeft;
      const targetIdx = Math.max(0, Math.min(materialCards.length - 1, Math.round(scrollPos / trackWidth)));
      if (targetIdx !== currentCardIndex) {
        selectCardByIndex(targetIdx, false);
      }
    }, 60);
  });
}

const pickupFormEl = document.getElementById("pickupForm");
if (pickupFormEl) {
  pickupFormEl.addEventListener("focusin", (e) => {
    if (!e.target.closest(".material-carousel-wrapper") && !e.target.closest(".carousel-indicators-bar")) {
      pauseAutoSwipeTemporarily(12000);
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAutoSwipe();
  else if (activeTab === "home") startAutoSwipe();
});

// =========================================================
// 4. MAPS & GEOCODING (3 Maps: Home, Scrap Shop, Recycler)
// =========================================================
let selectedHomeLat = DEFAULT_HOME_LAT;
let selectedHomeLng = DEFAULT_HOME_LNG;
let selectedHomeAreaLabel = "Chennai Central";

// Home Map
const homeMap = L.map("homeMap").setView([selectedHomeLat, selectedHomeLng], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(homeMap);
let homePin = L.marker([selectedHomeLat, selectedHomeLng], { draggable: true }).addTo(homeMap);

function renderHomeLocationStatus() {
  const label = selectedHomeAreaLabel ? ` (${selectedHomeAreaLabel})` : "";
  const el = document.getElementById("homeLocationStatus");
  if (el) {
    el.innerHTML = `${t(currentLang, "home.pinnedLabel")}: <strong>${selectedHomeLat.toFixed(4)}, ${selectedHomeLng.toFixed(4)}</strong>${label}`;
  }
}

homeMap.on("click", (e) => {
  homePin.setLatLng(e.latlng);
  selectedHomeLat = e.latlng.lat;
  selectedHomeLng = e.latlng.lng;
  renderHomeLocationStatus();
  debouncedReverseGeocodeHome(e.latlng.lat, e.latlng.lng);
});

homePin.on("dragend", (e) => {
  const pos = e.target.getLatLng();
  selectedHomeLat = pos.lat;
  selectedHomeLng = pos.lng;
  renderHomeLocationStatus();
  debouncedReverseGeocodeHome(pos.lat, pos.lng);
});

const debouncedReverseGeocodeHome = debounce(async (lat, lng) => {
  selectedHomeAreaLabel = await reverseGeocodeArea(lat, lng);
  renderHomeLocationStatus();
}, 700);

const homeSearchInput = document.getElementById("homeSearchInput");
const homeSearchBtn = document.getElementById("homeSearchBtn");
if (homeSearchBtn) {
  homeSearchBtn.addEventListener("click", async () => {
    const q = homeSearchInput.value.trim();
    if (!q) return;
    homeSearchBtn.textContent = t(currentLang, "home.searching");
    homeSearchBtn.disabled = true;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}`);
      const results = await res.json();
      if (results && results.length > 0) {
        const item = results[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        homeMap.setView([lat, lon], 15);
        homePin.setLatLng([lat, lon]);
        selectedHomeLat = lat;
        selectedHomeLng = lon;
        selectedHomeAreaLabel = extractAreaLabel(item);
        renderHomeLocationStatus();
      } else {
        alert("Location not found. Please try a nearby street or pincode.");
      }
    } catch (_) {
      alert("Could not fetch location. Check your internet connection.");
    } finally {
      homeSearchBtn.textContent = t(currentLang, "home.searchBtn");
      homeSearchBtn.disabled = false;
    }
  });
}

// Shop Map (Scrap Shop)
const shopMap = L.map("shopMap").setView([DEFAULT_SHOP_LAT, DEFAULT_SHOP_LNG], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(shopMap);
let shopPin = L.marker([DEFAULT_SHOP_LAT, DEFAULT_SHOP_LNG], {
  title: "Scrap Shop",
  icon: L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })
}).addTo(shopMap).bindPopup("<b>Sri Murugan Scrap Shop</b><br>Scrap Collection Shop");

let shopResidentPinsGroup = L.layerGroup().addTo(shopMap);

// Recycler Map (Industrial Facility)
const recyclerMap = L.map("recyclerMap").setView([DEFAULT_RECYCLER_LAT, DEFAULT_RECYCLER_LNG], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(recyclerMap);
L.marker([DEFAULT_RECYCLER_LAT, DEFAULT_RECYCLER_LNG], {
  title: "Central Recycling Plant",
  icon: L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })
}).addTo(recyclerMap).bindPopup("<b>Central Industrial Processing Facility</b>");

let recyclerShopPinsGroup = L.layerGroup().addTo(recyclerMap);

// =========================================================
// 5. PHOTO CAPTURE & UPLOAD (Phone Camera, File & Webcam)
// =========================================================
const cameraInput = document.getElementById("cameraInput");
const imageInput = document.getElementById("imageInput");
const triggerCameraBtn = document.getElementById("triggerCameraBtn");
const triggerFileBtn = document.getElementById("triggerFileBtn");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const clearPhotoBtn = document.getElementById("clearPhotoBtn");

// Webcam Modal (Desktop Viewfinder)
const webcamModal = document.getElementById("webcamModal");
const closeWebcamModalBtn = document.getElementById("closeWebcamModalBtn");
const cancelWebcamBtn = document.getElementById("cancelWebcamBtn");
const captureWebcamBtn = document.getElementById("captureWebcamBtn");
const webcamVideo = document.getElementById("webcamVideo");
const webcamCanvas = document.getElementById("webcamCanvas");

let currentSelectedFile = null;
let currentSelectedDataUrl = null;
let webcamMediaStream = null;

function stopWebcam() {
  if (webcamMediaStream) {
    webcamMediaStream.getTracks().forEach(t => t.stop());
    webcamMediaStream = null;
  }
  if (webcamVideo) webcamVideo.srcObject = null;
  if (webcamModal) webcamModal.style.display = "none";
}

// 1. Phone Camera Trigger (Direct Native Camera on Mobile, Webcam on Desktop)
if (triggerCameraBtn) {
  triggerCameraBtn.addEventListener("click", async () => {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);

    if (isMobile || !navigator.mediaDevices?.getUserMedia) {
      // Mobile: Native device camera input (capture="environment")
      if (cameraInput) cameraInput.click();
    } else {
      // Desktop: Open live webcam viewfinder modal
      try {
        webcamMediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        webcamVideo.srcObject = webcamMediaStream;
        webcamModal.style.display = "flex";
      } catch (camErr) {
        console.warn("Could not start live webcam, falling back to camera input:", camErr);
        if (cameraInput) cameraInput.click();
      }
    }
  });
}

// 2. File Chooser Trigger
if (triggerFileBtn && imageInput) {
  triggerFileBtn.addEventListener("click", () => imageInput.click());
}

// 3. Desktop Webcam Snap Photo Action
if (captureWebcamBtn) {
  captureWebcamBtn.addEventListener("click", () => {
    if (!webcamVideo || !webcamCanvas) return;
    const w = webcamVideo.videoWidth || 640;
    const h = webcamVideo.videoHeight || 480;
    webcamCanvas.width = w;
    webcamCanvas.height = h;
    const ctx = webcamCanvas.getContext("2d");
    ctx.drawImage(webcamVideo, 0, 0, w, h);
    const snapDataUrl = webcamCanvas.toDataURL("image/jpeg", 0.85);

    currentSelectedDataUrl = snapDataUrl;
    currentSelectedFile = null;
    imagePreview.src = snapDataUrl;
    imagePreviewContainer.style.display = "block";
    stopWebcam();
  });
}

if (closeWebcamModalBtn) closeWebcamModalBtn.addEventListener("click", stopWebcam);
if (cancelWebcamBtn) cancelWebcamBtn.addEventListener("click", stopWebcam);

// Handle file chosen from Camera or File input
function handlePhotoFile(file) {
  if (!file) return;
  currentSelectedFile = file;
  currentSelectedDataUrl = null;
  const reader = new FileReader();
  reader.onload = () => {
    imagePreview.src = reader.result;
    imagePreviewContainer.style.display = "block";
  };
  reader.readAsDataURL(file);
}

if (cameraInput) {
  cameraInput.addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));
}
if (imageInput) {
  imageInput.addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));
}

if (clearPhotoBtn) {
  clearPhotoBtn.addEventListener("click", () => {
    currentSelectedFile = null;
    currentSelectedDataUrl = null;
    if (cameraInput) cameraInput.value = "";
    if (imageInput) imageInput.value = "";
    imagePreview.src = "";
    imagePreviewContainer.style.display = "none";
  });
}

function compressImageToDataUrl(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl || dataUrl.indexOf("data:image/webp") !== 0) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1] || "image/jpeg";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function uploadImage(fileOrDataUrl) {
  try {
    const formData = new FormData();
    if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
      const blob = dataUrlToBlob(fileOrDataUrl);
      formData.append("photo", blob, `camera_${Date.now()}.jpg`);
    } else if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
      formData.append("photo", fileOrDataUrl);
    }
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch (err) {
    console.warn("Upload endpoint warning, falling back:", err);
  }

  if (typeof fileOrDataUrl === "string") return fileOrDataUrl;
  if (fileOrDataUrl instanceof File) {
    return await compressImageToDataUrl(fileOrDataUrl, 800, 0.75);
  }
  return "assets/pcb.jpg";
}

// =========================================================
// 6. TIER 1: HOME RESIDENT SUBMISSION & TRACKING
// =========================================================
async function ensureResidentAuth() {
  const session = getResidentSession();
  if (session && session.id) {
    residentUid = session.id;
    return residentUid;
  }
  let stored = localStorage.getItem("technova_resident_id");
  if (!stored) {
    stored = "resident_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    localStorage.setItem("technova_resident_id", stored);
  }
  residentUid = stored;
  return residentUid;
}

const pickupForm = document.getElementById("pickupForm");
const submitBtn = document.getElementById("submitBtn");

pickupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const residentName = document.getElementById("residentName").value.trim();
  const rawPhone = document.getElementById("residentPhone").value.trim();
  const residentNotes = (document.getElementById("residentNotes")?.value || "").trim();

  // Extract clean 10-digit phone
  let residentPhone = rawPhone.replace(/\D/g, "");
  if (residentPhone.length > 10) {
    residentPhone = residentPhone.slice(-10);
  }

  if (residentPhone.length !== 10) {
    alert("Please enter a valid 10-digit mobile number (e.g., 9876543210).");
    document.getElementById("residentPhone").focus();
    return;
  }

  localStorage.setItem("technova_resident_phone", residentPhone);

  const weightVal = parseFloat(document.getElementById("weight").value);
  if (isNaN(weightVal) || weightVal <= 0) {
    alert("Please enter a valid weight in kg (e.g., 5 or 12.5).");
    document.getElementById("weight").focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = t(currentLang, "home.saving");

  try {
    const uid = await ensureResidentAuth();
    const type = document.getElementById("eWasteType").value;
    
    let imageUrl = "assets/pcb.jpg";
    if (currentSelectedFile) {
      imageUrl = await uploadImage(currentSelectedFile);
    } else if (currentSelectedDataUrl) {
      imageUrl = await uploadImage(currentSelectedDataUrl);
    }

    const shopName = document.getElementById("shopNameInput")?.value.trim() || "Sri Murugan Scrap Shop";
    const shopPhone = document.getElementById("shopPhoneInput")?.value.trim() || "9840123456";

    const newRequest = {
      type,
      weight: weightVal,
      residentName,
      residentPhone,
      residentNotes,
      homeLat: selectedHomeLat,
      homeLng: selectedHomeLng,
      homeArea: selectedHomeAreaLabel || "Chennai Central",
      imageUrl,
      residentId: uid,
      shopName,
      shopPhone,
      shopLat: DEFAULT_SHOP_LAT,
      shopLng: DEFAULT_SHOP_LNG
    };

    // Save to Open-Source SQLite Database via REST API
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRequest)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.request) {
          allRequests.unshift(data.request);
          localStorage.setItem("technova_requests_cache", JSON.stringify(allRequests));
          renderAllViews();
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || ("HTTP " + res.status));
      }
    } catch (apiErr) {
      console.warn("API save error, using local fallback:", apiErr);
      newRequest.id = "local_" + Date.now();
      newRequest.status = "Requested";
      newRequest.createdAt = Date.now();
      newRequest.updatedAt = Date.now();
      newRequest.timestamp = new Date().toISOString();
      allRequests.unshift(newRequest);
      localStorage.setItem("technova_requests_cache", JSON.stringify(allRequests));
      renderAllViews();
    }

    pickupForm.reset();
    currentSelectedFile = null;
    currentSelectedDataUrl = null;
    if (cameraInput) cameraInput.value = "";
    if (imageInput) imageInput.value = "";
    imagePreview.src = "";
    imagePreviewContainer.style.display = "none";
    selectCardByIndex(0, true);

    alert("Home pickup request sent! Your nearby scrap shop has been notified.");
    
    // Smoothly scroll down to show the newly created request
    setTimeout(() => {
      document.getElementById("homeStatusList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  } catch (err) {
    alert("Error saving request: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t(currentLang, "home.submitBtn");
  }
});

function renderHomeLots(requests) {
  const container = document.getElementById("homeStatusList");
  if (!container) return;

  const storedPhone = localStorage.getItem("technova_resident_phone");
  const myLots = requests.filter(r => {
    // Show lot if submitted by current resident ID, current phone, or if no filter exists yet
    if (!residentUid && !storedPhone) return true;
    if (residentUid && r.residentId === residentUid) return true;
    if (storedPhone && r.residentPhone === storedPhone) return true;
    return true; // Keep visible on resident's home device
  });

  const completedCount = myLots.filter(r => r.status === "Completed").length;
  const handedOverWeight = myLots
    .filter(r => r.status !== "Requested")
    .reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  animateStat("statRequests", myLots.length);
  animateStat("statWeight", handedOverWeight, 1);
  animateStat("statCompleted", completedCount);

  if (myLots.length === 0) {
    container.innerHTML = `<p class="loading">${t(currentLang, "home.noLots")}</p>`;
    return;
  }

  container.innerHTML = myLots.map(item => {
    let otpBadgeHtml = "";
    if (item.status === "Shop Accepted") {
      if (item.householdOtp) {
        otpBadgeHtml = `
          <div class="otp-display-box household-otp-box">
            <div class="otp-badge-title">
              <strong>${t(currentLang, "home.householdOtpBadge")}</strong> (Sent to +91 ${item.residentPhone})
            </div>
            <div class="otp-big-digits">${item.householdOtp}</div>
            <p class="otp-explain">${t(currentLang, "home.householdOtpHint")}</p>
          </div>
        `;
      } else {
        otpBadgeHtml = `
          <div class="collector-notes" style="margin-top: 10px; font-weight: 500;">
            Pickup Accepted. Scrap shop collector is on the way. An OTP will be sent to your mobile number (+91 ${item.residentPhone}) upon arrival.
          </div>
        `;
      }
    } else if (item.householdOtpVerified) {
      otpBadgeHtml = `
        <div class="otp-verified-tag">
          <span>Handover OTP Verified with Scrap Shop</span>
        </div>
      `;
    }

    return `
      <div class="item-card">
        <img src="${item.imageUrl}" class="thumb-img" alt="Scrap" onerror="this.src='assets/pcb.jpg'" />
        <div class="item-info">
          <h4>${categoryLabel(item.type)} (${item.weight} kg)</h4>
          ${buildProgressTrackHTML(item.status)}
          <p><strong>${t(currentLang, "home.statusLine")}:</strong> ${statusBadge(item.status)}</p>
          <p><strong>Scrap Shop:</strong> ${item.shopName || "Sri Murugan Scrap Shop"}</p>
          ${item.residentNotes ? `<p class="collector-notes">${item.residentNotes}</p>` : ""}
          ${otpBadgeHtml}
          <div class="action-box" style="margin-top: 10px; display: flex; justify-content: flex-end;">
            <button type="button" class="btn secondary-btn btn-delete-request" data-id="${item.id}" style="font-size: 0.8rem; padding: 4px 10px; color: #ff5252; border-color: rgba(255, 82, 82, 0.4);">
              Delete Request
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-delete-request").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this scrap pickup request?")) {
        await deleteRequest(id);
      }
    });
  });
}

// =========================================================
// 7. TIER 2: SCRAP SHOP DASHBOARD
// =========================================================
const shopSubtabHomeBtn = document.getElementById("shopSubtabHomeBtn");
const shopSubtabStockBtn = document.getElementById("shopSubtabStockBtn");
const shopHomePickupsPanel = document.getElementById("shopHomePickupsPanel");
const shopStockPanel = document.getElementById("shopStockPanel");

if (shopSubtabHomeBtn && shopSubtabStockBtn) {
  shopSubtabHomeBtn.addEventListener("click", () => {
    shopActiveSubtab = "homePickups";
    shopSubtabHomeBtn.classList.add("active");
    shopSubtabStockBtn.classList.remove("active");
    shopHomePickupsPanel.style.display = "block";
    shopStockPanel.style.display = "none";
    setTimeout(() => shopMap.invalidateSize(), 150);
  });

  shopSubtabStockBtn.addEventListener("click", () => {
    shopActiveSubtab = "stock";
    shopSubtabStockBtn.classList.add("active");
    shopSubtabHomeBtn.classList.remove("active");
    shopHomePickupsPanel.style.display = "none";
    shopStockPanel.style.display = "block";
  });
}

// Action button for shopkeeper: Bulk recycler pickup request
const requestRecyclerBulkBtn = document.getElementById("requestRecyclerBulkBtn");
if (requestRecyclerBulkBtn) {
  requestRecyclerBulkBtn.addEventListener("click", async () => {
    const inShopLots = allRequests.filter(r => r.status === "In Shop");
    if (inShopLots.length === 0) {
      alert("No aggregated stock in scrap shop ready for dispatch right now.");
      return;
    }

    for (const lot of inShopLots) {
      await advanceStatus(lot.id, "Recycler Assigned");
    }

    alert(t(currentLang, "shop.dispatchSuccess"));
  });
}

function renderShopUI(requests) {
  const shopName = document.getElementById("shopNameInput")?.value.trim() || "Sri Murugan Scrap Shop";
  const shopPhone = document.getElementById("shopPhoneInput")?.value.trim() || "9840123456";

  // 1. Nearby Home Pickups (Requested or Shop Accepted)
  const homePickups = requests.filter(r => r.status === "Requested" || r.status === "Shop Accepted");
  // 2. In-Shop Stock (In Shop or Recycler Assigned)
  const shopStock = requests.filter(r => r.status === "In Shop" || r.status === "Recycler Assigned");

  const totalStockKg = shopStock.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const totalStockEl = document.getElementById("shopTotalStock");
  const readyLotsEl = document.getElementById("shopReadyLots");
  if (totalStockEl) totalStockEl.textContent = `${totalStockKg.toFixed(1)} kg`;
  if (readyLotsEl) readyLotsEl.textContent = shopStock.length;

  const homeCountEl = document.getElementById("nearbyHomeCount");
  const inShopCountEl = document.getElementById("inShopCount");
  if (homeCountEl) homeCountEl.textContent = homePickups.length;
  if (inShopCountEl) inShopCountEl.textContent = shopStock.length;

  // Render Shop Map Pins for Home Pickups
    shopResidentPinsGroup.clearLayers();
  homePickups.forEach(item => {
    if (item.homeLat && item.homeLng) {
      const dist = calculateDistance(DEFAULT_SHOP_LAT, DEFAULT_SHOP_LNG, item.homeLat, item.homeLng);
      const marker = L.marker([item.homeLat, item.homeLng]).bindPopup(`
        <b>${item.residentName || "Resident"}</b><br>
        ${categoryLabel(item.type)} (${item.weight} kg)<br>
        ${dist} km away<br>
        Phone: +91 ${item.residentPhone}
      `);
      shopResidentPinsGroup.addLayer(marker);
    }
  });

  // Render Panel 1: Nearby Home Pickups List
  const homeListEl = document.getElementById("shopHomeRequestsList");
  if (homeListEl) {
    if (homePickups.length === 0) {
      homeListEl.innerHTML = `<p class="loading">${t(currentLang, "shop.emptyHomeRequests")}</p>`;
    } else {
      homeListEl.innerHTML = homePickups.map(item => {
        const dist = calculateDistance(DEFAULT_SHOP_LAT, DEFAULT_SHOP_LNG, item.homeLat, item.homeLng);
        const residentName = item.residentName || t(currentLang, "shop.anonymousResident");
        const phone = item.residentPhone || "";
        const waMsg = encodeURIComponent(`Vanakkam ${residentName}, this is ${shopName}. We received your scrap pickup request for ${categoryLabel(item.type)} (${item.weight} kg). When can we visit?`);

        let actionBtn = "";
        if (item.status === "Requested") {
          actionBtn = `
            <button class="btn primary-btn btn-action-collect" data-id="${item.id}" data-action="Shop Accepted">${t(currentLang, "shop.acceptHomeBtn")}</button>
            <button type="button" class="btn secondary-btn btn-delete-request" data-id="${item.id}" style="font-size: 0.8rem; padding: 6px 12px; margin-left: 8px; color: #ff5252; border-color: rgba(255, 82, 82, 0.4);">Delete</button>
          `;
        } else if (item.status === "Shop Accepted") {
          if (!item.householdOtp) {
            actionBtn = `<button class="btn primary-btn btn-send-otp" data-id="${item.id}" data-phone="${phone}">Send OTP to Resident (+91 ${phone})</button>`;
          } else {
            actionBtn = `
              <div class="collector-notes" style="margin-bottom: 8px; width: 100%; font-weight: 500;">
                OTP sent to Resident (+91 ${phone}). Check the Resident page for the 4-digit code to verify pickup.
              </div>
              <button class="btn complete-btn btn-trigger-otp" data-id="${item.id}" data-tier="household">${t(currentLang, "shop.verifyOtpBtn")}</button>
              <button class="btn secondary-btn btn-resend-otp" data-id="${item.id}" data-phone="${phone}">Resend OTP</button>
            `;
          }
        }

        return `
          <div class="item-card">
            <img src="${item.imageUrl}" class="thumb-img" alt="Scrap" onerror="this.src='assets/pcb.jpg'" />
            <div class="item-info">
              <h4>${categoryLabel(item.type)} (${item.weight} kg)</h4>
              ${buildProgressTrackHTML(item.status)}
              <p class="distance-tag"><strong>${dist} km</strong> ${t(currentLang, "recycler.distance")}</p>

              <div class="collector-contact-box">
                <div class="collector-name-tag">
                  <strong>${residentName}</strong>
                  ${item.homeArea ? `<span class="area-badge">${item.homeArea}</span>` : ""}
                </div>
                ${phone ? `
                  <div class="collector-phone-actions">
                    <span class="phone-number-badge">+91 ${phone}</span>
                    <div class="contact-btns-row">
                      <a href="tel:+91${phone}" class="btn-contact btn-call">${t(currentLang, "shop.callResident")}</a>
                      <a href="https://wa.me/91${phone}?text=${waMsg}" target="_blank" class="btn-contact btn-wa">${t(currentLang, "shop.waResident")}</a>
                    </div>
                  </div>
                ` : ""}
                ${item.residentNotes ? `<p class="collector-notes">${item.residentNotes}</p>` : ""}
              </div>

              <div class="action-box">${actionBtn}</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // Render Panel 2: Shop Stock & Recycler Dispatch List
  const stockListEl = document.getElementById("shopStockList");
  if (stockListEl) {
    if (shopStock.length === 0) {
      stockListEl.innerHTML = `<p class="loading">No scrap items currently resting in the Scrap Shop.</p>`;
    } else {
      stockListEl.innerHTML = shopStock.map(item => {
        let dispatchStatusText = "";
        if (item.status === "In Shop") {
          dispatchStatusText = `<span class="badge in_shop">${t(currentLang, "shop.inShopBadge")}</span>`;
        } else if (item.status === "Recycler Assigned") {
          dispatchStatusText = `<span class="badge recycler_assigned">${t(currentLang, "status.recycler_assigned")}</span>`;
        }

        return `
          <div class="item-card">
            <img src="${item.imageUrl}" class="thumb-img" alt="Scrap" onerror="this.src='assets/pcb.jpg'" />
            <div class="item-info">
              <h4>${categoryLabel(item.type)} (${item.weight} kg)</h4>
              ${buildProgressTrackHTML(item.status)}
              <div style="margin: 6px 0;">${dispatchStatusText}</div>
              <p><strong>Resident:</strong> ${item.residentName} (+91 ${item.residentPhone})</p>
              ${item.residentNotes ? `<p class="collector-notes">Origin: ${item.residentNotes}</p>` : ""}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // Bind shop actions
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const targetStatus = e.currentTarget.getAttribute("data-action");
      advanceStatus(id, targetStatus);
    });
  });

  // Bind Send & Resend OTP buttons in Shop UI
  document.querySelectorAll(".btn-send-otp").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const phone = e.currentTarget.getAttribute("data-phone");
      sendOtpToResident(id, phone);
    });
  });

  document.querySelectorAll(".btn-resend-otp").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const phone = e.currentTarget.getAttribute("data-phone");
      sendOtpToResident(id, phone);
    });
  });

  // Bind OTP trigger buttons in Shop UI
  document.querySelectorAll(".btn-trigger-otp").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const tier = e.currentTarget.getAttribute("data-tier");
      openOtpModal(id, tier);
    });
  });

  // Bind Delete buttons in Shop UI
  document.querySelectorAll("#shopHomeRequestsList .btn-delete-request").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this scrap request?")) {
        await deleteRequest(id);
      }
    });
  });
}

// =========================================================
// 8. TIER 3: INDUSTRIAL RECYCLER DASHBOARD
// =========================================================
function renderRecyclerUI(requests) {
  const container = document.getElementById("recyclerMatchingList");
  if (!container) return;

  // Filter lots according to currentFilter
  let lots = requests.filter(r => r.status === "In Shop" || r.status === "Recycler Assigned" || r.status === "Completed");

  if (currentFilter !== "all") {
    lots = lots.filter(r => r.status === currentFilter);
  }

  // Update Recycler Map with Scrap Shop pins
    recyclerShopPinsGroup.clearLayers();
  lots.forEach(item => {
    const lat = item.shopLat || DEFAULT_SHOP_LAT;
    const lng = item.shopLng || DEFAULT_SHOP_LNG;
    const dist = calculateDistance(DEFAULT_RECYCLER_LAT, DEFAULT_RECYCLER_LNG, lat, lng);
    const marker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).bindPopup(`
      <b>${item.shopName || "Scrap Shop"}</b><br>
      ${categoryLabel(item.type)} (${item.weight} kg)<br>
      ${dist} km from processing hub<br>
      Phone: +91 ${item.shopPhone || "9840123456"}
    `);
    recyclerShopPinsGroup.addLayer(marker);
  });

  if (lots.length === 0) {
    container.innerHTML = `<p class="loading">${t(currentLang, "recycler.noMatch")}</p>`;
    return;
  }

  container.innerHTML = lots.map(item => {
    const shopLat = item.shopLat || DEFAULT_SHOP_LAT;
    const shopLng = item.shopLng || DEFAULT_SHOP_LNG;
    const dist = calculateDistance(DEFAULT_RECYCLER_LAT, DEFAULT_RECYCLER_LNG, shopLat, shopLng);
    const shopName = item.shopName || t(currentLang, "recycler.anonymousShop");
    const shopPhone = item.shopPhone || "9840123456";

    let actionBtn = "";
    if (item.status === "In Shop") {
      actionBtn = `<button class="btn primary-btn btn-action-dispatch" data-id="${item.id}" data-action="Recycler Assigned">${t(currentLang, "recycler.acceptShopBtn")}</button>`;
    } else if (item.status === "Recycler Assigned") {
      actionBtn = `<button class="btn complete-btn btn-action-dispatch" data-id="${item.id}" data-action="Completed">Complete Industrial Recycling</button>`;
    } else if (item.status === "Completed") {
      actionBtn = `<span class="badge completed">${t(currentLang, "status.completed")}</span>`;
    }

    const waMsg = encodeURIComponent(`Vanakkam ${shopName}, this is Chennai Central Recycler Plant. We are dispatching a truck to your scrap shop for lot: ${categoryLabel(item.type)} (${item.weight} kg).`);

    return `
      <div class="item-card">
        <img src="${item.imageUrl}" class="thumb-img" alt="Scrap" onerror="this.src='assets/pcb.jpg'" />
        <div class="item-info">
          <h4>${categoryLabel(item.type)} (${item.weight} kg)</h4>
          ${buildProgressTrackHTML(item.status)}
          <p class="distance-tag"><strong>${dist} km</strong> from Plant</p>

          <div class="collector-contact-box" style="border-left-color: var(--color-copper);">
            <div class="collector-name-tag">
              <strong>${shopName}</strong>
              <span class="area-badge">Chennai Central Aggregator</span>
            </div>
            <div class="collector-phone-actions">
              <span class="phone-number-badge">+91 ${shopPhone}</span>
              <div class="contact-btns-row">
                <a href="tel:+91${shopPhone}" class="btn-contact btn-call">${t(currentLang, "recycler.callShop")}</a>
                <a href="https://wa.me/91${shopPhone}?text=${waMsg}" target="_blank" class="btn-contact btn-wa">${t(currentLang, "recycler.waShop")}</a>
              </div>
            </div>
          </div>

          <div class="action-box">${actionBtn}</div>
        </div>
      </div>
    `;
  }).join("");

  // Bind recycler actions
  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const targetStatus = e.currentTarget.getAttribute("data-action");
      advanceStatus(id, targetStatus);
    });
  });

  // Bind OTP trigger buttons in Recycler UI
  container.querySelectorAll(".btn-trigger-otp").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const tier = e.currentTarget.getAttribute("data-tier");
      openOtpModal(id, tier);
    });
  });

  renderLeaderboard(requests);
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    currentFilter = e.target.getAttribute("data-filter");
    renderRecyclerUI(allRequests);
  });
});

function renderLeaderboard(requests) {
  const el = document.getElementById("areaLeaderboard");
  if (!el) return;

  const areaMap = {};
  requests.forEach(r => {
    const area = r.homeArea || "Chennai Central";
    areaMap[area] = (areaMap[area] || 0) + (Number(r.weight) || 0);
  });

  const sorted = Object.entries(areaMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) {
    el.innerHTML = `<li class="loading">${t(currentLang, "recycler.leaderboardEmpty")}</li>`;
    return;
  }

  el.innerHTML = sorted.map(([area, wt], i) => `
    <li class="leaderboard-item">
      <span class="leaderboard-rank">#${i + 1}</span>
      <span class="leaderboard-name">${area}</span>
      <span class="leaderboard-figures"><strong>${wt.toFixed(1)} kg</strong></span>
    </li>
  `).join("");
}

// Lifecycle State Updater (3-Tier Supply Chain)
async function advanceStatus(id, newStatus) {
  // 1. Optimistic UI update
  const item = allRequests.find(r => r.id === id);
  if (item) {
    item.status = newStatus;
    if (newStatus === "Recycler Assigned" && !item.shopOtp) {
      item.shopOtp = Math.floor(1000 + Math.random() * 9000).toString();
      item.shopOtpVerified = false;
    }
    renderAllViews();
  }

  // 2. Persist to SQLite open-source database
  try {
    const res = await fetch(`/api/requests/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.request && item) {
        Object.assign(item, data.request);
        renderAllViews();
      }
    }
  } catch (err) {
    console.warn("Failed to persist status change to SQLite:", err);
  }
}

// Request Deletion Handler
async function deleteRequest(id) {
  // 1. Optimistic UI update
  allRequests = allRequests.filter(r => r.id !== id);

  // 2. Clean from localStorage cache
  try {
    const cached = JSON.parse(localStorage.getItem("technova_requests_cache") || "[]");
    const updated = cached.filter(r => r.id !== id);
    localStorage.setItem("technova_requests_cache", JSON.stringify(updated));
  } catch (_) {}

  renderAllViews();

  // 3. Delete from backend SQLite database
  try {
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      console.warn("Server responded with error when deleting request:", res.status);
    }
  } catch (err) {
    console.warn("Could not reach server to delete request:", err);
  }
}

// =========================================================
// OTP VERIFICATION MODAL HANDLER
// =========================================================
let currentOtpTarget = null; // { id, tier }

const otpModal = document.getElementById("otpModal");
const otpModalTitle = document.getElementById("otpModalTitle");
const otpModalSubtitle = document.getElementById("otpModalSubtitle");
const otpCodeInput = document.getElementById("otpCodeInput");
const otpErrorMsg = document.getElementById("otpErrorMsg");
const otpSuccessMsg = document.getElementById("otpSuccessMsg");
const modalResendOtpBtn = document.getElementById("modalResendOtpBtn");
const submitOtpBtn = document.getElementById("submitOtpBtn");
const cancelOtpBtn = document.getElementById("cancelOtpBtn");
const closeOtpModalBtn = document.getElementById("closeOtpModalBtn");

function openOtpModal(id, tier) {
  const item = allRequests.find(r => r.id === id);
  currentOtpTarget = { id, tier };

  if (tier === "household") {
    if (otpModalTitle) otpModalTitle.textContent = t(currentLang, "shop.otpModalTitle");
    if (otpModalSubtitle) {
      const residentName = item ? (item.residentName || "Resident") : "Resident";
      otpModalSubtitle.textContent = `${t(currentLang, "otp.householdSubtitle")} (${residentName})`;
    }
    if (modalResendOtpBtn) {
      const phone = item ? (item.residentPhone || "") : "";
      modalResendOtpBtn.textContent = phone ? `Send / Resend OTP to Resident (+91 ${phone})` : "Send / Resend OTP to Resident";
      modalResendOtpBtn.style.display = "inline-block";
      modalResendOtpBtn.onclick = async () => {
        try {
          modalResendOtpBtn.disabled = true;
          modalResendOtpBtn.textContent = "Sending OTP...";
          const res = await fetch(`/api/requests/${id}/otp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier: "household" })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (item) {
              item.householdOtp = data.otp;
              item.householdOtpVerified = false;
            }
            if (otpSuccessMsg) {
              otpSuccessMsg.textContent = `New OTP sent to Resident (+91 ${data.phone || phone}). Check the Resident page for the 4-digit code.`;
              otpSuccessMsg.style.display = "block";
            }
            showSmsBanner(data.phone || phone, data.otp);
            renderAllViews();
          } else {
            alert(data.error || "Failed to resend OTP.");
          }
        } catch (err) {
          console.error("Resend error:", err);
        } finally {
          modalResendOtpBtn.disabled = false;
          modalResendOtpBtn.textContent = phone ? `Send / Resend OTP to Resident (+91 ${phone})` : "Send / Resend OTP to Resident";
        }
      };
    }
  } else {
    if (otpModalTitle) otpModalTitle.textContent = t(currentLang, "recycler.otpModalTitle");
    if (otpModalSubtitle) {
      const shopName = item ? (item.shopName || "Scrap Shop") : "Scrap Shop";
      otpModalSubtitle.textContent = `${t(currentLang, "otp.shopSubtitle")} (${shopName})`;
    }
    if (modalResendOtpBtn) {
      modalResendOtpBtn.style.display = "none";
    }
  }

  if (otpCodeInput) {
    otpCodeInput.value = "";
    otpCodeInput.classList.remove("input-error");
  }
  if (otpErrorMsg) {
    otpErrorMsg.textContent = "";
    otpErrorMsg.style.display = "none";
  }
  if (otpSuccessMsg) {
    otpSuccessMsg.textContent = "";
    otpSuccessMsg.style.display = "none";
  }
  if (otpModal) otpModal.style.display = "flex";
  setTimeout(() => {
    if (otpCodeInput) otpCodeInput.focus();
  }, 100);
}

function closeOtpModal() {
  if (otpModal) otpModal.style.display = "none";
  currentOtpTarget = null;
}

if (closeOtpModalBtn) closeOtpModalBtn.addEventListener("click", closeOtpModal);
if (cancelOtpBtn) cancelOtpBtn.addEventListener("click", closeOtpModal);

if (submitOtpBtn) {
  submitOtpBtn.addEventListener("click", async () => {
    if (!currentOtpTarget) return;
    const code = otpCodeInput ? otpCodeInput.value.trim() : "";
    if (!code || code.length !== 4) {
      if (otpErrorMsg) {
        otpErrorMsg.textContent = "Please enter the complete 4-digit OTP code.";
        otpErrorMsg.style.display = "block";
      }
      if (otpCodeInput) otpCodeInput.focus();
      return;
    }

    submitOtpBtn.disabled = true;
    submitOtpBtn.textContent = "Verifying...";
    if (otpErrorMsg) otpErrorMsg.style.display = "none";

    try {
      const res = await fetch(`/api/requests/${currentOtpTarget.id}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: currentOtpTarget.tier, otp: code })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t(currentLang, "otp.invalid"));
      }

      // Update local item
      const item = allRequests.find(r => r.id === currentOtpTarget.id);
      if (item && data.request) {
        Object.assign(item, data.request);
      }
      closeOtpModal();
      renderAllViews();
      alert(data.message || t(currentLang, "otp.success"));
    } catch (err) {
      if (otpErrorMsg) {
        otpErrorMsg.textContent = err.message || t(currentLang, "otp.invalid");
        otpErrorMsg.style.display = "block";
      }
      if (otpCodeInput) {
        otpCodeInput.classList.add("input-error");
        otpCodeInput.focus();
      }
    } finally {
      submitOtpBtn.disabled = false;
      submitOtpBtn.textContent = t(currentLang, "otp.verifyConfirm");
    }
  });
}

// =========================================================
// 9. AUTHENTICATION GATES & VIEW ROUTER (3 Portals)
// =========================================================
const homeView = document.getElementById("homeView");
const shopView = document.getElementById("shopView");
const recyclerView = document.getElementById("recyclerView");

const homeAuthGate = document.getElementById("homeAuthGate");
const homeDashboardPanel = document.getElementById("homeDashboardPanel");
const shopAuthGate = document.getElementById("shopAuthGate");
const shopDashboardPanel = document.getElementById("shopDashboardPanel");
const recyclerAuthGate = document.getElementById("recyclerAuthGate");
const recyclerDashboardPanel = document.getElementById("recyclerDashboardPanel");

const navUserPill = document.getElementById("navUserPill");
const navUserAvatar = document.getElementById("navUserAvatar");
const navUserName = document.getElementById("navUserName");
const navUserRole = document.getElementById("navUserRole");
const navLogoutBtn = document.getElementById("navLogoutBtn");

const homeTabBtn = document.getElementById("homeTabBtn");
const shopTabBtn = document.getElementById("shopTabBtn");
const recyclerTabBtn = document.getElementById("recyclerTabBtn");

function updateNavbarSessionPill() {
  if (!navUserPill) return;

  if (activeTab === "home") {
    const session = getResidentSession();
    if (session) {
      navUserPill.style.display = "inline-flex";
      if (navUserAvatar) navUserAvatar.textContent = session.name ? session.name[0].toUpperCase() : "R";
      if (navUserName) navUserName.textContent = session.name || "Resident";
      if (navUserRole) navUserRole.textContent = "Home Resident";
    } else {
      navUserPill.style.display = "none";
    }
  } else if (activeTab === "shop") {
    const session = getShopSession();
    if (session) {
      navUserPill.style.display = "inline-flex";
      if (navUserAvatar) navUserAvatar.textContent = "S";
      if (navUserName) navUserName.textContent = session.name || "Scrap Shop";
      if (navUserRole) navUserRole.textContent = "Scrap Aggregator";
    } else {
      navUserPill.style.display = "none";
    }
  } else if (activeTab === "recycler") {
    const session = getRecyclerSession();
    if (session) {
      navUserPill.style.display = "inline-flex";
      if (navUserAvatar) navUserAvatar.textContent = "P";
      if (navUserName) navUserName.textContent = session.name || session.plantId || "Recycler Plant";
      if (navUserRole) navUserRole.textContent = "Certified Recycler";
    } else {
      navUserPill.style.display = "none";
    }
  }
}

function renderNavigation() {
  homeView.classList.remove("active-view");
  shopView.classList.remove("active-view");
  recyclerView.classList.remove("active-view");

  homeTabBtn.classList.remove("active");
  shopTabBtn.classList.remove("active");
  recyclerTabBtn.classList.remove("active");

  if (activeTab === "home") {
    homeView.classList.add("active-view");
    homeTabBtn.classList.add("active");
    const session = getResidentSession();
    if (session) {
      if (homeAuthGate) homeAuthGate.style.display = "none";
      if (homeDashboardPanel) homeDashboardPanel.style.display = "block";
      startAutoSwipe();
      setTimeout(() => homeMap?.invalidateSize(), 200);

      // Pre-fill resident details into pickup form
      const nameInput = document.getElementById("residentName");
      const phoneInput = document.getElementById("residentPhone");
      if (nameInput && !nameInput.value) nameInput.value = session.name || "";
      if (phoneInput && !phoneInput.value) phoneInput.value = session.phone || "";
    } else {
      if (homeAuthGate) homeAuthGate.style.display = "block";
      if (homeDashboardPanel) homeDashboardPanel.style.display = "none";
      stopAutoSwipe();
    }
  } else if (activeTab === "shop") {
    stopAutoSwipe();
    shopView.classList.add("active-view");
    shopTabBtn.classList.add("active");
    const session = getShopSession();
    if (session) {
      if (shopAuthGate) shopAuthGate.style.display = "none";
      if (shopDashboardPanel) shopDashboardPanel.style.display = "block";
      setTimeout(() => shopMap?.invalidateSize(), 200);

      const sNameInput = document.getElementById("shopNameInput");
      const sPhoneInput = document.getElementById("shopPhoneInput");
      if (sNameInput && session.name) sNameInput.value = session.name;
      if (sPhoneInput && session.phone) sPhoneInput.value = session.phone;
    } else {
      if (shopAuthGate) shopAuthGate.style.display = "block";
      if (shopDashboardPanel) shopDashboardPanel.style.display = "none";
    }
  } else if (activeTab === "recycler") {
    stopAutoSwipe();
    recyclerView.classList.add("active-view");
    recyclerTabBtn.classList.add("active");
    const session = getRecyclerSession();
    if (session) {
      if (recyclerAuthGate) recyclerAuthGate.style.display = "none";
      if (recyclerDashboardPanel) recyclerDashboardPanel.style.display = "block";
      setTimeout(() => recyclerMap?.invalidateSize(), 200);
    } else {
      if (recyclerAuthGate) recyclerAuthGate.style.display = "block";
      if (recyclerDashboardPanel) recyclerDashboardPanel.style.display = "none";
    }
  }

  updateNavbarSessionPill();
}

homeTabBtn.addEventListener("click", () => { activeTab = "home"; renderNavigation(); });
shopTabBtn.addEventListener("click", () => { activeTab = "shop"; renderNavigation(); });
recyclerTabBtn.addEventListener("click", () => { activeTab = "recycler"; renderNavigation(); });

// Navbar Sign Out Button
if (navLogoutBtn) {
  navLogoutBtn.addEventListener("click", () => {
    if (activeTab === "home") {
      setResidentSession(null);
    } else if (activeTab === "shop") {
      setShopSession(null);
    } else if (activeTab === "recycler") {
      setRecyclerSession(null);
    }
    renderNavigation();
  });
}

// -------------------------------------------------------------
// Portal 1 Auth Listeners: Resident (Citizens)
// -------------------------------------------------------------
const residentAuthForm = document.getElementById("residentAuthForm");
const residentAuthError = document.getElementById("residentAuthError");

if (residentAuthForm) {
  residentAuthForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (residentAuthError) residentAuthError.style.display = "none";

    const name = document.getElementById("residentAuthName")?.value.trim();
    const rawPhone = document.getElementById("residentAuthPhone")?.value.trim();
    const pin = document.getElementById("residentAuthPin")?.value.trim();

    let phone = rawPhone ? rawPhone.replace(/\D/g, "") : "";
    if (phone.length > 10) phone = phone.slice(-10);

    if (phone.length !== 10) {
      if (residentAuthError) {
        residentAuthError.textContent = "Please enter a valid 10-digit mobile number.";
        residentAuthError.style.display = "block";
      }
      return;
    }
    if (!pin || pin.length < 4) {
      if (residentAuthError) {
        residentAuthError.textContent = "Please enter a 4-digit PIN.";
        residentAuthError.style.display = "block";
      }
      return;
    }

    const submitBtn = document.getElementById("residentAuthSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/auth/resident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed.");
      }

      setResidentSession(data.user);
      renderNavigation();
      renderHomeLots(allRequests);
    } catch (err) {
      console.warn("Resident auth server response:", err.message);
      if (err.message.includes("Invalid PIN")) {
        if (residentAuthError) {
          residentAuthError.textContent = err.message;
          residentAuthError.style.display = "block";
        }
      } else {
        const fallbackUser = {
          id: "resident_" + phone,
          name: name || "Resident User",
          phone: phone
        };
        setResidentSession(fallbackUser);
        renderNavigation();
        renderHomeLots(allRequests);
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}



// -------------------------------------------------------------
// Portal 2 Auth Listeners: Scrap Shop Aggregator
// -------------------------------------------------------------
const shopAuthForm = document.getElementById("shopAuthForm");
const shopAuthError = document.getElementById("shopAuthError");
const shopAuthSelect = document.getElementById("shopAuthSelect");
const shopAuthNewNameGroup = document.getElementById("shopAuthNewNameGroup");

if (shopAuthSelect) {
  shopAuthSelect.addEventListener("change", () => {
    const phoneInput = document.getElementById("shopAuthPhone");
    if (shopAuthSelect.value === "__NEW__") {
      if (shopAuthNewNameGroup) shopAuthNewNameGroup.style.display = "block";
      if (phoneInput) phoneInput.value = "";
    } else {
      if (shopAuthNewNameGroup) shopAuthNewNameGroup.style.display = "none";
      if (phoneInput) {
        if (shopAuthSelect.value === "Sri Murugan Scrap Shop") {
          phoneInput.value = "9840123456";
        } else if (shopAuthSelect.value === "Balaji Metal Scrap & Traders") {
          phoneInput.value = "9840987654";
        }
      }
    }
  });
}

if (shopAuthForm) {
  shopAuthForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (shopAuthError) shopAuthError.style.display = "none";

    let shopName = shopAuthSelect?.value;
    if (shopName === "__NEW__") {
      shopName = document.getElementById("shopAuthNewName")?.value.trim();
      if (!shopName) {
        if (shopAuthError) {
          shopAuthError.textContent = "Please provide your Scrap Shop name.";
          shopAuthError.style.display = "block";
        }
        return;
      }
    }

    const rawPhone = document.getElementById("shopAuthPhone")?.value.trim();
    const pin = document.getElementById("shopAuthPin")?.value.trim();

    let phone = rawPhone ? rawPhone.replace(/\D/g, "") : "";
    if (phone.length > 10) phone = phone.slice(-10);

    if (phone.length !== 10) {
      if (shopAuthError) {
        shopAuthError.textContent = "Please enter a valid 10-digit shop phone number.";
        shopAuthError.style.display = "block";
      }
      return;
    }

    const submitBtn = document.getElementById("shopAuthSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/auth/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopName, phone, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed.");
      }

      setShopSession(data.shop);
      renderNavigation();
      renderShopUI(allRequests);
    } catch (err) {
      console.warn("Shop auth error:", err.message);
      if (err.message.includes("Invalid PIN")) {
        if (shopAuthError) {
          shopAuthError.textContent = err.message;
          shopAuthError.style.display = "block";
        }
      } else {
        const fallbackShop = {
          id: "shop_" + (shopName.toLowerCase().replace(/\s+/g, "_")),
          name: shopName,
          phone: phone
        };
        setShopSession(fallbackShop);
        renderNavigation();
        renderShopUI(allRequests);
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}



// -------------------------------------------------------------
// Portal 3 Auth Listeners: Industrial Recycler Facility
// -------------------------------------------------------------
const recyclerAuthForm = document.getElementById("recyclerAuthForm");
const recyclerAuthError = document.getElementById("recyclerAuthError");

if (recyclerAuthForm) {
  recyclerAuthForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (recyclerAuthError) recyclerAuthError.style.display = "none";

    const plantId = document.getElementById("recyclerAuthPlantId")?.value.trim();
    const passcode = document.getElementById("recyclerAuthPin")?.value.trim();

    if (!passcode) {
      if (recyclerAuthError) {
        recyclerAuthError.textContent = "Please enter facility passcode.";
        recyclerAuthError.style.display = "block";
      }
      return;
    }

    const submitBtn = document.getElementById("recyclerAuthSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/auth/recycler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, passcode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed.");
      }

      setRecyclerSession(data.plant);
      renderNavigation();
      renderRecyclerUI(allRequests);
    } catch (err) {
      console.warn("Recycler auth error:", err.message);
      if (err.message.includes("Invalid passcode")) {
        if (recyclerAuthError) {
          recyclerAuthError.textContent = err.message;
          recyclerAuthError.style.display = "block";
        }
      } else {
        const fallbackPlant = {
          id: plantId,
          plantId: plantId,
          name: plantId === "PLANT-CHE-01" ? "Chennai Central Recycler Plant" : "Coimbatore Green Recovery Hub"
        };
        setRecyclerSession(fallbackPlant);
        renderNavigation();
        renderRecyclerUI(allRequests);
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}



function renderAllViews() {
  renderHomeLots(allRequests);
  renderShopUI(allRequests);
  renderRecyclerUI(allRequests);
}

// =========================================================
// 10. REAL-TIME DATA SYNC (SQLite Database + Local Cache)
// =========================================================
let syncTimer = null;

async function fetchRequestsFromDb() {
  try {
    const res = await fetch("/api/requests");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        allRequests = data;
        localStorage.setItem("technova_requests_cache", JSON.stringify(allRequests));
        renderAllViews();
        return;
      }
    }
  } catch (err) {
    console.warn("Could not fetch from SQLite database, checking cache:", err);
  }

  // Fallback to cache only if offline
  const cached = localStorage.getItem("technova_requests_cache");
  if (cached) {
    try {
      allRequests = JSON.parse(cached);
      renderAllViews();
      return;
    } catch (_) {}
  }
  allRequests = [];
  renderAllViews();
}

function startRealtimeSync() {
  fetchRequestsFromDb();
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(fetchRequestsFromDb, 4000);
}

// =========================================================
// 11. LANGUAGE SWITCHING
// =========================================================
const languageSelect = document.getElementById("languageSelect");
languageSelect.addEventListener("change", (e) => {
  currentLang = e.target.value;
  applyTranslations(currentLang);
  renderHomeLocationStatus();
  renderAllViews();
});

// =========================================================
// 12. AI ASSISTANT BOT (3-Tier Indian Context)
// =========================================================
const toggleBotBtn = document.getElementById("toggleBotBtn");
const closeBotBtn = document.getElementById("closeBotBtn");
const botChatWindow = document.getElementById("botChatWindow");
const sendBotBtn = document.getElementById("sendBotBtn");
const botInput = document.getElementById("botInput");
const botMessages = document.getElementById("botMessages");

toggleBotBtn.addEventListener("click", () => botChatWindow.classList.toggle("hidden"));
closeBotBtn.addEventListener("click", () => botChatWindow.classList.add("hidden"));

function appendMessage(sender, text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = sender === "user" ? "user-msg" : "bot-msg";
  msgDiv.textContent = text;
  botMessages.appendChild(msgDiv);
  botMessages.scrollTop = botMessages.scrollHeight;
}

sendBotBtn.addEventListener("click", handleBotSend);
botInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleBotSend(); });

function getLocalAiResponse(query, lang) {
  const q = query.toLowerCase();
  if (q.includes("kadai") || q.includes("shop") || q.includes("scrap")) {
    return `Local scrap shops collect scrap directly from homes, aggregate them in their shop, and arrange bulk truck pickup to certified recycling plants!`;
  }
  if (q.includes("home") || q.includes("pickup") || q.includes("how")) {
    return `To request a pickup from home: 1) Select your scrap category above, 2) Enter weight, 3) Enter your 10-digit phone number, 4) Pin your home location, and submit! A nearby scrap shop will call you to collect it.`;
  }
  if (q.includes("pcb") || q.includes("motherboard")) {
    return `PCBs and motherboards are precious e-waste containing copper and chips. Keep them dry and hand them over to your scrap shop for certified refinery processing!`;
  }
  if (q.includes("battery")) {
    return `Batteries (Li-ion & Lead-acid) require careful certified handling. Do not break or puncture. Request home pickup for safe channelization!`;
  }
  return t(lang, "bot.fallback");
}

async function handleBotSend() {
  const userText = botInput.value.trim();
  if (!userText) return;

  appendMessage("user", userText);
  botInput.value = "";

  const loadingMsg = document.createElement("div");
  loadingMsg.className = "bot-msg";
  loadingMsg.textContent = t(currentLang, "bot.thinking");
  botMessages.appendChild(loadingMsg);
  botMessages.scrollTop = botMessages.scrollHeight;

  try {
    const langName = languageSelect.options[languageSelect.selectedIndex].text;
    let botReply = null;

    try {
      const apiRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText, language: langName })
      });
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json?.text) botReply = json.text;
      }
    } catch (_) {}

    loadingMsg.remove();
    appendMessage("bot", botReply || getLocalAiResponse(userText, currentLang));
  } catch (err) {
    loadingMsg.remove();
    appendMessage("bot", getLocalAiResponse(userText, currentLang));
  }
}

// =========================================================
// 13. INITIALIZATION
// =========================================================
initTheme();
applyTranslations(currentLang);
selectCardByIndex(0, false);
ensureResidentAuth();
renderNavigation();
startRealtimeSync();

// Responsive resize listener
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (homeMap) homeMap.invalidateSize();
    if (shopMap) shopMap.invalidateSize();
    if (recyclerMap) recyclerMap.invalidateSize();
    if (materialTrack && materialCards[currentCardIndex]) {
      selectCardByIndex(currentCardIndex, false);
    }
  }, 150);
});
