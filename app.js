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
                telefono: data.telefono || (usuario.match(/^[0-9]+$/) ? usuario : ""),
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
    
    const branchAddresses = {
        'Local Rosales': 'Av. Venezuela. Calle del Colesterol',
        'Local Pambiles': 'Av. Rio Toachi y Abraham Calazacon. Sector ECU 911',
        'Local 29': 'Av. 29 de Mayo y Cocaniguas. Sector Parque Central',
        'Local Quito': 'Av. Quito y Rio Chimbo. Sector Paseo Shopping'
    };

    BRANCHES.forEach(branch => {
        // Find matching key case-insensitively to avoid mismatches like 'pambiles' vs 'Local Pambiles'
        const matchedKey = Object.keys(puntosData).find(k => branch.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(branch.toLowerCase()));
        const pts = matchedKey ? puntosData[matchedKey] : 0;
        const address = branchAddresses[branch] || '';
        
        const card = document.createElement('div');
        card.className = 'point-card';
        card.innerHTML = `
            <div class="point-card-branch" style="margin-bottom: 5px;">${branch}</div>
            <div style="font-size: 0.7rem; color: var(--text-tertiary); margin-bottom: 15px;">${address}</div>
            <div class="point-card-value">${pts} pts</div>
            ${pts >= POINTS_PER_REWARD 
                ? `<button class="btn-redeem" onclick="redeemReward('${branch}')" style="margin-top: 10px;">🎁 Canjear Premio</button>`
                : `<div class="point-card-action remaining" style="margin-top: 10px;">Faltan ${POINTS_PER_REWARD - pts} puntos</div>`
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

    const sortedPremios = premiosData.slice().reverse();

    sortedPremios.forEach(p => {
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
    aderezos: ["🌰 Almendras", "🧠 Nueces", "🥜 Maní", "🍇 Pasas", "🥥 Coco Tostado", "🥥 Coco Blanco", "🥣 Granola", "⚪ Minigotas Chocolate Blanco", "⚫ Minigotas Chocolate Negro", "🌈 Minigotas Chocolate Colores", "🍬 Rocklets", "🎊 Grajeas", "🟤 Barquillo Piazza", "☁️ Marshmallows", "🔵 Chicles", "🧸 Gomitas", "🧀 Queso", "🍏 Perlas Manzana", "🫐 Perlas Arándano", "🍒 Perlas Cereza", "🍪 Galleta Oreo"],
    salsas: ["🍍 Mermelada Piña", "🟠 Mermelada Guayaba", "🍓 Mermelada Frutilla", "🍇 Mermelada Mora", "🍓 Milano Fresa", "🍫 Milano Chocolate", "🔵Milano Chicle", "🟡Manjar", "🥛 Leche Condensada", "🍯 Miel", "🔥🍫 Choc. Caliente", "⚪ Piña Colada", "🌿 Licor Menta"]
};

let cart = [];
let pendingIceCreams = [];
let currentConfigIndex = 0;
let currentSelection = { size: '', price: 0, max: 0, toppings: [], notes: '' };

function initOrders() {
    for (let cat in toppings) {
        const container = document.getElementById(`toppings-${cat}`);
        if(container) {
            toppings[cat].forEach(t => {
                const div = document.createElement('div');
                div.className = 'topping-chip';
                div.innerHTML = `${t}`;
                div.onclick = () => toggleTopping(t, div);
                container.appendChild(div);
            });
        }
    }
}

function updateQty(btn, delta) {
    event.stopPropagation();
    const valSpan = btn.parentElement.querySelector('.qty-val');
    let current = parseInt(valSpan.dataset.qty);
    let newVal = current + delta;
    if (newVal < 0) newVal = 0;
    
    valSpan.dataset.qty = newVal;
    valSpan.innerText = newVal;
    
    checkStartConfigBtn();
}

function checkStartConfigBtn() {
    let total = 0;
    let parts = [];
    document.querySelectorAll('.size-item').forEach(item => {
        let q = parseInt(item.querySelector('.qty-val').dataset.qty);
        total += q;
        if(q > 0) {
            let name = item.querySelector('.size-name').innerText;
            let pluralName = q > 1 ? name + 's' : name;
            parts.push(q + ' ' + pluralName);
        }
    });
    
    const btn = document.getElementById('btn-start-config');
    const summary = document.getElementById('qty-summary');
    
    if (total > 0) {
        btn.style.display = 'block';
        summary.style.display = 'block';
        
        let summaryText = '';
        if (parts.length > 1) {
            const last = parts.pop();
            summaryText = parts.join(', ') + ' y ' + last;
        } else {
            summaryText = parts[0];
        }
        summary.innerHTML = `🛒 Has elegido <strong>${summaryText}</strong>`;
    } else {
        btn.style.display = 'none';
        summary.style.display = 'none';
    }
}

function startConfigurationFlow() {
    pendingIceCreams = [];
    currentConfigIndex = 0;
    
    document.querySelectorAll('.size-item').forEach(item => {
        const qtySpan = item.querySelector('.qty-val');
        if (!qtySpan) return;
        const qty = parseInt(qtySpan.dataset.qty);
        if (qty > 0) {
            const card = item.querySelector('.size-card');
            const sizeName = card.querySelector('.size-name').innerText;
            const sizeId = card.dataset.size;
            const price = parseFloat(card.dataset.price);
            const maxToppings = parseInt(card.dataset.toppings);
            
            for (let i = 0; i < qty; i++) {
                pendingIceCreams.push({
                    sizeId: sizeId,
                    sizeName: sizeName,
                    price: price,
                    max: maxToppings,
                    toppings: [],
                    notes: '',
                    indexInSize: i + 1
                });
            }
        }
    });
    
    if (pendingIceCreams.length === 0) return;
    
    document.getElementById('size-grid').style.display = 'none';
    document.getElementById('btn-start-config').style.display = 'none';
    const subtitle = document.querySelector('.section-subtitle');
    if (subtitle) subtitle.style.display = 'none';
    
    renderNextIceCreamConfig();
}

function renderNextIceCreamConfig() {
    if (currentConfigIndex >= pendingIceCreams.length) {
        // Finished all configurations
        document.getElementById('toppings-section').style.display = 'none';
        document.getElementById('cart-section').style.display = 'block';
        document.getElementById('cart-section').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    const iceCream = pendingIceCreams[currentConfigIndex];
    currentSelection = { 
        size: iceCream.sizeName, 
        price: iceCream.price, 
        max: iceCream.max, 
        toppings: [...iceCream.toppings], 
        notes: iceCream.notes 
    };
    
    document.getElementById('toppings-main-title').innerHTML = `<span class="step-badge">2</span> Toppings para Helado ${iceCream.sizeName} #${iceCream.indexInSize}`;
    document.getElementById('toppings-subtitle').innerHTML = `Selecciona hasta <strong>${iceCream.max}</strong> toppings incluidos`;
    
    document.getElementById('order-notes').value = iceCream.notes;
    
    document.getElementById('toppings-section').style.display = 'block';
    
    // Clear selections visually
    document.querySelectorAll('.topping-chip').forEach(t => {
        t.classList.remove('selected', 'extra', 'double-selected');
        t.removeAttribute('data-count');
    });
    
    // If it has pre-filled toppings (from copy feature), visually select them
    iceCream.toppings.forEach(tName => {
        const chip = Array.from(document.querySelectorAll('.topping-chip')).find(el => el.innerText === tName);
        if (chip) {
            let count = currentSelection.toppings.filter(t => t === tName).length;
            if (count === 1) {
                chip.classList.add('selected');
                chip.setAttribute('data-count', '1');
            } else if (count >= 2) {
                chip.classList.add('double-selected');
                chip.setAttribute('data-count', '2');
            }
        }
    });
    
    updateLimitMessage();
    
    const nextBtn = document.getElementById('btn-next-config');
    if (currentConfigIndex === pendingIceCreams.length - 1) {
        nextBtn.innerHTML = `Terminar y ver carrito <span style="text-shadow: 0 0 4px white, 0 0 8px white;">🛒</span>`;
    } else {
        nextBtn.innerHTML = "Siguiente Helado ➡️";
    }
    
    // Copy toppings feature logic
    const sameSizeIceCreams = pendingIceCreams.filter((ic, idx) => idx > currentConfigIndex && ic.sizeId === iceCream.sizeId);
    const copyContainer = document.getElementById('copy-toppings-container');
    const copyList = document.getElementById('copy-toppings-list');
    
    if (sameSizeIceCreams.length > 0) {
        copyContainer.style.display = 'block';
        copyList.innerHTML = '';
        sameSizeIceCreams.forEach((ic) => {
            const targetIdx = pendingIceCreams.indexOf(ic);
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.cursor = 'pointer';
            label.innerHTML = `<input type="checkbox" class="copy-target-cb" data-target-index="${targetIdx}" style="width:18px;height:18px;"> <span>Aplicar a Helado ${ic.sizeName} #${ic.indexInSize}</span>`;
            copyList.appendChild(label);
        });
    } else {
        copyContainer.style.display = 'none';
    }
    
    document.getElementById('toppings-section').scrollIntoView({ behavior: 'smooth' });
}

function toggleTopping(name, el) {
    let count = currentSelection.toppings.filter(t => t === name).length;
    
    if (count === 0) {
        currentSelection.toppings.push(name);
        el.classList.add('selected');
        el.setAttribute('data-count', '1');
    } else if (count === 1) {
        currentSelection.toppings.push(name);
        el.classList.add('double-selected');
        el.setAttribute('data-count', '2');
    } else {
        // Deselect on 3rd click
        currentSelection.toppings = currentSelection.toppings.filter(t => t !== name);
        el.classList.remove('selected', 'extra', 'double-selected');
        el.removeAttribute('data-count');
        showToast('El topping puede ser seleccionado máximo 2 veces', 'warn');
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

function saveCurrentIceCreamConfig() {
    const notes = document.getElementById('order-notes').value;
    const extrasCount = Math.max(0, currentSelection.toppings.length - currentSelection.max);
    const finalPrice = currentSelection.price + (extrasCount * 0.25);
    
    const configToSave = {
        ...currentSelection,
        toppings: [...currentSelection.toppings],
        finalPrice: finalPrice,
        extras: extrasCount,
        notes: notes
    };
    
    cart.push(configToSave);
    
    const copyContainer = document.getElementById('copy-toppings-container');
    if (copyContainer.style.display !== 'none') {
        const checkboxes = document.querySelectorAll('.copy-target-cb:checked');
        checkboxes.forEach(cb => {
            const targetIdx = parseInt(cb.dataset.targetIndex);
            pendingIceCreams[targetIdx].toppings = [...currentSelection.toppings];
        });
    }
    
    currentConfigIndex++;
    renderCart();
    renderNextIceCreamConfig();
}

function formatToppings(toppingsArray) {
    const counts = {};
    toppingsArray.forEach(t => counts[t] = (counts[t] || 0) + 1);
    return Object.entries(counts).map(([t, c]) => c > 1 ? `${t} x${c}` : t).join(', ');
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
            <small>${formatToppings(item.toppings)}</small> 
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

function resetSelection(fullReset) {
    currentSelection = { size: '', price: 0, max: 0, toppings: [], notes: '' };
    document.getElementById('order-notes').value = '';
    
    document.querySelectorAll('.topping-chip').forEach(t => {
        t.classList.remove('selected', 'extra', 'double-selected');
        t.removeAttribute('data-count');
    });
    
    if(fullReset) {
        document.getElementById('toppings-section').style.display = 'none';
        document.getElementById('cart-section').style.display = 'none';
        
        // Reset quantities
        document.querySelectorAll('.qty-val').forEach(span => {
            span.dataset.qty = 0;
            span.innerText = 0;
        });
        checkStartConfigBtn();
        
        document.getElementById('size-grid').style.display = 'grid';
        const subtitle = document.querySelector('.section-subtitle');
        if (subtitle) subtitle.style.display = 'block';
    }
}

function handleOrder() {
    const btn = document.getElementById('btn-send-order');
    const nameInput = document.getElementById('customer-name').value.trim();
    const phoneInput = document.getElementById('customer-phone').value.trim();
    
    if (!nameInput) {
        showToast("Por favor, ingresa tu nombre completo", "warn");
        return;
    }
    if (!phoneInput) {
        showToast("Por favor, ingresa tu teléfono", "warn");
        return;
    }

    if (navigator.geolocation) {
        btn.innerText = "Cargando ubicación...";
        navigator.geolocation.getCurrentPosition((pos) => {
            const loc = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
            sendDoubleWhatsApp(loc, nameInput, phoneInput);
            btn.innerText = "📲 ENVIAR PEDIDO POR WHATSAPP";
        }, () => {
            alert("No pudimos obtener tu ubicación automáticamente. Por favor, envíanos tu ubicación directamente por WhatsApp.");
            sendDoubleWhatsApp("Ubicación pendiente (el cliente la enviará por WhatsApp)", nameInput, phoneInput);
            btn.innerText = "📲 ENVIAR PEDIDO POR WHATSAPP";
        });
    } else {
        sendDoubleWhatsApp("Ubicación pendiente (el cliente la enviará por WhatsApp)", nameInput, phoneInput);
    }
}

function getCartSummary() {
    const counts = {};
    cart.forEach(item => {
        counts[item.size] = (counts[item.size] || 0) + 1;
    });
    const parts = Object.entries(counts).map(([size, count]) => `${count} Helado ${size}`);
    if (parts.length > 1) {
        const last = parts.pop();
        return parts.join(', ') + ' y ' + last;
    }
    return parts[0];
}

function sendDoubleWhatsApp(locationUrl, customerName, customerPhone) {
    const branchSelect = document.getElementById('branch-select');
    const branchPhone = branchSelect.value;
    const branchName = branchSelect.options[branchSelect.selectedIndex].text;
    
    let msg = `_NUEVO PEDIDO GREENFROST_%0A%0A`;
    msg += `*Sucursal*: ${branchName}%0A%0A`;
    msg += `*Cliente*: ${customerName}%0A`;
    msg += `*Teléfono*: ${customerPhone}%0A%0A`;
    
    msg += `*Pedido:* ${getCartSummary()}%0A%0A`;

    cart.forEach((item) => {
        msg += `- Helado ${item.size} ($${item.finalPrice.toFixed(2)})%0A%0A`;
        msg += `Toppings: ${formatToppings(item.toppings)}%0A`;
        if(item.extras > 0) msg += `⚠️ Toppings extras: ${item.extras} (+$${(item.extras * 0.25).toFixed(2)})%0A`;
        if(item.notes) msg += `📝 Notas: ${item.notes}%0A`;
        msg += `%0A`;
    });
    
    let total = cart.reduce((sum, item) => sum + item.finalPrice, 0);
    msg += `*TOTAL: $${total.toFixed(2)}*%0A%0A`;
    msg += `UBICACIÓN DE ENTREGA ${locationUrl}%0A%0A`;
    msg += `_Nota: El envío tiene un costo adicional $2 - $3 (dentro del perímetro urbano). El motorizado se pondrá en contacto con el cliente para darle el valor específico_`;

    window.location.href = `https://wa.me/${branchPhone}?text=${msg}`;
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
    
    if (isAuthenticated()) {
        const session = getSession();
        if (session) {
            const customerNameEl = document.getElementById('customer-name');
            if (customerNameEl && session.nombre) customerNameEl.value = session.nombre;
            
            const customerPhoneEl = document.getElementById('customer-phone');
            if (customerPhoneEl && session.telefono) customerPhoneEl.value = session.telefono;
        }
    }
    
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

window.addEventListener('appinstalled', (evt) => {
  showToast('¡App Instalada Exitosamente! Busca el ícono en tu pantalla de inicio.', 'success');
});

document.addEventListener('DOMContentLoaded', () => {
  // Cookie and Privacy Policy Logic
  const cookieBanner = document.getElementById('cookie-banner');
  const btnAcceptCookies = document.getElementById('btn-accept-cookies');
  const linkPrivacy = document.getElementById('link-privacy-policy');
  const modalPrivacy = document.getElementById('privacy-modal');
  const btnClosePrivacy = document.getElementById('btn-close-privacy');

  if (cookieBanner && !localStorage.getItem('cookiesAccepted')) {
    setTimeout(() => cookieBanner.classList.add('visible'), 1500);
  }

  if (btnAcceptCookies) {
    btnAcceptCookies.addEventListener('click', () => {
      localStorage.setItem('cookiesAccepted', 'true');
      cookieBanner.classList.remove('visible');
    });
  }

  if (linkPrivacy && modalPrivacy) {
    linkPrivacy.addEventListener('click', (e) => {
      e.preventDefault();
      modalPrivacy.classList.add('active');
    });
  }

  if (btnClosePrivacy && modalPrivacy) {
    btnClosePrivacy.addEventListener('click', () => {
      modalPrivacy.classList.remove('active');
    });
  }
});

