importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A",
  authDomain: "havuz-44f70.firebaseapp.com",
  projectId: "havuz-44f70",
  storageBucket: "havuz-44f70.firebasestorage.app",
  messagingSenderId: "1050766582653",
  appId: "1:1050766582653:web:7ddaa5acb3bec5ef122214"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '🔔 New Booking';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:      '/icon-192.png',
    badge:     '/icon-192.png',
    tag:       'new-booking',
    renotify:  true,
    data:      payload.data || {},
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const bookingId = e.notification.data?.bookingId;
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    if (list.length) {
      const win = list[0];
      win.focus();
      if (bookingId) win.postMessage({ type:'OPEN_BOOKING', bookingId });
      return win;
    }
    return clients.openWindow(bookingId ? `/?bookingId=${bookingId}` : '/');
  }));
});
