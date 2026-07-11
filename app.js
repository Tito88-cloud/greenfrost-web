const N8N_URL = "https://n8n.grupojaye.cloud/webhook";

const ENDPOINTS = {
    register: N8N_URL + '/gf-client-register',
    login: N8N_URL + '/gf-client-login',
    points: N8N_URL + '/gf-client-points',
    redeem: N8N_URL + '/gf-client-redeem'
};
const BRANCHES = ['Local Rosales', 'Local Pambiles', 'Local 29', 'Local Quito'];
const POINTS_PER_REWARD = 10;
const QR_REFRESH_INTERVAL = 5 * 60 * 1000;
const POINTS_POLL_INTERVAL = 30 * 1000;
const MONITOR_NUMBER = '593969764774';

let qrInterval = null;
let pointsInterval = null;

// --- ROUTER & VIEWS ---
function switchView(viewId, pushState = true) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    
    window.scrollTo(0, 0);

    if (pushState && (!history.state || history.state.viewId !== viewId)) {
        history.pushState({ viewId }, "", `#${viewId}`);
    }

    if (viewId === 'fidelidad') {
        if (isAuthenticated()) showDashboard();
        else showSubView('fidelidad-login');
    } else {
        stopQRAutoRefresh();
        stopPointsPolling();
    }
}

function showSubView(id) {
    document.querySelectorAll('#view-fidelidad .sub-view').forEach(v => v.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

// --- AUTH MODULE ---
function saveSession(data) { localStorage.setItem('gf_session', JSON.stringify(data)); }
function getSession() { return JSON.parse(localStorage.getItem('gf_session')); }
function clearSession() { localStorage.removeItem('gf_session'); }
function isAuthenticated() { return !!getSession(); }

async function handleRegister(event) {
    if (event) event.preventDefault();
    const nombre = document.getElementById('reg-name').value;
    const usuario = document.getElementById('reg-user').value;
    const pass = document.getElementById('reg-pass').value;
    const passConfirm = document.getElementById('reg-pass2').value;
    const tel = document.getElementById('reg-phone').value;
    
    if (pass !== passConfirm) {
        return showToast('Las contraseñas no coinciden', 'error');
    }
    
    showLoading();
    try {
        const res = await fetch(ENDPOINTS.register, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({ nombre, usuario, password: pass, telefono: tel })
        });
        const data = await res.json();
        hideLoading();
        
        if (data.success) {
            showToast('Cuenta creada exitosamente', 'success');
            showSubView('fidelidad-login');
            document.getElementById('register-form').reset();
        } else {
            showToast(data.error || 'Error en el registro', 'error');
        }
    } catch (e) {
        hideLoading();
        showToast('Error de conexión', 'error');
    }
}

async function handleLogin(event) {
    if (event) event.preventDefault();
    const usuario = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    
    showLoading();
    try {
        const res = await fetch(ENDPOINTS.login, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({ usuario, password: pass })
        });
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        hideLoading();
        
        if (data && data.success) {
            saveSession({
                clienteId: data.clienteId,
                nombre: data.nombre,
                hmacSecret: data.hmacSecret || "12345"
            });
            document.getElementById('login-form').reset();
            showDashboard();
        } else {
            showToast(data.error || 'Credenciales inválidas', 'error');
        }
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message, 'error');
        console.error("Login fetch error:", e);
    }
}

function logout() {
    clearSession();
    stopQRAutoRefresh();
    stopPointsPolling();
    showSubView('fidelidad-login');
}

// --- DASHBOARD & QR ---
function showDashboard() {
    const session = getSession();
    document.getElementById('user-name').innerText = session.nombre;
    showSubView('fidelidad-dashboard');
    startQRAutoRefresh();
    startPointsPolling();
}

