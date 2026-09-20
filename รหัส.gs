/**
 * ระบบสั่งของและคืนของ (Stock Ordering & Returns System)
 * Google Apps Script Backend (Code.gs)
 */

const SPREADSHEET_ID = "1RPLQhGXLHrQsURWP1GNOe5M2nZTmPQoT1PC_qf3Iz2g";

/**
 * ===== LINE Notification Settings =====
 * ไม่ต้องแก้ค่าตรงนี้โดยตรง แต่ให้ไปตั้งค่าที่
 * "Project Settings" > "Script Properties" ใน Apps Script Editor แทน (ปลอดภัยกว่า):
 *   Key: LINE_CHANNEL_ACCESS_TOKEN  -> Channel Access Token ของ LINE Messaging API
 *   Key: LINE_TARGET_ID             -> userId หรือ groupId ปลายทางที่จะรับข้อความ
 */
function getLineProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * ส่งข้อความแจ้งเตือนเข้า LINE ผ่าน Messaging API (Push Message)
 * หมายเหตุ: LINE Notify ถูกปิดให้บริการไปแล้วตั้งแต่ 1 เม.ย. 2025
 * จึงต้องใช้ Messaging API ของ LINE Official Account แทน
 */
function sendLineNotify(message) {
  const token = ('w3UEGJwWUm8NNFcD3LAtp/2ldov0gikaup5l5wUxnKzhmnd4FGChBPo+GVY6qc11flRoveH+0KPX4kdFLuMq8TRzgndFVx9VcqShqbF5+2r99PYo12rtqRAdYagnuC3KLmcJlUj9TxoHd+5QdtnNcgdB04t89/1O/w1cDnyilFU=');
  const targetId =  ('C222bf21b00c812412eb79b1ac54b4dc2');

  if (!token || !targetId) {
    Logger.log('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_TARGET_ID ใน Script Properties');
    return;
  }

  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: targetId,
    messages: [{ type: 'text', text: message }]
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('LINE push error (' + code + '): ' + res.getContentText());
    }
  } catch (err) {
    Logger.log('LINE push exception: ' + err);
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    if (!action) {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('ระบบสั่งของและคืนของ')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    if (action === 'test') {
      initSheets();
      return respondJSON({
        status: 'ok',
        message: 'เชื่อมต่อกับ Google Sheet สำเร็จ!'
      });
    }

    if (action === 'getProducts') {
      const products = getProductsList();
      return respondJSON({
        status: 'ok',
        data: products
      });
    }

    if (action === 'getOrders') {
      const orders = getOrdersList();
      return respondJSON({
        status: 'ok',
        data: orders
      });
    }

    return respondJSON({
      status: 'error',
      message: 'Invalid GET action: ' + action
    });

  } catch (err) {
    return respondJSON({
      status: 'error',
      message: err.message || err.toString()
    });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJSON({ status: 'error', message: 'No payload received' });
    }

    const payload = JSON.parse(e.postData.contents);

    // ---- กรณีเป็น Webhook Event จาก LINE (เช่น ถูกดึงเข้ากลุ่ม หรือมีคนทักแชท) ----
    if (payload.events) {
      handleLineWebhookEvents(payload.events);
      return respondJSON({ status: 'ok' });
    }

    const action = payload.action;

    if (action === 'addOrder') {
      const result = createOrder(payload);
      return respondJSON({
        status: 'ok',
        data: result
      });
    }

    if (action === 'updateStatus') {
      const result = updateOrderStatus(
        payload.row, 
        payload.status, 
        payload.deliveredQty, 
        payload.remainingQty
      );
      return respondJSON({
        status: 'ok',
        data: result
      });
    }

    return respondJSON({
      status: 'error',
      message: 'Invalid POST action: ' + action
    });

  } catch (err) {
    return respondJSON({
      status: 'error',
      message: err.message || err.toString()
    });
  }
}

/**
 * รับ Event จาก LINE Webhook
 * - ถ้าบอทถูกเพิ่มเข้ากลุ่ม (หรือมีคนพิมพ์ข้อความในกลุ่มนั้น) จะบันทึก groupId
 *   ทับค่า LINE_TARGET_ID เดิมโดยอัตโนมัติ ทำให้แจ้งเตือนครั้งถัดไปเข้ากลุ่มใหม่ทันที
 */
function handleLineWebhookEvents(events) {
  events.forEach(event => {
    try {
      const source = event.source || {};
      if (source.type === 'group' && source.groupId) {
        PropertiesService.getScriptProperties().setProperty('LINE_TARGET_ID', source.groupId);
        Logger.log('✅ บันทึก groupId ใหม่เป็น LINE_TARGET_ID แล้ว: ' + source.groupId);
      } else if (source.type === 'user' && source.userId) {
        Logger.log('ได้รับ event จาก userId: ' + source.userId);
      }
    } catch (err) {
      Logger.log('Webhook event error: ' + err);
    }
  });
}

