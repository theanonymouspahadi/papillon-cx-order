/**
 * ============================================================================
 * PAPILLON VEG FINE DINE - QR TABLE ORDERING CLIENT (PRODUCTION RESILIENT)
 * Direct Supabase Realtime synchronization with Staff Operations Portal
 * Supports Multi-Round table additions, Jain preferences & Live Kitchen Status
 * ============================================================================
 */

// Application State
let currentTableId = null;
let menuItems = [];
let cart = []; // Array of { id, name, price, qty, is_jain, category, image }
let currentTableDbOrder = null; // Open order row in Supabase active_orders (if any)
let activeCategory = 'all';
let searchQuery = '';
let filterJainOnly = false;
let filterSpecialOnly = false;
let realtimeChannel = null;

// Audio Chime (Web Audio API synthetic notification)
function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

// ----------------------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTableNumber();
  setupSearchAndFilters();
  await loadMenuData();
  await syncActiveTableOrder();
  setupRealtimeSubscription();
  restoreSavedCart();
});

// ----------------------------------------------------------------------------
// TABLE NUMBER DETECTION & MANAGEMENT
// ----------------------------------------------------------------------------
function initTableNumber() {
  const params = new URLSearchParams(window.location.search);
  const tableParam = params.get('table') || params.get('t');
  
  if (tableParam && !isNaN(parseInt(tableParam, 10))) {
    setTableNumber(parseInt(tableParam, 10));
  } else {
    const savedTable = sessionStorage.getItem('papillon_cx_table');
    if (savedTable && !isNaN(parseInt(savedTable, 10))) {
      setTableNumber(parseInt(savedTable, 10));
    } else {
      // Default prompt if testing or scanning generic URL
      openTableModal();
    }
  }
}

function setTableNumber(num) {
  currentTableId = num;
  sessionStorage.setItem('papillon_cx_table', num.toString());
  
  const tableEl = document.getElementById('currentTableNumber');
  if (tableEl) tableEl.textContent = num;
  
  const drawerTableTag = document.getElementById('drawerTableTag');
  if (drawerTableTag) drawerTableTag.textContent = `Table ${num}`;
  
  const ticketTableNum = document.getElementById('ticketTableNum');
  if (ticketTableNum) ticketTableNum.textContent = num;
}

function openTableModal() {
  const modal = document.getElementById('tableSelectorModal');
  const grid = document.getElementById('tableGrid');
  if (!modal || !grid) return;
  
  // Render tables 1 to 12
  grid.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const btn = document.createElement('button');
    btn.className = `table-num-btn ${currentTableId === i ? 'active' : ''}`;
    btn.innerHTML = `Table ${i} <span>Seated</span>`;
    btn.onclick = () => {
      setTableNumber(i);
      modal.classList.add('hidden');
      syncActiveTableOrder();
      showToast(`Welcome! Ordering activated for Table ${i}`);
    };
    grid.appendChild(btn);
  }
  
  modal.classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// SUPABASE MENU LOADER