async function generateSecureQR() {
    const session = getSession();
    if (!session) return;
    
    const timestamp = Math.floor(Date.now() / 1000);
    const message = session.clienteId + ':' + timestamp;
    
    // Fallback to a simple hash if CryptoJS is not loaded
    let hmac = "0000000000000000";
    if (typeof CryptoJS !== 'undefined') {
        hmac = CryptoJS.HmacSHA256(message, session.hmacSecret).toString(CryptoJS.enc.Hex);
    }
    
    const payload = `GF:${session.clienteId}:${timestamp}:${hmac}`;
    
    const canvas = document.getElementById('qr-canvas');
    QRCode.toCanvas(canvas, payload, {
        width: 250,
        margin: 2,
        color: { dark: '#e6007e', light: '#ffffff' } // Fuchsia QR
    });
}

function startQRAutoRefresh() {
    generateSecureQR();
    if (qrInterval) clearInterval(qrInterval);
    qrInterval = setInterval(generateSecureQR, QR_REFRESH_INTERVAL);
}

function stopQRAutoRefresh() {
    if (qrInterval) clearInterval(qrInterval);
}

// --- POINTS MODULE ---
async function fetchPoints() {
    const session = getSession();
    if (!session) return;
    
    try {
        const res = await fetch(ENDPOINTS.points + '?clienteId=' + encodeURIComponent(session.clienteId));
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        renderPoints(data && data.puntos ? data.puntos : {});
        renderRewards(data && data.premios ? data.premios : []);
    } catch (e) {
        console.error('Error fetching points', e);
    }
}

function renderPoints(puntosData) {
    const container = document.getElementById('points-cards-container');
    if(!container) return;
    container.innerHTML = '';
    
    BRANCHES.forEach(branch => {
        // Find matching key case-insensitively to avoid mismatches like 'pambiles' vs 'Local Pambiles'
        const matchedKey = Object.keys(puntosData).find(k => branch.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(branch.toLowerCase()));
        const pts = matchedKey ? puntosData[matchedKey] : 0;
        
        const card = document.createElement('div');
        card.className = 'point-card';
        card.innerHTML = `
            <h4>${branch}</h4>
            <div class="points-val">${pts} pts</div>
            ${pts >= POINTS_PER_REWARD 
                ? `<button class="btn-redeem" onclick="redeemReward('${branch}')">🎁 Canjear Premio</button>`
                : `<div class="points-missing">Faltan ${POINTS_PER_REWARD - pts} puntos</div>`
            }
        `;
        container.appendChild(card);
    });
}

function renderRewards(premiosData) {
    const pendingContainer = document.getElementById('rewards-pending');
    const deliveredContainer = document.getElementById('rewards-delivered');
    if(!pendingContainer || !deliveredContainer) return;
    
    pendingContainer.innerHTML = '';
    deliveredContainer.innerHTML = '';
    
    let hasPending = false;
    let hasDelivered = false;

    premiosData.forEach(p => {
        const div = document.createElement('div');
        div.className = 'reward-item ' + p.estado;
        div.innerHTML = `
            <div style="font-weight:bold;">${p.premio} - ${p.sucursal}</div>
            <div style="font-size:0.85rem;">Estado: <span style="text-transform:uppercase;">${p.estado}</span></div>
            <div style="font-size:0.8rem; color:#666;">Fecha: ${p.fechaSolicitud}</div>
        `;
        if(p.estado === 'pendiente') {
            pendingContainer.appendChild(div);
            hasPending = true;
        } else {
            deliveredContainer.appendChild(div);
            hasDelivered = true;
        }
    });

    if (!hasPending) pendingContainer.innerHTML = '<p style="text-align:center; color:#666;">No tienes premios pendientes.</p>';
    if (!hasDelivered) deliveredContainer.innerHTML = '<p style="text-align:center; color:#666;">No tienes premios entregados.</p>';
}

