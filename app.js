// CONFIGURATION & GLOBAL VARIABLES
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz4U1wairujhzCftfXQ3-nv4QHMhIpEJcmfHGTMIfzXz1PuSTYgE-wvaZ6P1mthC4i0/exec";
let products = [];
let orders = [];
let returnedItems = [];
let cart = [];
let currentUser = "";
let html5QrCode = null;
let currentScanTarget = 'order'; // 'order' หรือ 'return'

// INITIALIZATION & LOGIN
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('loginDate').value = today;
  document.getElementById('orderDate').value = today;
  document.getElementById('returnDate').value = today;

  loadCartFromStorage();

  const savedUser = localStorage.getItem("app_user");
  if (savedUser) {
    currentUser = savedUser;
    document.getElementById('loginModal').classList.add('hidden');
    updateUserUI();
    loadInitialData();
  } else {
    document.getElementById('loginModal').classList.remove('hidden');
    updateStatusIndicator('offline', 'กรุณาล็อคอิน');
  }
});

function saveCartToStorage() {
  localStorage.setItem("app_cart", JSON.stringify(cart));
}

function loadCartFromStorage() {
  const savedCart = localStorage.getItem("app_cart");
  if (savedCart) {
    try {
      cart = JSON.parse(savedCart);
    } catch (e) {
      cart = [];
    }
  }
  renderCart();
}

function handleLogin(e) {
  e.preventDefault();
  const name = document.getElementById('loginUsername').value.trim();
  const date = document.getElementById('loginDate').value;

  if (!name) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อผู้เข้าใช้', 'warning');
    return;
  }

  currentUser = name;
  localStorage.setItem("app_user", currentUser);
  localStorage.setItem("app_login_date", date);

  document.getElementById('loginModal').classList.add('hidden');
  updateUserUI();

  Swal.fire({
    icon: 'success',
    title: 'ยินดีต้อนรับ',
    text: `สวัสดีคุณ ${currentUser}`,
    timer: 1500,
    showConfirmButton: false
  });

  loadInitialData();
}

function handleLogout() {
  Swal.fire({
    title: 'ยืนยันการออกจากระบบ?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ตกลง',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ea580c'
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem("app_user");
      currentUser = "";
      document.getElementById('loginModal').classList.remove('hidden');
      updateUserUI();
      updateStatusIndicator('offline', 'ออฟไลน์');
    }
  });
}

function updateUserUI() {
  const loginDate = localStorage.getItem("app_login_date") || new Date().toISOString().split('T')[0];
  if (currentUser) {
    document.getElementById('userDisplayInfo').innerHTML = `<i class="fa-regular fa-user mr-1"></i> ${currentUser}`;
    document.getElementById('loginDateDisplay').innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> ${loginDate}`;
  } else {
    document.getElementById('userDisplayInfo').innerHTML = `<i class="fa-regular fa-user mr-1"></i>ยังไม่ได้เข้าสู่ระบบ`;
    document.getElementById('loginDateDisplay').innerHTML = `<i class="fa-regular fa-calendar mr-1"></i>-`;
  }
}

function updateStatusIndicator(state, message) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  dot.className = "w-2.5 h-2.5 rounded-full pulse-dot";
  text.innerText = message;

  if (state === 'online') {
    dot.classList.add('bg-emerald-500');
  } else if (state === 'offline') {
    dot.classList.add('bg-rose-500');
  } else {
    dot.classList.add('bg-amber-400');
  }
}

async function testConnection() {
  updateStatusIndicator('loading', 'กำลังทดสอบ...');
  Swal.fire({
    title: 'กำลังทดสอบการเชื่อมต่อ...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=test`);
    const json = await res.json();
    Swal.close();

    if (json.status === 'ok') {
      updateStatusIndicator('online', 'ออนไลน์');
      Swal.fire('เชื่อมต่อสำเร็จ', json.message || 'เชื่อมต่อกับ Google Sheet เรียบร้อยแล้ว', 'success');
    } else {
      updateStatusIndicator('offline', 'ออฟไลน์');
      Swal.fire('เกิดข้อผิดพลาด', json.message || 'ไม่สามารถเชื่อมต่อได้', 'error');
    }
  } catch (err) {
    Swal.close();
    updateStatusIndicator('offline', 'ออฟไลน์');
    Swal.fire('ข้อผิดพลาดเครือข่าย', 'ไม่สามารถเชื่อมต่อกับ Apps Script Web App ได้', 'error');
  }
}