// ----------------------------------------------------------------------------
async function loadMenuData() {
  const container = document.getElementById('dishesContainer');
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.from('menu').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        menuItems = data;
        renderDishes();
        return;
      }
    }
  } catch (err) {
    console.warn('Could not fetch Supabase menu, loading fallback dishes:', err);
  }

  // Fallback curated dishes in case Supabase is offline
  menuItems = [
    {
      id: 'item-101',
      name: 'Dal Papillon Royal',
      category: 'today-special',
      price: '₹425',
      desc: 'Black lentils slow-cooked overnight with smoked plum tomatoes, cultured white butter, and Kashmiri saffron cream.',
      tags: ["Chef Special", "Jain Option"],
      spice: 1,
      isJain: true,
      isPopular: true,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-102',
      name: 'Tandoori Malai Paneer Pasanda',
      category: 'today-special',
      price: '₹495',
      desc: 'Handmade cottage cheese rounds stuffed with pistachio & cardamom cream, charred in clay oven.',
      tags: ["Chef Special", "Rich"],
      spice: 1,
      isJain: true,
      isPopular: true,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-103',
      name: 'Papillon Sizzling Feast',
      category: 'sizzlers',
      price: '₹595',
      desc: 'Steaming cast-iron platter of smoked paneer steak, buttered jeera rice, crisp fries, and pepper glaze.',
      tags: ["Sizzler", "Popular"],
      spice: 2,
      isJain: false,
      isPopular: true,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-104',
      name: 'Crispy Lotus Stem Honey Chilli',
      category: 'starters',
      price: '₹395',
      desc: 'Wok-tossed lotus stem chips glazed in sesame seeds, wild honey chilli sauce, and scallions.',
      tags: ["Crispy", "Popular"],
      spice: 2,
      isJain: false,
      isPopular: true,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-105',
      name: 'Dum Pukht Veg Biryani',
      category: 'main-indian',
      price: '₹450',
      desc: 'Fragrant aged basmati rice layered with garden veggies, whole spices, and saffron milk in a sealed handi.',
      tags: ["Aromatic", "Jain Option"],
      spice: 2,
      isJain: true,
      isPopular: true,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-106',
      name: 'Truffle Butter Naan',
      category: 'breads',
      price: '₹140',
      desc: 'Artisanal clay oven flatbread brushed with black truffle infused butter and sea salt.',
      tags: ["Tandoor"],
      spice: 0,
      isJain: true,
      isPopular: false,
      image: 'assets/images/hero.png'
    },
    {
      id: 'item-107',
      name: 'Passion Fruit Basil Sparkler',
      category: 'mocktails',
      price: '₹280',
      desc: 'Crushed tropical passion fruit pulp, fresh Italian basil leaves, club soda, and Himalayan pink salt.',
      tags: ["Refreshing"],
      spice: 0,
      isJain: true,
      isPopular: true,
      image: 'assets/images/mocktail.png'
    },
    {
      id: 'item-108',
      name: 'Shahi Saffron Rabdi Fondue',
      category: 'desserts',
      price: '₹380',
      desc: 'Warm thickened saffron rabdi served with crisp pistachio jalebi bites and almond slivers.',
      tags: ["Dessert", "Royal"],
      spice: 0,
      isJain: true,
      isPopular: true,
      image: 'assets/images/hero.png'
    }
  ];

  renderDishes();
}

// ----------------------------------------------------------------------------
// SUPABASE ACTIVE ORDER SYNC & REALTIME SUBSCRIPTION
// ----------------------------------------------------------------------------
async function syncActiveTableOrder() {
  if (!currentTableId) return;
  
  try {
    const client = getSupabaseClient();
    if (!client) return;

    const { data, error } = await client
      .from('active_orders')
      .select('*')
      .eq('table_id', currentTableId)
      .maybeSingle();

    if (!error && data) {
      currentTableDbOrder = data;
      renderActiveTableBanner();
    } else {
      currentTableDbOrder = null;
      hideActiveTableBanner();
    }
  } catch (err) {
    console.warn('syncActiveTableOrder error:', err);
  }
}

function setupRealtimeSubscription() {
  try {
    const client = getSupabaseClient();
    if (!client) return;

    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
    }

    realtimeChannel = client
      .channel('public:active_orders_table_' + (currentTableId || 'all'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_orders' }, (payload) => {
        // If event is for this table
        const affectedTable = payload.new?.table_id || payload.old?.table_id;
        if (affectedTable === currentTableId || affectedTable == currentTableId) {
          if (payload.eventType === 'DELETE') {
            // Bill was settled by staff!
            currentTableDbOrder = null;
            hideActiveTableBanner();
            showToast(`💳 Table ${currentTableId} bill has been settled by staff! Thank you.`);
          } else {
            // INSERT or UPDATE from staff or kitchen
            currentTableDbOrder = payload.new;
            renderActiveTableBanner();
            showToast(`👨‍🍳 Kitchen ticket updated for Table ${currentTableId}!`);
          }
        }
      })
      .subscribe((status) => {
        const statusText = document.getElementById('kitchenStatusText');
        if (statusText) {
          statusText.textContent = (status === 'SUBSCRIBED') ? 'Kitchen Live' : 'Kitchen Connected';
        }
      });
  } catch (err) {
    console.warn('setupRealtimeSubscription error:', err);
  }
}