async function redeemReward(sucursal) {
    if (!confirm(`¿Canjear 1 Helado Pequeño Gratis en ${sucursal}?`)) return;
    
    const session = getSession();
    showLoading();
    try {
        const res = await fetch(ENDPOINTS.redeem, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({ clienteId: session.clienteId, sucursal })
        });
        const data = await res.json();
        hideLoading();
        
        if (data.success) {
            showToast('Premio solicitado exitosamente.', 'success');
            fetchPoints();
        } else {
            showToast(data.error || 'No se pudo canjear el premio.', 'error');
        }
    } catch (e) {
        hideLoading();
        showToast('Error de conexión', 'error');
    }
}

function startPointsPolling() {
    fetchPoints();
    if (pointsInterval) clearInterval(pointsInterval);
    pointsInterval = setInterval(fetchPoints, POINTS_POLL_INTERVAL);
}

function stopPointsPolling() {
    if (pointsInterval) clearInterval(pointsInterval);
}

// --- UI HELPERS ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading() {
    const el = document.getElementById('loading-overlay');
    if(el) el.classList.add('active');
}
function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if(el) el.classList.remove('active');
}

// --- ORDER MODULE (MIGRATED) ---
const toppings = {
    frutas: ["🍓 Frutilla", "🍎 Manzana", "🍌 Banano", "🍈 Melon", "🍍 Pina", "🍑 Durazno", "🥝 Kiwi", "🥭 Mango", "🍇 Uva", "🟠 Papaya", "🌵 Pitahaya", "🟣 Higos", "🟡 Maracuya"],
    aderezos: ["🌰 Almendras", "🧠 Nueces", "🥜 Maní", "🍇 Pasas", "🥥 Coco Tostado", "🥥 Coco Blanco", "🥣 Granola", "⚪ Minigotas Chocolate Blanco", "⚫ Minigotas Chocolate Negro", "🌈 Minigotas Chocolate Colores", "🍬 Rocklets", "🎊 Grajeas", "🟤 Barquillo Piazza", "☁️ Marshmallows", "🔵 Chicles", "🧸 Gomitas", "🧀 Queso", "🍏 Perlas Manzana", "🫐 Perlas Arándano", "🍒 Perlas Cereza"],
    salsas: ["🍍 Mermelada Piña", "🟠 Mermelada Guayaba", "🍓 Mermelada Frutilla", "🍇 Mermelada Mora", "🍓 Milano Fresa", "🍫 Milano Chocolate", "🔵Milano Chicle", "🟡Manjar", "🥛 Leche Condensada", "🍯 Miel", "🔥🍫 Choc. Caliente", "⚪ Piña Colada", "🌿 Licor Menta"]
};

let cart = [];
let currentSelection = { size: '', price: 0, max: 0, toppings: [], notes: '' };

function initOrders() {
    for (let cat in toppings) {
        const container = document.getElementById(`toppings-${cat}`);
        if(container) {
            toppings[cat].forEach(t => {
                const div = document.createElement('div');
                div.className = 'topping-chip';
                div.innerHTML = `<span class="chip-emoji">🍦</span> ${t}`;
                div.onclick = () => toggleTopping(t, div);
                container.appendChild(div);
            });
        }
    }
}

function selectSize(el) {
    const name = el.dataset.size;
    const p = parseFloat(el.dataset.price);
    const limit = parseInt(el.dataset.toppings);
    currentSelection = { size: name, price: p, max: limit, toppings: [], notes: '' };
    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('order-notes').value = '';
    document.getElementById('toppings-section').style.display = 'block';
    document.getElementById('notes-section').style.display = 'block';
    
    document.getElementById('toppings-subtitle').innerHTML = `Selecciona hasta <strong>${limit}</strong> toppings incluidos`;
    
    // Clear selections
    document.querySelectorAll('.topping-chip').forEach(t => t.classList.remove('selected', 'extra'));
    updateLimitMessage();
    document.getElementById('toppings-section').scrollIntoView({ behavior: 'smooth' });
}