function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  let sheetProduct = ss.getSheetByName("สินค้า");
  if (!sheetProduct) {
    sheetProduct = ss.insertSheet("สินค้า");
    sheetProduct.appendRow(["รหัสสินค้า", "ชื่อสินค้า", "จำนวนคงเหลือ", "หน่วย", "บาร์โค้ด"]);
    sheetProduct.appendRow(["P001", "กระดาษ A4 80gs", 43, "รีม", "8851234560010"]);
    sheetProduct.appendRow(["P002", "ปากกาลูกลื่น สีน้ำ", 12, "แพ็ค", "8851234560027"]);
    sheetProduct.appendRow(["P003", "แฟ้มห่วง 2 นิ้ว", 0, "แฟ้ม", "8851234560034"]);
    sheetProduct.appendRow(["P004", "ตลับหมึก HP Las", 5, "กล่อง", "8851234560041"]);
    sheetProduct.appendRow(["P005", "น้ำยาทำความสะอาด", 8, "แกลลอน", "8851234560058"]);
  }

  let sheetOrder = ss.getSheetByName("รายการสั่งซื้อ");
  if (!sheetOrder) {
    sheetOrder = ss.insertSheet("รายการสั่งซื้อ");
    sheetOrder.appendRow([
      "วันที่", 
      "สาขา", 
      "รหัสสินค้า", 
      "ชื่อสินค้า", 
      "จำนวนที่สั่ง", 
      "จำนวนที่ส่งแล้ว", 
      "ระยะเวลาจัดส่ง (วัน)", 
      "สถานะ", 
      "เวลาบันทึก", 
      "ผู้บันทึก"
    ]);
  }
}

function getProductsList() {
  initSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("สินค้า");
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const products = [];
  for (let i = 1; i < data.length; i++) {
    products.push({
      id: data[i][0],
      name: data[i][1],
      stock: Number(data[i][2]),
      unit: data[i][3] || 'ชิ้น',
      barcode: data[i][4] ? String(data[i][4]) : ''
    });
  }
  return products;
}

