function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Sheet1');
    var data = JSON.parse(e.postData.contents);

    var priceMap = {
      "full-experience": "£40", "full-skinfade-beard-luxury": "£48", "i-cut-deluxe": "£55",
      "i-cut-royal": "£65", "senior-full-experience": "£35", "skin-fade": "£32",
      "scissor-cut": "£30", "classic-sbs": "£28", "hot-towel-shave": "£22",
      "clipper-cut": "£22", "senior-haircut": "£23", "young-gents": "£20",
      "young-gents-skin-fade": "£24", "full-facial": "£24", "beard-dyeing": "£24",
      "face-mask": "£12", "face-steam": "£12", "threading": "£10",
      "waxing": "£10", "shape-up-clean-up": "£20", "wash-hot-towel": "£10"
    };
    var durationMap = {
      "i-cut-royal": 60, "i-cut-deluxe": 50, "full-skinfade-beard-luxury": 45,
      "full-experience": 30, "senior-full-experience": 40, "skin-fade": 30,
      "scissor-cut": 30, "classic-sbs": 20, "hot-towel-shave": 15,
      "clipper-cut": 20, "senior-haircut": 20, "young-gents": 20,
      "young-gents-skin-fade": 25, "full-facial": 10, "beard-dyeing": 20,
      "face-mask": 10, "face-steam": 10, "threading": 5,
      "waxing": 10, "shape-up-clean-up": 15, "wash-hot-towel": 15
    };

    var price = priceMap[data.service] || '';
    var duration = durationMap[data.service] || 30;
    var paymentType = (data.paymentType || '').toUpperCase() === 'DEPOSIT' ? 'DEPOSIT' : 'FULL';
    var status = data.status || 'CONFIRMED';
    var bookingId = data.bookingId || '';

    var barber = (data.barber || '').toLowerCase().trim();
    var calendarIds = {
      'alex': 'whitecrossbarbers@gmail.com',
      'arda': 'a21f5eebd2a27dd78f98aca6af2f0288cf52efd9c9da64ab38c236d4449b7913@group.calendar.google.com'
    };

    // BERBER ATAMA — no-preference veya boşsa akıllı atama yap
    if (!barber || barber === 'no-preference' || barber === 'undefined') {
      var timeParts = data.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (timeParts) {
        var hours = parseInt(timeParts[1]);
        var minutes = parseInt(timeParts[2]);
        var ampm = timeParts[3].toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;

        var checkStart = new Date(data.date + "T00:00:00");
        checkStart.setHours(hours, minutes, 0, 0);
        var checkEnd = new Date(checkStart.getTime() + (duration * 60 * 1000));

        var startOfToday = new Date(data.date + "T00:00:00");
        var endOfToday = new Date(data.date + "T23:59:59");

        var alexCal = CalendarApp.getCalendarById(calendarIds.alex);
        var ardaCal = CalendarApp.getCalendarById(calendarIds.arda);

        var alexIsBusy = alexCal ? alexCal.getEvents(checkStart, checkEnd).length > 0 : true;
        var ardaIsBusy = ardaCal ? ardaCal.getEvents(checkStart, checkEnd).length > 0 : true;

        if (!alexIsBusy && ardaIsBusy) {
          barber = 'alex';
        } else if (alexIsBusy && !ardaIsBusy) {
          barber = 'arda';
        } else {
          var alexTotal = alexCal ? alexCal.getEvents(startOfToday, endOfToday).length : 999;
          var ardaTotal = ardaCal ? ardaCal.getEvents(startOfToday, endOfToday).length : 999;
          barber = (alexTotal <= ardaTotal) ? 'alex' : 'arda';
        }
      } else {
        // Zaman formatı okunamazsa günlük yüke göre ata
        var alexCalF = CalendarApp.getCalendarById(calendarIds.alex);
        var ardaCalF = CalendarApp.getCalendarById(calendarIds.arda);
        var alexTotalF = alexCalF ? alexCalF.getEvents(new Date(data.date + "T00:00:00"), new Date(data.date + "T23:59:59")).length : 0;
        var ardaTotalF = ardaCalF ? ardaCalF.getEvents(new Date(data.date + "T00:00:00"), new Date(data.date + "T23:59:59")).length : 0;
        barber = (alexTotalF <= ardaTotalF) ? 'alex' : 'arda';
      }
    }

    // Son güvence — barber hala boşsa alex
    if (!barber || barber === '') barber = 'alex';

    var rawDate = new Date(data.date + "T00:00:00");
    var bookingDateFormatted = rawDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (status === 'PENDING') {
      sheet.appendRow([new Date(), data.name || '', data.email || '', data.phone || '', bookingDateFormatted, data.time || '', data.service || '', price, 'Website', paymentType, 'PENDING', bookingId, barber]);
      sheet.getRange(sheet.getLastRow(), 1, 1, 13).setBackground('#ffcccc');

    } else if (status === 'CONFIRMED') {
      var found = false;
      if (bookingId) {
        var allData = sheet.getDataRange().getValues();
        for (var i = 1; i < allData.length; i++) {
          if (allData[i][11] === bookingId) {
            barber = allData[i][12] || barber; // PENDING'deki berberi kullan
            sheet.getRange(i + 1, 11).setValue('CONFIRMED');
            sheet.getRange(i + 1, 13).setValue(barber);
            sheet.getRange(i + 1, 1, 1, 13).setBackground('#fff8e1');
            found = true;
            break;
          }
        }
      }
      if (!found) {
        sheet.appendRow([new Date(), data.name || '', data.email || '', data.phone || '', bookingDateFormatted, data.time || '', data.service || '', price, 'Website', paymentType, 'CONFIRMED', bookingId, barber]);
        sheet.getRange(sheet.getLastRow(), 1, 1, 13).setBackground('#fff8e1');
      }

      // TAKVİM ETKİNLİĞİ
      var finalCalId = calendarIds[barber] || calendarIds['alex'];
      var calendar = CalendarApp.getCalendarById(finalCalId);
      if (!calendar) calendar = CalendarApp.getDefaultCalendar();

      var tParts = data.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (tParts) {
        var h = parseInt(tParts[1]);
        var m = parseInt(tParts[2]);
        var ap = tParts[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;

        var startDT = new Date(data.date + "T00:00:00");
        startDT.setHours(h, m, 0, 0);
        var endDT = new Date(startDT.getTime() + (duration * 60 * 1000));

        var event = calendar.createEvent(
          '✂ ' + data.name + ' — ' + data.service + ' (' + paymentType + ')',
          startDT, endDT,
          {
            description: '📞 ' + data.phone + '\n📧 ' + data.email + '\n💈 ' + data.service + '\n💷 ' + price + '\n💳 ' + paymentType + '\n⏱ ' + duration + ' mins\n💈 Barber: ' + barber + '\n📅 Website',
            location: '136 Whitecross Street, London EC1Y 8QJ'
          }
        );
        event.addPopupReminder(0);
        event.addPopupReminder(30);
      }

     GmailApp.sendEmail(
    'whitecrossbarbers@gmail.com',
    '✂ New Website Booking: ' + data.name + ' — ' + data.service,
    'NEW BOOKING CONFIRMED\n\n' +
    '👤 Name: ' + data.name + '\n' +
    '📧 Email: ' + data.email + '\n' +
    '📞 Phone: ' + data.phone + '\n' +
    '📅 Date: ' + bookingDateFormatted + '\n' +
    '🕐 Time: ' + data.time + '\n' +
    '💈 Service: ' + data.service + '\n' +
    '💷 Price: ' + price + '\n' +
    '💳 Payment: ' + paymentType + '\n' +
    '✂️ Barber: ' + barber + '\n' +
    '⏱ Duration: ' + duration + ' mins\n' +
    '🌐 Source: Website\n' +
    '🔑 Booking ID: ' + bookingId
);

GmailApp.sendEmail(
    data.email,
    '✂ Booking Confirmed — I CUT Whitecross Barbers',
    'Hi ' + data.name + ',\n\n' +
    'Your booking is confirmed! Here are your details:\n\n' +
    '📅 Date: ' + bookingDateFormatted + '\n' +
    '🕐 Time: ' + data.time + '\n' +
    '💈 Service: ' + data.service + '\n' +
    '💷 Price: ' + price + '\n' +
    '💳 Payment: ' + paymentType + '\n' +
    '✂️ Barber: ' + barber + '\n\n' +
    'We\'re located at 136 Whitecross Street, London EC1Y 8QJ.\n\n' +
    'Please arrive 5 minutes early. If you need to cancel or reschedule, contact us at least 24 hours in advance.\n\n' +
    '📞 020 3621 5929\n' +
    '💬 WhatsApp: wa.me/442036215929\n\n' +
    'See you soon!\n' +
    'I CUT Whitecross Barbers'
);


var msg = "✂️ YENİ WEB RANDEVUSU\n\n" +
          "👤 Müşteri: " + data.name + "\n" +
          "📧 Email: " + data.email + "\n" +
          "📞 Telefon: " + data.phone + "\n" +
          "📅 Tarih: " + bookingDateFormatted + "\n" +
          "🕐 Saat: " + data.time + "\n" +
          "✂️ Berber: " + barber + "\n" +
          "💈 Servis: " + data.service + "\n" +
          "💷 Fiyat: " + price + "\n" +
          "💳 Ödeme: " + paymentType + "\n" +
          "⏱ Süre: " + duration + " dk\n" +
          "🔑 ID: " + bookingId;
sendTelegramNotification(msg);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', assignedBarber: barber })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("doPost Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var date = e.parameter.date;
    var barber = e.parameter.barber;

    var calendarIds = {
      'alex': 'whitecrossbarbers@gmail.com',
      'arda': 'a21f5eebd2a27dd78f98aca6af2f0288cf52efd9c9da64ab38c236d4449b7913@group.calendar.google.com'
    };

    var startOfDay = new Date(date + "T00:00:00");
    var endOfDay = new Date(date + "T23:59:59");

    function getBusy(calId) {
      var slots = [];
      var cal = CalendarApp.getCalendarById(calId);
      if (!cal) return slots;
      cal.getEvents(startOfDay, endOfDay).forEach(function(ev) {
        slots.push({ start: ev.getStartTime().getTime(), end: ev.getEndTime().getTime() });
      });
      return slots;
    }

    var result;
    if (barber === 'alex') {
      result = { mode: 'single', busy: getBusy(calendarIds.alex) };
    } else if (barber === 'arda') {
      result = { mode: 'single', busy: getBusy(calendarIds.arda) };
    } else {
      result = {
        mode: 'preference',
        alexBusy: getBusy(calendarIds.alex),
        ardaBusy: getBusy(calendarIds.arda)
      };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseBooksyEmails() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  var calendar = CalendarApp.getDefaultCalendar();
  var threads = GmailApp.search('from:no-reply@booksy.com subject:"new booking" is:unread');
  var months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  var booksyDurationMap = {
    'classic short back': 20, 'skin fade': 30, 'scissor cut': 30,
    'i cut royal': 60, 'i cut deluxe': 50, 'full skin fade': 45,
    'full experience': 30, 'senior full': 40, 'hot towel': 15,
    'clipper cut': 20, 'senior haircut': 20, 'young gents skin fade': 25,
    'young gents': 20, 'full facial': 10, 'beard dyeing': 20,
    'face mask': 10, 'face steam': 10, 'threading': 5,
    'waxing': 10, 'shape up': 15, 'wash': 15
  };

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      var subject = message.getSubject();
      var body = message.getPlainBody();
      var nameMatch = subject.match(/^(.+?):/);
      var name = nameMatch ? nameMatch[1].trim() : '';
      var dateMatch = subject.match(/(\d{1,2})\s(\w+)\s(\d{4})\s(\d{1,2}):(\d{2})/);
      var bookingDate = dateMatch ? dateMatch[1] + ' ' + dateMatch[2] + ' ' + dateMatch[3] : '';
      var bookingTime = dateMatch ? dateMatch[4] + ':' + dateMatch[5] : '';
      var startDateTime = dateMatch ? new Date(parseInt(dateMatch[3]), months[dateMatch[2]], parseInt(dateMatch[1]), parseInt(dateMatch[4]), parseInt(dateMatch[5]), 0) : null;
      var serviceMatch = body.match(/(?:Standard Packages?|Exclusive[^:]*):?\s*([^\n£\d]+)/i);
      var service = serviceMatch ? serviceMatch[1].trim() : '';
      var duration = 30;
      for (var key in booksyDurationMap) {
        if (service.toLowerCase().indexOf(key) !== -1) duration = booksyDurationMap[key];
      }
      var endDateTime = startDateTime ? new Date(startDateTime.getTime() + duration * 60 * 1000) : null;
      var phoneMatch = body.match(/0[\d\s]{9,12}/);
      var phone = phoneMatch ? phoneMatch[0].trim() : '';
      var emailMatch = body.match(/[\w.-]+@[\w.-]+\.\w+/);
      var email = emailMatch ? emailMatch[0] : '';
      var priceMatch = body.match(/£([\d.]+)/);
      var price = priceMatch ? '£' + priceMatch[1] : '';

      sheet.appendRow([new Date(), name, email, phone, bookingDate, bookingTime, service, price, 'Booksy', 'FULL', 'CONFIRMED', '', '']);
      sheet.getRange(sheet.getLastRow(), 1, 1, 13).setBackground('#d4edda');

      if (startDateTime && !isNaN(startDateTime)) {
        var ev = calendar.createEvent('✂ ' + name + ' — ' + service, startDateTime, endDateTime, {
          description: '📞 ' + phone + '\n📧 ' + email + '\n💈 ' + service + '\n💷 ' + price + '\n⏱ ' + duration + ' mins\n📅 Booksy',
          location: '136 Whitecross Street, London EC1Y 8QJ'
        });
        ev.addPopupReminder(0);
        ev.addPopupReminder(30);
      }

      var booksyMsg = "📅 YENİ BOOKSY RANDEVUSU\n\n" +
                      "👤 Müşteri: " + name + "\n" +
                      "📧 Email: " + email + "\n" +
                      "📞 Telefon: " + phone + "\n" +
                      "📅 Tarih: " + bookingDate + "\n" +
                      "🕐 Saat: " + bookingTime + "\n" +
                      "💈 Servis: " + service + "\n" +
                      "💷 Fiyat: " + price + "\n" +
                      "⏱ Süre: " + duration + " dk";
      sendTelegramNotification(booksyMsg);
      message.markRead();
    });
  });
}

function sendTelegramNotification(message) {
  if (!message || message.trim() === '') return;
  var token = "8772866936:AAGxkbX81Q9EUdBXSRfoXE3swHXUsmeho38";
  var chatId = "1679287636";
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var payload = { "chat_id": chatId, "text": message };
  var options = { "method": "post", "payload": payload };
  try { UrlFetchApp.fetch(url, options); } catch(e) { Logger.log("Telegram error: " + e.toString()); }
}