function toggleTopping(name, el) {
    const index = currentSelection.toppings.indexOf(name);
    if (index > -1) {
        currentSelection.toppings.splice(index, 1);
        el.classList.remove('selected', 'extra');
    } else {
        currentSelection.toppings.push(name);
        el.classList.add('selected');
    }
    updateLimitMessage();
}

function updateLimitMessage() {
    const count = currentSelection.toppings.length;
    const max = currentSelection.max;
    const msgContainer = document.getElementById('limit-message');
    const msgIcon = document.getElementById('limit-icon');
    const msgText = document.getElementById('limit-text');
    msgContainer.style.display = 'flex';
    
    if (count <= max) {
        msgContainer.className = 'limit-message ok';
        msgIcon.innerText = '✅';
        msgText.innerHTML = `Has elegido <strong>${count}</strong> de <strong>${max}</strong> toppings incluidos.`;
    } else {
        const extras = count - max;
        msgContainer.className = 'limit-message warn';
        msgIcon.innerText = '⚠️';
        msgText.innerHTML = `¡Llevas <strong>${extras}</strong> topping(s) extra(s)! (+$0.25 c/u)`;
    }
}

function addToCart() {
    if (!currentSelection.size) return;
    const notes = document.getElementById('order-notes').value;
    const extrasCount = Math.max(0, currentSelection.toppings.length - currentSelection.max);
    const finalPrice = currentSelection.price + (extrasCount * 0.25);
    
    cart.push({
        ...currentSelection, 
        toppings: [...currentSelection.toppings], 
        finalPrice: finalPrice, 
        extras: extrasCount,
        notes: notes
    });
    
    renderCart();
    resetSelection(false);
    document.getElementById('cart-section').scrollIntoView({ behavior: 'smooth' });
}

function renderCart() {
    const container = document.getElementById('cart-items');
    container.innerHTML = "";
    let total = 0;
    cart.forEach((item, index) => {
        total += item.finalPrice;
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `<span class="remove-item" onclick="removeItem(${index})">❌ Quitar</span>
            <strong>Helado ${item.size}</strong> - $${item.finalPrice.toFixed(2)}<br>
            <small>${item.toppings.join(', ')}</small> 
            ${item.extras > 0 ? `<br><small style="color:var(--fuchsia-frost)">+${item.extras} Toppings extras</small>` : ''}
            ${item.notes ? `<br><span class="cart-notes">📝 ${item.notes}</span>` : ''}`;
        container.appendChild(div);
    });
    document.getElementById('cart-total-price').innerText = `$${total.toFixed(2)}`;
    document.getElementById('cart-section').style.display = cart.length > 0 ? 'block' : 'none';
    const totalEl = document.getElementById('cart-total');
    if(totalEl) totalEl.style.display = cart.length > 0 ? 'flex' : 'none';
}

function removeItem(index) { 
    cart.splice(index, 1); 
    renderCart(); 
    if(cart.length === 0) resetSelection(true);
}

function resetSelection(hideToppings) {
    currentSelection = { size: '', price: 0, max: 0, toppings: [], notes: '' };
    document.getElementById('order-notes').value = '';
    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.topping-chip').forEach(t => t.classList.remove('selected', 'extra'));
    if(hideToppings) {
        document.getElementById('toppings-section').style.display = 'none';
        document.getElementById('notes-section').style.display = 'none';
    }
}

function handleOrder() {
    const btn = document.getElementById('btn-send-order');
    if (navigator.geolocation) {
        btn.innerText = "Cargando ubicación...";
        navigator.geolocation.getCurrentPosition((pos) => {
            const loc = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
            sendDoubleWhatsApp(loc);
            btn.innerText = "📲 ENVIAR PEDIDO POR WHATSAPP";
        }, () => {
            alert("No pudimos obtener tu ubicación automáticamente. Por favor, envíanos tu ubicación directamente por WhatsApp.");
            sendDoubleWhatsApp("Ubicación pendiente (el cliente la enviará por WhatsApp)");
            btn.innerText = "📲 ENVIAR PEDIDO POR WHATSAPP";
        });
    } else {
        sendDoubleWhatsApp("Ubicación pendiente (el cliente la enviará por WhatsApp)");
    }
}