async function loadInitialData() {
  updateStatusIndicator('loading', 'กำลังโหลดข้อมูล...');
  try {
    const [prodRes, orderRes, returnRes] = await Promise.all([
      fetch(`${APPS_SCRIPT_URL}?action=getProducts`),
      fetch(`${APPS_SCRIPT_URL}?action=getOrders`),
      fetch(`${APPS_SCRIPT_URL}?action=getReturns`).catch(() => null)
    ]);

    const prodJson = await prodRes.json();
    const orderJson = await orderRes.json();

    if (prodJson.status === 'ok') {
      products = prodJson.data || [];
    }

    if (orderJson.status === 'ok') {
      orders = orderJson.data || [];
    }

    if (returnRes) {
      const returnJson = await returnRes.json();
      if (returnJson.status === 'ok') {
        returnedItems = returnJson.data || [];
      }
    }

    updateStatusIndicator('online', 'ออนไลน์');
    renderProducts();
    renderPendingOrders();
    populateReturnProductOptions();
    renderReturnedItems();
  } catch (err) {
    console.error("Fetch error:", err);
    updateStatusIndicator('offline', 'ออฟไลน์ (ใช้ข้อมูลจำลอง)');
    
    if (products.length === 0) {
      products = [
        { id: 'P001', name: 'กระดาษ A4 80gs', stock: 43, unit: 'รีม', barcode: '8851234560010' },
        { id: 'P002', name: 'ปากกาลูกลื่น สีน้ำ', stock: 12, unit: 'แพ็ค', barcode: '8851234560027' },
        { id: 'P003', name: 'แฟ้มห่วง 2 นิ้ว', stock: 0, unit: 'แฟ้ม', barcode: '8851234560034' },
        { id: 'P004', name: 'ตลับหมึก HP Las', stock: 5, unit: 'กล่อง', barcode: '8851234560041' },
        { id: 'P005', name: 'น้ำยาทำความสะอาด', stock: 8, unit: 'แกลลอน', barcode: '8851234560058' }
      ];
    }
    renderProducts();
    renderPendingOrders();
    populateReturnProductOptions();
    renderReturnedItems();
  }
}

function switchTab(tabName) {
  const orderTab = document.getElementById('orderTab');
  const historyTab = document.getElementById('historyTab');
  const returnTab = document.getElementById('returnTab');

  const btn1 = document.getElementById('tabBtn1');
  const btn2 = document.getElementById('tabBtn2');
  const btn3 = document.getElementById('tabBtn3');

  orderTab.classList.add('hidden');
  historyTab.classList.add('hidden');
  returnTab.classList.add('hidden');

  btn1.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 text-slate-600 hover:text-slate-900";
  btn2.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 text-slate-600 hover:text-slate-900";
  btn3.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 text-slate-600 hover:text-rose-600";

  if (tabName === 'orderTab') {
    orderTab.classList.remove('hidden');
    btn1.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow";
  } else if (tabName === 'returnTab') {
    returnTab.classList.remove('hidden');
    btn3.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow";
    populateReturnProductOptions();
    renderReturnedItems();
  } else {
    historyTab.classList.remove('hidden');
    btn2.className = "flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow";
    renderPendingOrders();
  }
}

// ==================== RETURN PRODUCTS SYSTEM ==================== //

function populateReturnProductOptions() {
  const datalist = document.getElementById('returnProductList');
  if (!datalist) return;

  datalist.innerHTML = "";
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = `[${p.id}] ${p.name}`;
    if (p.barcode) {
      opt.label = `บาร์โค้ด: ${p.barcode}`;
    }
    datalist.appendChild(opt);
  });
}

function matchProductFromInput(inputVal) {
  if (!inputVal) return null;
  const val = inputVal.trim().toLowerCase();

  // 1. ลองหาจากรูปแบบ "[P001] ชื่อสินค้า"
  let match = products.find(p => `[${p.id}] ${p.name}`.toLowerCase() === val);
  if (match) return match;

  // 2. ลองหาตรงๆ จาก ID, Name หรือ Barcode
  match = products.find(p => 
    (p.id && p.id.toString().toLowerCase() === val) ||
    (p.name && p.name.toLowerCase() === val) ||
    (p.barcode && p.barcode.toString().toLowerCase() === val)
  );
  if (match) return match;

  // 3. ลองหาจากการมีคำบางส่วนใน ID หรือ Barcode
  match = products.find(p => 
    (p.id && val.includes(p.id.toString().toLowerCase())) ||
    (p.barcode && val.includes(p.barcode.toString().toLowerCase()))
  );

  return match || null;
}