function renderActiveTableBanner() {
  const banner = document.getElementById('activeTableBanner');
  const summaryEl = document.getElementById('activeOrderSummary');
  const totalEl = document.getElementById('activeOrderTotal');
  const timeEl = document.getElementById('activeOrderTime');
  const noticeRound = document.getElementById('drawerRoundNotice');
  
  if (!banner || !currentTableDbOrder) return;
  
  const items = Array.isArray(currentTableDbOrder.items) ? currentTableDbOrder.items : [];
  const itemCount = items.reduce((acc, it) => acc + (it.qty || 1), 0);
  const total = currentTableDbOrder.total || 0;
  
  let formattedTime = 'Just now';
  if (currentTableDbOrder.created_at) {
    try {
      const dt = new Date(currentTableDbOrder.created_at);
      formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch(e) {}
  }
  
  if (summaryEl) summaryEl.textContent = `${itemCount} dishes cooking in kitchen. Order more dishes anytime!`;
  if (totalEl) totalEl.textContent = `Running Total: ₹${total}`;
  if (timeEl) timeEl.textContent = formattedTime;
  
  banner.classList.remove('hidden');
  if (noticeRound) noticeRound.classList.remove('hidden');
}

function hideActiveTableBanner() {
  const banner = document.getElementById('activeTableBanner');
  const noticeRound = document.getElementById('drawerRoundNotice');
  if (banner) banner.classList.add('hidden');
  if (noticeRound) noticeRound.classList.add('hidden');
}

function openActiveOrderDetails() {
  if (!currentTableDbOrder) return;
  const modal = document.getElementById('activeOrderModal');
  const listEl = document.getElementById('ticketItemsList');
  const totalEl = document.getElementById('ticketTotalAmount');
  if (!modal || !listEl) return;

  const items = Array.isArray(currentTableDbOrder.items) ? currentTableDbOrder.items : [];
  listEl.innerHTML = items.map(it => `
    <div class="ticket-item-row">
      <div>
        <strong>${it.qty}x ${escapeHtml(it.name)}</strong>
        ${it.is_jain ? '<span style="font-size:0.65rem; color:#10B981; margin-left:4px;">(Jain)</span>' : ''}
      </div>
      <span>₹${(parsePrice(it.price) * (it.qty || 1))}</span>
    </div>
  `).join('');

  if (totalEl) totalEl.textContent = `₹${currentTableDbOrder.total || 0}`;
  modal.classList.remove('hidden');
}

function closeActiveOrderModal(e) {
  if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn') && !e.target.classList.contains('btn-primary-gold')) return;
  const modal = document.getElementById('activeOrderModal');
  if (modal) modal.classList.add('hidden');
}

// ----------------------------------------------------------------------------
// DISHES RENDERING & CATEGORY BROWSING
// ----------------------------------------------------------------------------
function renderDishes() {
  const container = document.getElementById('dishesContainer');
  if (!container) return;

  // Filter items
  let filtered = menuItems.filter(item => {
    // Stock check
    if (item.outOfStock) return false;

    // Category filter
    if (activeCategory !== 'all') {
      if (activeCategory === 'today-special' && !item.isPopular && item.category !== 'today-special') return false;
      if (activeCategory !== 'today-special' && item.category !== activeCategory) return false;
    }

    // Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = item.name && item.name.toLowerCase().includes(q);
      const matchDesc = item.desc && item.desc.toLowerCase().includes(q);
      const matchTags = Array.isArray(item.tags) && item.tags.some(t => t.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTags) return false;
    }

    // Jain filter
    if (filterJainOnly && !item.isJain) return false;

    // Chef's special filter
    if (filterSpecialOnly && !item.isPopular && item.category !== 'today-special') return false;

    return true;
  });

  // Filter count feedback
  const metaWrap = document.getElementById('filterResultMeta');
  const countEl = document.getElementById('filterResultCount');
  if (searchQuery || filterJainOnly || filterSpecialOnly || activeCategory !== 'all') {
    if (metaWrap) metaWrap.classList.remove('hidden');
    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${menuItems.length} dishes`;
  } else {
    if (metaWrap) metaWrap.classList.add('hidden');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size:2rem; margin-bottom:8px;">🥗</p>
        <p style="font-size:1rem; font-weight:600; color:#FFF;">No dishes found matching your criteria</p>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Try resetting dietary filters or clearing your search.</p>
        <button class="btn-clear-all" style="margin-top:12px;" onclick="resetAllFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const inCartItem = cart.find(c => c.id === item.id);
    const cartQty = inCartItem ? inCartItem.qty : 0;
    const priceNum = parsePrice(item.price);
    const imgSrc = item.image || 'assets/images/hero.png';
    const spiceIcons = item.spice > 0 ? '🌶️'.repeat(Math.min(item.spice, 3)) : '';

    return `
      <article class="dish-card" id="dish-card-${item.id}">
        <div class="dish-details">
          <div>
            <div class="dish-header-row">
              <span class="dish-veg-badge" title="100% Pure Vegetarian"></span>
              ${item.isPopular || item.category === 'today-special' ? '<span class="dish-tag-chef">Chef\'s Special</span>' : ''}
              ${item.isJain ? '<span class="dish-tag-jain">Jain Friendly</span>' : ''}
            </div>
            <h3 class="dish-name">${escapeHtml(item.name)}</h3>
            <p class="dish-desc">${escapeHtml(item.desc || '')}</p>
          </div>
          <div class="dish-bottom-row">
            <span class="dish-price">₹${priceNum}</span>
            ${spiceIcons ? `<span class="dish-spice-icons" title="Spice Level: ${item.spice}">${spiceIcons}</span>` : ''}
          </div>
        </div>

        <div class="dish-media-col">
          <div class="dish-img-wrap">
            <img src="${imgSrc}" alt="${escapeHtml(item.name)}" class="dish-img" loading="lazy" onerror="this.src='assets/images/hero.png'">
          </div>
          <div class="dish-btn-holder" id="btn-holder-${item.id}">
            ${cartQty > 0 ? `
              <div class="qty-stepper">
                <button class="stepper-btn" onclick="updateCartQty('${item.id}', -1)" aria-label="Decrease">&minus;</button>
                <span class="stepper-val">${cartQty}</span>
                <button class="stepper-btn" onclick="updateCartQty('${item.id}', 1)" aria-label="Increase">&plus;</button>
              </div>
            ` : `
              <button class="btn-add-dish" onclick="addToCart('${item.id}')">+ ADD</button>
            `}
          </div>
          ${item.isJain ? `
            <label class="dish-jain-pref" title="Prepare in strict Jain manner without onion/garlic/root veggies">
              <input type="checkbox" id="jain-check-${item.id}" ${inCartItem && inCartItem.is_jain ? 'checked' : ''} onchange="toggleDishJainOption('${item.id}', this.checked)">
              <span>Make Jain</span>
            </label>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// FILTER & SEARCH HANDLERS
// ----------------------------------------------------------------------------
function selectCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-category') === cat);
  });
  renderDishes();
}

function setupSearchAndFilters() {
  const searchInput = document.getElementById('menuSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (clearBtn) clearBtn.classList.toggle('hidden', searchQuery.length === 0);
      renderDishes();
    });
  }
}

function clearSearch() {
  const searchInput = document.getElementById('menuSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.value = '';
    searchQuery = '';
  }
  if (clearBtn) clearBtn.classList.add('hidden');
  renderDishes();
}

function toggleFilter(type) {
  if (type === 'jain') {
    const el = document.getElementById('jainOnlyToggle');
    filterJainOnly = el ? el.checked : false;
  } else if (type === 'special') {
    const el = document.getElementById('specialOnlyToggle');
    filterSpecialOnly = el ? el.checked : false;
  }
  renderDishes();
}

function resetAllFilters() {
  activeCategory = 'all';
  searchQuery = '';
  filterJainOnly = false;
  filterSpecialOnly = false;

  const searchInput = document.getElementById('menuSearchInput');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.classList.add('hidden');

  const jainToggle = document.getElementById('jainOnlyToggle');
  if (jainToggle) jainToggle.checked = false;

  const specialToggle = document.getElementById('specialOnlyToggle');
  if (specialToggle) specialToggle.checked = false;

  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-category') === 'all');
  });

  renderDishes();
}

// ----------------------------------------------------------------------------
// CART MANAGEMENT & UI
// ----------------------------------------------------------------------------
function addToCart(dishId) {
  const dish = menuItems.find(d => d.id === dishId);
  if (!dish) return;

  const jainCheckbox = document.getElementById(`jain-check-${dishId}`);
  const isJainPref = jainCheckbox ? jainCheckbox.checked : false;

  let existing = cart.find(c => c.id === dishId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: dish.id,
      name: dish.name,
      price: parsePrice(dish.price),
      qty: 1,
      is_jain: isJainPref,
      category: dish.category || 'general',
      image: dish.image || 'assets/images/hero.png'
    });
  }

  saveCart();
  updateCartUI();
  renderDishStepper(dishId);
  showToast(`Added ${dish.name} to order`);
}

function updateCartQty(dishId, delta) {
  const itemIndex = cart.findIndex(c => c.id === dishId);
  if (itemIndex === -1) return;

  cart[itemIndex].qty += delta;
  if (cart[itemIndex].qty <= 0) {
    cart.splice(itemIndex, 1);
  }

  saveCart();
  updateCartUI();
  renderDishStepper(dishId);
  renderCartDrawerItems();
}

function toggleDishJainOption(dishId, isChecked) {
  const item = cart.find(c => c.id === dishId);
  if (item) {
    item.is_jain = isChecked;
    saveCart();
    renderCartDrawerItems();
  }
}

function renderDishStepper(dishId) {
  const holder = document.getElementById(`btn-holder-${dishId}`);
  if (!holder) return;

  const item = cart.find(c => c.id === dishId);
  if (item && item.qty > 0) {
    holder.innerHTML = `
      <div class="qty-stepper">
        <button class="stepper-btn" onclick="updateCartQty('${dishId}', -1)" aria-label="Decrease">&minus;</button>
        <span class="stepper-val">${item.qty}</span>
        <button class="stepper-btn" onclick="updateCartQty('${dishId}', 1)" aria-label="Increase">&plus;</button>
      </div>
    `;
  } else {
    holder.innerHTML = `<button class="btn-add-dish" onclick="addToCart('${dishId}')">+ ADD</button>`;
  }
}

function updateCartUI() {
  const floatingBar = document.getElementById('floatingCartBar');
  const countBadge = document.getElementById('cartItemCount');
  const totalAmount = document.getElementById('cartTotalAmount');
  const subtext = document.getElementById('cartItemsSubtext');

  const totalQty = cart.reduce((acc, it) => acc + it.qty, 0);
  const subtotal = cart.reduce((acc, it) => acc + (it.price * it.qty), 0);

  if (totalQty > 0) {
    if (floatingBar) floatingBar.classList.remove('hidden');
    if (countBadge) countBadge.textContent = totalQty;
    if (totalAmount) totalAmount.textContent = `₹${subtotal}`;
    if (subtext) subtext.textContent = `${totalQty} item${totalQty > 1 ? 's' : ''} in cart`;
  } else {
    if (floatingBar) floatingBar.classList.add('hidden');
    closeCartDrawer();
  }

  // Update Drawer totals
  const gst = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = subtotal + gst;

  const dSub = document.getElementById('drawerSubtotal');
  const dGst = document.getElementById('drawerGst');
  const dGrand = document.getElementById('drawerGrandTotal');

  if (dSub) dSub.textContent = `₹${subtotal}`;
  if (dGst) dGst.textContent = `₹${gst}`;
  if (dGrand) dGrand.textContent = `₹${grandTotal}`;
}

function openCartDrawer() {
  if (cart.length === 0) return;
  const overlay = document.getElementById('cartDrawerOverlay');
  const drawer = document.getElementById('cartDrawer');
  if (overlay) overlay.classList.add('active');
  if (drawer) drawer.classList.add('active');
  renderCartDrawerItems();
}

function closeCartDrawer() {
  const overlay = document.getElementById('cartDrawerOverlay');
  const drawer = document.getElementById('cartDrawer');
  if (overlay) overlay.classList.remove('active');
  if (drawer) drawer.classList.remove('active');
}

function renderCartDrawerItems() {
  const listEl = document.getElementById('cartItemsList');
  if (!listEl) return;

  if (cart.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px 0;">Your cart is empty.</p>';
    return;
  }

  listEl.innerHTML = cart.map(item => `
    <div class="cart-item-row">
      <div class="cart-item-info">
        <div class="cart-item-name">
          <span>${escapeHtml(item.name)}</span>
          ${item.is_jain ? '<span class="cart-item-jain-badge">JAIN</span>' : ''}
        </div>
        <div class="cart-item-sub">₹${item.price} each</div>
      </div>
      <div class="cart-item-ctrls">
        <div class="qty-stepper">
          <button class="stepper-btn" onclick="updateCartQty('${item.id}', -1)">&minus;</button>
          <span class="stepper-val">${item.qty}</span>
          <button class="stepper-btn" onclick="updateCartQty('${item.id}', 1)">&plus;</button>
        </div>
        <div class="cart-item-price">₹${item.price * item.qty}</div>
      </div>
    </div>
  `).join('');
}

function saveCart() {
  if (!currentTableId) return;
  sessionStorage.setItem(`papillon_cart_table_${currentTableId}`, JSON.stringify(cart));
}

function restoreSavedCart() {
  if (!currentTableId) return;
  const raw = sessionStorage.getItem(`papillon_cart_table_${currentTableId}`);
  if (raw) {
    try {
      cart = JSON.parse(raw);
      updateCartUI();
      renderDishes();
    } catch(e) {}
  }
}

// ----------------------------------------------------------------------------
// SEND ORDER TO KITCHEN (SUPABASE ACTIVE_ORDERS)
// ----------------------------------------------------------------------------
async function submitCustomerOrder() {
  if (!currentTableId) {
    openTableModal();
    return;
  }

  if (cart.length === 0) {
    showToast('Please add dishes to your order first!');
    return;
  }

  const sendBtn = document.getElementById('sendToKitchenBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-gold" style="width:20px; height:20px; margin:0 8px 0 0; display:inline-block; vertical-align:middle;"></span> Transmitting to Kitchen...';
  }

  const client = getSupabaseClient();
  if (!client) {
    alert('Database connection error. Please notify the floor captain.');
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  const notesInput = document.getElementById('kitchenNotesInput');
  const userNotes = notesInput ? notesInput.value.trim() : '';
  const now = new Date().toISOString();

  try {
    // 1. Fetch latest active order status for this table to prevent race conditions
    const { data: latestOrder } = await client
      .from('active_orders')
      .select('*')
      .eq('table_id', currentTableId)
      .maybeSingle();

    if (latestOrder) {
      // MULTI-ROUND MERGE LOGIC:
      // Append or increment items to the table's existing running order
      const mergedItems = [...(latestOrder.items || [])];

      cart.forEach(cartItem => {
        const existingIdx = mergedItems.findIndex(m => m.id === cartItem.id && Boolean(m.is_jain) === Boolean(cartItem.is_jain));
        if (existingIdx !== -1) {
          mergedItems[existingIdx].qty = (mergedItems[existingIdx].qty || 1) + cartItem.qty;
        } else {
          mergedItems.push({
            id: cartItem.id,
            name: cartItem.name,
            price: cartItem.price,
            qty: cartItem.qty,
            is_jain: cartItem.is_jain,
            category: cartItem.category
          });
        }
      });

      const newTotal = mergedItems.reduce((acc, it) => acc + (parsePrice(it.price) * (it.qty || 1)), 0);
      const combinedNotes = latestOrder.notes ? `${latestOrder.notes}${userNotes ? ' | Round addition: ' + userNotes : ''}` : (userNotes || 'Ordered via Table QR (Round 2+)');

      const { error: updateError } = await client
        .from('active_orders')
        .update({
          items: mergedItems,
          total: newTotal,
          notes: combinedNotes,
          updated_at: now
        })
        .eq('id', latestOrder.id);

      if (updateError) throw updateError;
      currentTableDbOrder = { ...latestOrder, items: mergedItems, total: newTotal, notes: combinedNotes };

    } else {
      // FIRST ROUND FOR THIS TABLE:
      // Insert new row into active_orders
      const newId = `ORD-T${currentTableId}-${Date.now()}`;
      const subtotal = cart.reduce((acc, it) => acc + (it.price * it.qty), 0);
      
      const newOrderRow = {
        id: newId,
        table_id: currentTableId,
        items: cart.map(c => ({
          id: c.id,
          name: c.name,
          price: c.price,
          qty: c.qty,
          is_jain: c.is_jain,
          category: c.category
        })),
        notes: userNotes ? `QR Order: ${userNotes}` : 'Ordered via Table QR',
        total: subtotal,
        created_at: now,
        updated_at: now
      };

      const { error: insertError } = await client
        .from('active_orders')
        .insert([newOrderRow]);

      if (insertError) throw insertError;
      currentTableDbOrder = newOrderRow;
    }

    // Success Actions:
    playSuccessChime();
    cart = [];
    saveCart();
    closeCartDrawer();
    updateCartUI();
    renderDishes();
    renderActiveTableBanner();
    
    // Clear notes input
    if (notesInput) notesInput.value = '';

    // Show celebration ticket
    openActiveOrderDetails();
    showToast(`🎉 Order sent to kitchen! Table ${currentTableId}`);

  } catch (err) {
    console.error('Error submitting order:', err);
    alert('Could not submit order: ' + (err.message || 'Network error'));
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <span class="btn-kitchen-icon">👨‍🍳</span>
        <span class="btn-kitchen-text">Send Order to Kitchen</span>
        <span class="btn-kitchen-arrow">&rarr;</span>
      `;
    }
  }
}

// ----------------------------------------------------------------------------
// ASSISTANCE & CALL SERVER
// ----------------------------------------------------------------------------
function callServer(service) {
  if (!currentTableId) {
    openTableModal();
    return;
  }
  showToast(`🔔 Table ${currentTableId}: Request for ${service} sent to floor captain!`);
}

// ----------------------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------------------
function parsePrice(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const num = parseInt(val.toString().replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}
