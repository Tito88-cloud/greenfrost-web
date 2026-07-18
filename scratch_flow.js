let pendingIceCreams = [];
let currentConfigIndex = 0;

function updateQty(btn, delta) {
    // Prevent event from bubbling to card if needed
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
    document.querySelectorAll('.qty-val').forEach(span => {
        total += parseInt(span.dataset.qty);
    });
    const btn = document.getElementById('btn-start-config');
    btn.style.display = total > 0 ? 'block' : 'none';
}

function startConfigurationFlow() {
    pendingIceCreams = [];
    currentConfigIndex = 0;
    
    document.querySelectorAll('.size-card').forEach(card => {
        const qty = parseInt(card.querySelector('.qty-val').dataset.qty);
        if (qty > 0) {
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
    document.querySelector('.section-subtitle').style.display = 'none'; // hide size subtitle
    
    renderNextIceCreamConfig();
}

function renderNextIceCreamConfig() {
    if (currentConfigIndex >= pendingIceCreams.length) {
        // Finished all
        document.getElementById('toppings-section').style.display = 'none';
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
    
    document.getElementById('toppings-main-title').innerHTML = <span class="step-badge">2</span> Toppings para Helado \ #\;
    document.getElementById('toppings-subtitle').innerHTML = Selecciona hasta <strong>\</strong> toppings incluidos;
    
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
        nextBtn.innerHTML = "Terminar y ver carrito ??";
    } else {
        nextBtn.innerHTML = "Siguiente Helado ??";
    }
    
    // Copy toppings feature logic
    const sameSizeIceCreams = pendingIceCreams.filter((ic, idx) => idx > currentConfigIndex && ic.sizeId === iceCream.sizeId);
    const copyContainer = document.getElementById('copy-toppings-container');
    const copyList = document.getElementById('copy-toppings-list');
    
    if (sameSizeIceCreams.length > 0) {
        copyContainer.style.display = 'block';
        copyList.innerHTML = '';
        sameSizeIceCreams.forEach((ic) => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.cursor = 'pointer';
            label.innerHTML = <input type="checkbox" class="copy-target-cb" data-target-index="\" style="width:18px;height:18px;"> <span>Aplicar a Helado \ #\</span>;
            copyList.appendChild(label);
        });
    } else {
        copyContainer.style.display = 'none';
    }
    
    document.getElementById('toppings-section').scrollIntoView({ behavior: 'smooth' });
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
    
    // Save to cart directly (or update if already saved)
    cart.push(configToSave);
    
    // Check if we need to copy to others
    const copyContainer = document.getElementById('copy-toppings-container');
    if (copyContainer.style.display !== 'none') {
        const checkboxes = document.querySelectorAll('.copy-target-cb:checked');
        checkboxes.forEach(cb => {
            const targetIdx = parseInt(cb.dataset.targetIndex);
            // Copy toppings to the pending ice cream
            pendingIceCreams[targetIdx].toppings = [...currentSelection.toppings];
        });
    }
    
    currentConfigIndex++;
    renderCart(); // update cart view in background
    renderNextIceCreamConfig();
}