function getOrdersList() {
  initSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("รายการสั่งซื้อ");
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  const orders = [];
  for (let i = 1; i < data.length; i++) {
    // รองรับทั้งโครงสร้างคอลัมน์แบบเก่าและแบบใหม่
    const isNewFormat = data[0].length >= 10; 
    
    orders.push({
      row: i + 1,
      date: data[i][0] ? Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "yyyy-MM-dd") : '',
      branch: data[i][1] || 'โชว์รูม',
      id: data[i][2],
      name: data[i][3],
      qty: Number(data[i][4]) || 0,
      deliveredQty: isNewFormat ? (Number(data[i][5]) || 0) : 0,
      deliveryDays: isNewFormat ? (Number(data[i][6]) || 1) : (Number(data[i][5]) || 1),
      status: isNewFormat ? (data[i][7] || 'รอส่งของ') : (data[i][6] || 'รอส่งของ'),
      timestamp: isNewFormat 
        ? (data[i][8] ? Utilities.formatDate(new Date(data[i][8]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : '')
        : (data[i][7] ? Utilities.formatDate(new Date(data[i][7]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : ''),
      user: isNewFormat ? (data[i][9] || '-') : (data[i][8] || '-')
    });
  }
  return orders.reverse();
}

function createOrder(payload) {
  initSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetOrder = ss.getSheetByName("รายการสั่งซื้อ");
  const sheetProduct = ss.getSheetByName("สินค้า");
  
  const orderDate = payload.date;
  const branch = payload.branch || 'โชว์รูม';
  const deliveryDays = payload.deliveryDays || 1;
  const user = payload.user || 'Unknown';
  const items = payload.items || [];
  const now = new Date();

  const prodData = sheetProduct.getDataRange().getValues();

  items.forEach(item => {
    // บันทึกรายการลงตารางสั่งซื้อ (จำนวนที่ส่งแล้วเริ่มต้นคือ 0)
    sheetOrder.appendRow([
      orderDate,
      branch,
      item.id,
      item.name,
      item.qty,
      0, // จำนวนที่ส่งแล้ว
      deliveryDays,
      'รอส่งของ',
      now,
      user
    ]);

    // ตัดสต็อกสินค้าในตารางสินค้า
    for (let r = 1; r < prodData.length; r++) {
      if (String(prodData[r][0]) === String(item.id)) {
        const currentStock = Number(prodData[r][2]) || 0;
        const newStock = currentStock - Number(item.qty);
        sheetProduct.getRange(r + 1, 3).setValue(newStock);
        break;
      }
    }
  });

  // ---- แจ้งเตือนไลน์เมื่อมีคำสั่งซื้อใหม่ ----
  try {
    const totalItems = items.length;
    const totalQty = items.reduce((sum, it) => sum + Number(it.qty || 0), 0);

    let lineMsg =
      '🛒 มีคำสั่งซื้อใหม่เข้ามา\n' +
      'วันที่: ' + orderDate + '\n' +
      'สาขา: ' + branch + '\n' +
      'ผู้สั่ง: ' + user + '\n' +
      'ระยะเวลาจัดส่ง: ' + deliveryDays + ' วัน\n' +
      'รายการสินค้า (' + totalItems + ' รายการ, รวม ' + totalQty + ' ชิ้น):\n';

    items.forEach(item => {
      lineMsg += '• ' + item.name + ' x ' + item.qty + '\n';
    });

    sendLineNotify(lineMsg.trim());
  } catch (notifyErr) {
    Logger.log('LINE notify error (createOrder): ' + notifyErr);
  }

  return { message: "บันทึกการสั่งซื้อสำเร็จ" };
}

function updateOrderStatus(rowNumber, newStatus, deliveredQty, remainingQty) {
  initSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetOrder = ss.getSheetByName("รายการสั่งซื้อ");

  if (!rowNumber || rowNumber <= 1) {
    throw new Error("Invalid row number for status update");
  }

  // ดึงหัวข้อคอลัมน์มาเช็คโครงสร้างแผ่นงาน
  const header = sheetOrder.getRange(1, 1, 1, sheetOrder.getLastColumn()).getValues()[0];
  const isNewFormat = header.length >= 10;

  const statusCol = isNewFormat ? 8 : 7;
  const qtyCol = 5;
  const deliveredQtyCol = isNewFormat ? 6 : null;

  // อัปเดตสถานะหลัก
  sheetOrder.getRange(rowNumber, statusCol).setValue(newStatus);

  // กรณีมีการระบุจำนวนส่งสินค้าจริง (Partial Delivery)
  if (deliveredQty !== undefined && deliveredQty !== null && deliveredQty > 0) {
    if (deliveredQtyCol) {
      const currentDelivered = Number(sheetOrder.getRange(rowNumber, deliveredQtyCol).getValue()) || 0;
      sheetOrder.getRange(rowNumber, deliveredQtyCol).setValue(currentDelivered + Number(deliveredQty));
    }
  }

  // หากกรณีเป็นการส่งบางส่วน แล้วมีจำนวนที่เหลืออยู่อัปเดต
  if (remainingQty !== undefined && remainingQty !== null && remainingQty > 0) {
    sheetOrder.getRange(rowNumber, qtyCol).setValue(remainingQty);
  }

  // ---- แจ้งเตือนไลน์เมื่อสถานะการส่งของเปลี่ยน ----
  try {
    const rowData = sheetOrder.getRange(rowNumber, 1, 1, sheetOrder.getLastColumn()).getValues()[0];
    const branch = rowData[1] || '-';
    const productName = rowData[3] || '-';
    const isFullyDelivered = String(newStatus) === 'ส่งแล้ว';
    const isPartial = String(newStatus).indexOf('ส่งแล้วบางส่วน') === 0;

    if (isFullyDelivered || isPartial) {
      let lineMsg =
        '📦 แจ้งเตือนสถานะการส่งของ\n' +
        'สาขา: ' + branch + '\n' +
        'สินค้า: ' + productName + '\n';

      if (isFullyDelivered) {
        lineMsg += 'ส่งแล้ว: ' + (deliveredQty || '-') + ' ชิ้น\n' +
          'สถานะ: ✅ ส่งครบแล้ว';
      } else {
        lineMsg += 'ส่งรอบนี้: ' + (deliveredQty || '-') + ' ชิ้น\n' +
          'คงเหลือรอส่ง: ' + (remainingQty || '-') + ' ชิ้น\n' +
          'สถานะ: 🚚 ส่งบางส่วน';
      }

      sendLineNotify(lineMsg);
    }
  } catch (notifyErr) {
    Logger.log('LINE notify error: ' + notifyErr);
  }

  return { 
    message: "อัปเดตสถานะเรียบร้อยแล้ว", 
    row: rowNumber, 
    status: newStatus 
  };
}
function testLineNotify() {
  sendLineNotify("ทดสอบ");
}