function sendDoubleWhatsApp(locationUrl) {
    const branchSelect = document.getElementById('branch-select');
    const branchPhone = branchSelect.value;
    const branchName = branchSelect.options[branchSelect.selectedIndex].text;
    
    let msg = `*NUEVO PEDIDO GREENFROST*%0A📍 *Sucursal:* ${branchName}%0A%0A`;
    cart.forEach((item, i) => {
        msg += `*${i+1}. Helado ${item.size}* ($${item.finalPrice.toFixed(2)})%0A`;
        msg += `Toppings: ${item.toppings.join(', ')}%0A`;
        if(item.notes) msg += `📝 Notas: ${item.notes}%0A`;
        msg += `%0A`;
    });
    
    let total = cart.reduce((sum, item) => sum + item.finalPrice, 0);
    msg += `*TOTAL: $${total.toFixed(2)}*%0A`;
    msg += `🛵 *UBICACIÓN:* ${locationUrl}%0A`;
    msg += `%0A_Nota: El envío tiene un costo adicional._`;

    // To avoid pop-up blockers, we open the monitor in a new tab, and redirect the current tab to the branch.
    // Both happen synchronously during the click event.
    window.open(`https://wa.me/${MONITOR_NUMBER}?text=${msg}`, '_blank');
    window.location.href = `https://wa.me/${branchPhone}?text=${msg}`;

    document.getElementById('btn-send-order').innerText = "📲 ENVIAR PEDIDO POR WHATSAPP";
}

function addAnother() {
    resetSelection(true);
    document.getElementById('size-grid').scrollIntoView({ behavior: 'smooth' });
}

function togglePassword(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btnEl.innerText = '🙈';
    } else {
        input.type = 'password';
        btnEl.innerText = '👁️';
    }
}

function switchRewardsTab(tabId) {
    document.querySelectorAll('.rewards-tab').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.rewards-tab[data-rewards="${tabId}"]`);
    if(btn) btn.classList.add('active');
    
    if(tabId === 'pending') {
        document.getElementById('rewards-pending').style.display = 'block';
        document.getElementById('rewards-delivered').style.display = 'none';
    } else {
        document.getElementById('rewards-pending').style.display = 'none';
        document.getElementById('rewards-delivered').style.display = 'block';
    }
}

function manualRefresh() {
    fetchPoints();
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initOrders();
    
    // Set initial history state for back button handling
    if (!history.state) {
        history.replaceState({ viewId: 'home' }, "", "#home");
    }
    
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.viewId) {
            switchView(e.state.viewId, false);
        } else {
            switchView('home', false);
        }
    });

    const regForm = document.getElementById('register-form');
    if (regForm) regForm.addEventListener('submit', handleRegister);
    
    const logForm = document.getElementById('login-form');
    if (logForm) logForm.addEventListener('submit', handleLogin);
    
    // Automatically switch to fidelidad if authenticated and we navigated there
    if (isAuthenticated()) {
        const activeView = document.querySelector('.view.active');
        if(activeView && activeView.id === 'view-fidelidad') {
            showDashboard();
        }
    }
});

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

const installAppBtn = document.getElementById('install-app-btn');
if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
    } else {
      // Fallback para iOS o navegadores que no soportan el prompt automático
      alert('Para instalar la App: \n\nEn iPhone (Safari): Toca el botón de Compartir y elige "Agregar a inicio".\n\nEn Android (Chrome): Toca los 3 puntos del menú y elige "Instalar aplicación" o "Agregar a la pantalla principal".');
    }
  });
}