async function submitReturnProduct(e) {
  e.preventDefault();

  const returnDate = document.getElementById('returnDate').value;
  const branch = document.getElementById('returnBranchSelect').value;
  const productInputValue = document.getElementById('returnProductInput').value;
  const qty = Number(document.getElementById('returnQty').value);
  const reason = document.getElementById('returnReason').value.trim();

  if (!productInputValue) {
    Swal.fire('แจ้งเตือน', 'กรุณาระบุหรือเลือกสินค้าที่ต้องการส่งคืน', 'warning');
    return;
  }

  const prod = matchProductFromInput(productInputValue);
  const productId = prod ? prod.id : productInputValue;
  const prodName = prod ? prod.name : productInputValue;

  const confirm = await Swal.fire({
    title: 'ยืนยันการบันทึกคืนสินค้า?',
    html: `
      <div class="text-left text-sm space-y-1">
        <p><b>สินค้า:</b> ${prodName}</p>
        <p><b>รหัสสินค้า:</b> ${productId}</p>
        <p><b>วันที่คืน:</b> ${returnDate}</p>
        <p><b>สาขา:</b> ${branch}</p>
        <p><b>จำนวน:</b> ${qty} ชิ้น</p>
        <p><b>สาเหตุ:</b> ${reason}</p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันส่งคืน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e11d48'
  });

  if (!confirm.isConfirmed) return;

  Swal.fire({
    title: 'กำลังบันทึก...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const payload = {
    action: 'addReturn',
    date: returnDate,
    branch: branch,
    productId: productId,
    productName: prodName,
    qty: qty,
    reason: reason,
    user: currentUser
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    Swal.close();

    if (json.status === 'ok') {
      Swal.fire('บันทึกสำเร็จ', 'บันทึกรายการสินค้าคืนที่มีปัญหาเรียบร้อยแล้ว', 'success');
      document.getElementById('returnForm').reset();
      document.getElementById('returnDate').value = new Date().toISOString().split('T')[0];
      loadInitialData();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', json.message || 'ไม่สามารถบันทึกได้', 'error');
    }
  } catch (err) {
    Swal.close();
    console.error("Return submit error:", err);
    
    returnedItems.unshift({
      date: returnDate,
      branch: branch,
      productId: productId,
      productName: prodName,
      qty: qty,
      reason: reason,
      user: currentUser
    });

    document.getElementById('returnForm').reset();
    document.getElementById('returnDate').value = new Date().toISOString().split('T')[0];
    Swal.fire('บันทึกสำเร็จ (โหมดจำลอง)', 'บันทึกข้อมูลคืนสินค้าเรียบร้อยแล้ว', 'info');
    renderReturnedItems();
  }
}

function renderReturnedItems() {
  const tbody = document.getElementById('returnedProductsTbody');
  tbody.innerHTML = "";

  document.getElementById('returnCountBadge').innerText = `${returnedItems.length} รายการ`;

  if (returnedItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-3xl mb-2 opacity-50"></i>
          <p class="text-sm font-medium">ยังไม่มีประวัติการแจ้งคืนสินค้า</p>
        </td>
      </tr>
    `;
    return;
  }

  returnedItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/80 transition";
    tr.innerHTML = `
      <td class="p-3.5 whitespace-nowrap text-xs">${item.date || '-'}</td>
      <td class="p-3.5 text-xs font-semibold">${item.branch || '-'}</td>
      <td class="p-3.5 text-xs font-bold text-slate-800">${item.productName || item.productId}</td>
      <td class="p-3.5 text-xs text-center font-bold text-rose-600">${item.qty}</td>
      <td class="p-3.5 text-xs text-slate-600 max-w-xs truncate" title="${item.reason}">${item.reason}</td>
      <td class="p-3.5 text-xs text-slate-500">${item.user || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== ORDER PRODUCTS SYSTEM ==================== //

function renderProducts() {
  const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
  const grid = document.getElementById('productGrid');
  grid.innerHTML = "";

  const filtered = products.filter(p => 
    (p.id && p.id.toString().toLowerCase().includes(keyword)) ||
    (p.name && p.name.toLowerCase().includes(keyword)) ||
    (p.barcode && p.barcode.toLowerCase().includes(keyword))
  );

  document.getElementById('productCountBadge').innerText = `${filtered.length} รายการ`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        <i class="fa-solid fa-box-open text-4xl mb-2 opacity-60"></i>
        <p class="text-sm font-medium">ไม่พบสินค้าตรงตามคีย์เวิร์ด</p>
      </div>
    `;
    return;
  }

  filtered.forEach(prod => {
    const isOutOfStock = (Number(prod.stock) <= 0);
    const card = document.createElement('div');
    card.className = "product-card p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between";
    
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-center mb-2.5 gap-1.5">
          <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/50">${prod.id}</span>
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isOutOfStock ? 'bg-rose-50 text-rose-600 border border-rose-200/50' : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'}">
            ${isOutOfStock ? 'สต็อก: 0' : 'คงเหลือ: ' + prod.stock + ' ' + (prod.unit || 'ชิ้น')}
          </span>
        </div>
        <h4 class="font-bold text-slate-800 text-sm line-clamp-2 mb-1.5 leading-snug">${prod.name}</h4>
        ${prod.barcode ? `<p class="text-[11px] font-mono text-slate-400 mb-3.5 flex items-center gap-1"><i class="fa-solid fa-barcode"></i> ${prod.barcode}</p>` : '<div class="mb-3.5"></div>'}
      </div>
      <button onclick="addToCart('${prod.id}')" 
        class="w-full py-2 px-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition flex items-center justify-center gap-1.5 active:scale-95">
        <i class="fa-solid fa-plus"></i> เพิ่มลงตะกร้า
      </button>
    `;
    grid.appendChild(card);
  });
}

function addToCart(prodId) {
  const prod = products.find(p => p.id.toString() === prodId.toString());
  if (!prod) return;

  const existing = cart.find(c => c.id.toString() === prodId.toString());
  if (existing) {
    existing.qty += 1;
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: `เพิ่มจำนวน "${prod.name}" (${existing.qty} ${prod.unit || 'ชิ้น'})`,
      showConfirmButton: false,
      timer: 1500
    });
  } else {
    cart.push({
      id: prod.id,
      name: prod.name,
      qty: 1,
      unit: prod.unit || 'ชิ้น',
      stock: prod.stock
    });
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `เพิ่ม "${prod.name}" ลงในตะกร้าแล้ว`,
      showConfirmButton: false,
      timer: 1500
    });
  }

  saveCartToStorage();
  renderCart();
}

function updateCartQty(prodId, delta) {
  const item = cart.find(c => c.id.toString() === prodId.toString());
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(c => c.id.toString() !== prodId.toString());
  }
  saveCartToStorage();
  renderCart();
}

function setCartQty(prodId, value) {
  const item = cart.find(c => c.id.toString() === prodId.toString());
  if (!item) return;

  const newQty = parseInt(value, 10);
  if (isNaN(newQty) || newQty <= 0) {
    cart = cart.filter(c => c.id.toString() !== prodId.toString());
  } else {
    item.qty = newQty;
  }
  saveCartToStorage();
  renderCart();
}

function removeFromCart(prodId) {
  cart = cart.filter(c => c.id.toString() !== prodId.toString());
  saveCartToStorage();
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  saveCartToStorage();
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartItemsList');
  list.innerHTML = "";

  let totalItems = 0;
  const cartBadge = document.getElementById('cartBadge');

  if (cart.length === 0) {
    list.innerHTML = `
      <div class="py-8 text-center text-slate-400">
        <i class="fa-solid fa-basket-shopping text-3xl mb-2 opacity-40"></i>
        <p class="text-xs font-medium">ไม่มีสินค้าในตะกร้า</p>
      </div>
    `;
    document.getElementById('cartTotalItems').innerText = "0 ชิ้น";
    if (cartBadge) cartBadge.classList.add('hidden');
    return;
  }

  cart.forEach(item => {
    totalItems += item.qty;
    const div = document.createElement('div');
    div.className = "p-3 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between gap-2.5";
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <h5 class="font-bold text-xs text-slate-800 truncate">${item.name}</h5>
        <p class="text-[11px] font-mono text-slate-400">${item.id}</p>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button onclick="updateCartQty('${item.id}', -1)" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition">-</button>
        <input type="number" 
               min="1" 
               value="${item.qty}" 
               onchange="setCartQty('${item.id}', this.value)"
               class="w-10 h-6 text-center text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
        <button onclick="updateCartQty('${item.id}', 1)" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition">+</button>
      </div>

      <button onclick="removeFromCart('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1 transition shrink-0">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    list.appendChild(div);
  });

  document.getElementById('cartTotalItems').innerText = `${totalItems} ชิ้น`;
  if (cartBadge) {
    cartBadge.innerText = cart.length;
    cartBadge.classList.remove('hidden');
  }
}

async function submitOrder() {
  if (cart.length === 0) {
    Swal.fire('ตะกร้าว่างเปล่า', 'กรุณาเลือกสินค้าก่อนทำการสั่งซื้อ', 'warning');
    return;
  }

  const orderDate = document.getElementById('orderDate').value;
  const branch = document.getElementById('branchSelect').value;
  const deliveryDays = document.getElementById('deliveryDays').value || "1";

  if (!orderDate) {
    Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกวันที่สั่งสินค้า', 'warning');
    return;
  }

  const confirm = await Swal.fire({
    title: 'ยืนยันการสั่งสินค้า?',
    html: `สั่งสินค้า <b>${cart.length}</b> รายการ <br>ส่งไปยังสาขา: <b>${branch}</b> <br>ระยะเวลาจัดส่ง: <b>${deliveryDays} วัน</b>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันสั่งซื้อ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ea580c'
  });

  if (!confirm.isConfirmed) return;

  Swal.fire({
    title: 'กำลังบันทึกข้อมูล...',
    text: 'กรุณารอสักครู่ ระบบกำลังส่งข้อมูลไปยัง Google Sheet',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const payload = {
    action: 'addOrder',
    date: orderDate,
    branch: branch,
    deliveryDays: deliveryDays,
    user: currentUser,
    items: cart.map(item => ({
      id: item.id,
      name: item.name,
      qty: item.qty
    }))
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    Swal.close();

    if (json.status === 'ok') {
      Swal.fire('สำเร็จ', 'บันทึกการสั่งซื้อเรียบร้อยแล้ว!', 'success');
      cart = [];
      saveCartToStorage();
      renderCart();
      loadInitialData();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', json.message || 'ไม่สามารถบันทึกได้', 'error');
    }
  } catch (err) {
    Swal.close();
    console.error("Submit order error:", err);
    Swal.fire('บันทึกสำเร็จ (โหมดจำลอง)', 'ระบบบันทึกจำลองฝั่งหน้าจอเรียบร้อย', 'info');
    cart.forEach(c => {
      const p = products.find(x => x.id.toString() === c.id.toString());
      if (p) p.stock = Math.max(0, Number(p.stock) - c.qty);
      orders.unshift({
        row: orders.length + 2,
        date: orderDate,
        branch: branch,
        deliveryDays: deliveryDays,
        id: c.id,
        name: c.name,
        qty: c.qty,
        status: 'รอส่งของ',
        timestamp: new Date().toLocaleString('th-TH'),
        user: currentUser
      });
    });
    cart = [];
    saveCartToStorage();
    renderCart();
    renderProducts();
    renderPendingOrders();
  }
}

function renderPendingOrders() {
  const tbody = document.getElementById('pendingOrdersTbody');
  tbody.innerHTML = "";

  const pending = orders.filter(o => o.status !== 'ส่งแล้ว');
  document.getElementById('pendingBadge').innerText = `${pending.length} รายการ`;

  if (pending.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400">
          <i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500"></i>
          <p class="text-sm font-medium">ไม่มีรายการค้างส่งในขณะนี้</p>
        </td>
      </tr>
    `;
    return;
  }

  pending.forEach(ord => {
    const isPartial = ord.status && ord.status.includes('ส่งแล้วบางส่วน');
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/80 transition";
    tr.innerHTML = `
      <td class="p-3.5 whitespace-nowrap">${ord.date || '-'}</td>
      <td class="p-3.5 font-medium text-slate-800">${ord.branch || 'โชว์รูม'}</td>
      <td class="p-3.5 font-mono text-xs text-slate-500">${ord.id}</td>
      <td class="p-3.5 font-bold text-slate-800">${ord.name}</td>
      <td class="p-3.5 text-center font-bold text-orange-600">${ord.qty}</td>
      <td class="p-3.5 text-center font-semibold text-slate-700">${ord.deliveryDays || '1'} วัน</td>
      <td class="p-3.5 text-center">
        <span class="px-2.5 py-1 text-xs font-bold rounded-full ${isPartial ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}">
          ${ord.status}
        </span>
      </td>
      <td class="p-3.5 text-center">
        <button onclick="markAsDelivered(${ord.row})" 
          class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center justify-center gap-1 mx-auto active:scale-95">
          <i class="fa-solid fa-truck-ramp-box"></i> ส่งของตามจริง
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function markAsDelivered(rowNumber) {
  const ord = orders.find(o => o.row === rowNumber);
  if (!ord) return;

  const { value: deliveredQty } = await Swal.fire({
    title: 'จัดส่งสินค้าตามจำนวนจริง',
    html: `
      <div class="text-left text-sm space-y-2 mb-3">
        <p><b>สินค้า:</b> ${ord.name}</p>
        <p><b>จำนวนที่สั่งค้างส่ง:</b> <span class="text-orange-600 font-bold">${ord.qty}</span></p>
      </div>
    `,
    input: 'number',
    inputLabel: 'ระบุจำนวนที่จัดส่งจริงในรอบนี้',
    inputValue: ord.qty,
    inputAttributes: {
      min: 1,
      max: ord.qty,
      step: 1
    },
    showCancelButton: true,
    confirmButtonText: 'บันทึกการส่งของ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
    inputValidator: (value) => {
      const val = Number(value);
      if (!value || val <= 0) {
        return 'กรุณากรอกจำนวนที่ถูกต้อง (มากกว่า 0)';
      }
      if (val > ord.qty) {
        return `จำนวนส่งจริงต้องไม่เกินจำนวนที่สั่ง (${ord.qty})`;
      }
    }
  });

  if (!deliveredQty) return;

  const actualQty = Number(deliveredQty);
  const remainingQty = ord.qty - actualQty;
  const isFullyDelivered = remainingQty === 0;
  const newStatus = isFullyDelivered ? 'ส่งแล้ว' : `ส่งแล้วบางส่วน (คงเหลือ ${remainingQty})`;

  Swal.fire({
    title: 'กำลังอัปเดตสถานะ...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateStatus',
        row: rowNumber,
        status: newStatus,
        deliveredQty: actualQty,
        remainingQty: remainingQty
      })
    });

    const json = await res.json();
    Swal.close();

    if (json.status === 'ok') {
      Swal.fire('อัปเดตสำเร็จ', `ส่งสินค้าเรียบร้อย ${actualQty} ชิ้น ${remainingQty > 0 ? `(ค้างส่งอีก ${remainingQty} ชิ้น)` : ''}`, 'success');
      loadInitialData();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', json.message || 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    Swal.close();
    console.error("Update status error:", err);
    if (isFullyDelivered) {
      ord.status = 'ส่งแล้ว';
    } else {
      ord.qty = remainingQty;
      ord.status = `ส่งแล้วบางส่วน (คงเหลือ ${remainingQty})`;
    }
    Swal.fire('อัปเดตสำเร็จ (โหมดจำลอง)', `ส่งสินค้าเรียบร้อย ${actualQty} ชิ้น`, 'info');
    renderPendingOrders();
  }
}

function openHistoryPopup() {
  const tbody = document.getElementById('fullHistoryTbody');
  tbody.innerHTML = "";

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400">ยังไม่มีประวัติการสั่งซื้อ</td>
      </tr>
    `;
  } else {
    orders.forEach(ord => {
      const isDone = (ord.status === 'ส่งแล้ว');
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-xs whitespace-nowrap">${ord.date || '-'}</td>
        <td class="p-3 text-xs font-semibold">${ord.branch || 'โชว์รูม'}</td>
        <td class="p-3 text-xs font-mono text-slate-500">${ord.id}</td>
        <td class="p-3 text-xs font-bold text-slate-800">${ord.name}</td>
        <td class="p-3 text-xs text-center font-bold text-orange-600">${ord.qty}</td>
        <td class="p-3 text-xs text-center text-slate-600">${ord.deliveryDays || '1'} วัน</td>
        <td class="p-3 text-xs text-center">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
            ${ord.status}
          </span>
        </td>
        <td class="p-3 text-xs text-slate-500">${ord.user || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('historyModal').classList.remove('hidden');
}

function closeHistoryPopup() {
  document.getElementById('historyModal').classList.add('hidden');
}

function exportToExcel() {
  if (orders.length === 0) {
    Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายการสั่งซื้อสำหรับส่งออก Excel', 'warning');
    return;
  }

  const excelData = orders.map((o, idx) => ({
    "ลำดับ": idx + 1,
    "วันที่": o.date || '',
    "สาขา": o.branch || '',
    "รหัสสินค้า": o.id || '',
    "ชื่อสินค้า": o.name || '',
    "จำนวนที่สั่ง": o.qty || 0,
    "ระยะเวลาจัดส่ง (วัน)": o.deliveryDays || 1,
    "สถานะ": o.status || '',
    "ผู้สั่งซื้อ": o.user || '',
    "เวลาบันทึก": o.timestamp || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "รายการสั่งซื้อ");

  XLSX.writeFile(workbook, `รายการสั่งซื้อ_${new Date().toISOString().split('T')[0]}.xlsx`);
  Swal.fire('ดาวน์โหลดสำเร็จ', 'ไฟล์ Excel ถูกดาวน์โหลดลงเครื่องแล้ว', 'success');
}

function exportToPDF() {
  if (orders.length === 0) {
    Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายการสั่งซื้อสำหรับส่งออก PDF', 'warning');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Report: Orders and Returns History", 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated Date: ${new Date().toLocaleDateString('th-TH')}`, 14, 22);

  const tableRows = orders.map((o, idx) => [
    idx + 1,
    o.date || '-',
    o.branch || 'โชว์รูม',
    o.id || '-',
    o.name || '-',
    o.qty || 0,
    o.deliveryDays || 1,
    o.status || '-'
  ]);

  doc.autoTable({
    startY: 28,
    head: [['#', 'Date', 'Branch', 'Code', 'Product Name', 'Qty', 'Days', 'Status']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [234, 88, 12] },
    styles: { fontSize: 9 }
  });

  doc.save(`รายงานการสั่งซื้อ_${new Date().toISOString().split('T')[0]}.pdf`);
  Swal.fire('ดาวน์โหลดสำเร็จ', 'ไฟล์ PDF ถูกดาวน์โหลดลงเครื่องเรียบร้อย', 'success');
}

function openScannerModal(target = 'order') {
  currentScanTarget = target;
  document.getElementById('scannerModal').classList.remove('hidden');
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  const config = { 
    fps: 10, 
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      return {
        width: Math.floor(minEdge * 0.75),
        height: Math.floor(minEdge * 0.75)
      };
    },
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      if (currentScanTarget === 'return') {
        const prod = matchProductFromInput(decodedText);
        if (prod) {
          document.getElementById('returnProductInput').value = `[${prod.id}] ${prod.name}`;
        } else {
          document.getElementById('returnProductInput').value = decodedText;
        }
      } else {
        document.getElementById('searchInput').value = decodedText;
        renderProducts();
      }
      closeScannerModal();
      Swal.fire({
        icon: 'success',
        title: 'สแกนสำเร็จ',
        text: `รหัส/บาร์โค้ด: ${decodedText}`,
        timer: 1200,
        showConfirmButton: false
      });
    },
    (errorMessage) => {}
  ).catch(err => {
    console.error("Camera error:", err);
    Swal.fire({
      icon: 'error',
      title: 'กล้องไม่พร้อมใช้งาน',
      text: 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตสิทธิ์การใช้งานกล้อง และใช้งานผ่านโปรโตคอล HTTPS'
    });
    closeScannerModal();
  });
}

function closeScannerModal() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      document.getElementById('scannerModal').classList.add('hidden');
    }).catch(() => {
      document.getElementById('scannerModal').classList.add('hidden');
    });
  } else {
    document.getElementById('scannerModal').classList.add('hidden');
  }
}
