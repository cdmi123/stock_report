'use strict';

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const config = window.erpNotificationConfig || {};
    if (!config.userId) {
      return;
    }

    const notifBadge = document.getElementById('notification-badge');
    const notifCountBadge = document.getElementById('notif-count-badge');
    const notifList = document.getElementById('notification-list');
    const notifDropdownBtn = document.getElementById('notificationDropdown');
    const transferUrl = config.transferRequestsUrl || '/transfer-requests';

    let notifications = [];
    let serviceWorkerRegistration = null;

    const formatTime = (value) => {
      const date = new Date(value);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const escapeHtml = (value) => {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const updateBadge = () => {
      const unreadCount = notifications.filter((item) => item.isRead === false).length;
      if (!notifBadge || !notifCountBadge) return;

      if (unreadCount > 0) {
        notifBadge.classList.remove('d-none');
        notifCountBadge.classList.remove('d-none');
        notifCountBadge.innerText = unreadCount;
      } else {
        notifBadge.classList.add('d-none');
        notifCountBadge.classList.add('d-none');
      }
    };

    const renderNotifications = () => {
      if (!notifList) return;

      if (!notifications.length) {
        notifList.innerHTML = `
          <div id="no-notifications" class="text-center py-4 text-muted">
            <i class="bi bi-chat-left-dots fs-4 d-block mb-2 opacity-50"></i>
            <span class="small">No new notifications</span>
          </div>
        `;
        updateBadge();
        return;
      }

      notifList.innerHTML = notifications.map((notification) => {
        const icon = notification.transferId ? 'bi-arrow-left-right text-warning' : 'bi-info-circle-fill text-primary';
        const rowClass = notification.isRead ? 'opacity-75' : '';
        const url = notification.url || transferUrl;
        const itemId = notification.id ? String(notification.id) : '';

        return `
          <li class="dropdown-item py-3 border-bottom d-flex align-items-start gap-3 text-wrap ${rowClass} notification-item" data-id="${escapeHtml(itemId)}" data-url="${escapeHtml(url)}" style="cursor: pointer;">
            <i class="bi ${icon} fs-5 mt-1"></i>
            <div class="flex-grow-1">
              <div class="fw-semibold text-main small mb-1">${escapeHtml(notification.title || 'Notification')}</div>
              <p class="mb-0 text-main small" style="white-space: normal;">${escapeHtml(notification.message)}</p>
              <small class="text-muted" style="font-size: 0.7rem;">${formatTime(notification.createdAt || new Date())}</small>
            </div>
          </li>
        `;
      }).join('');

      updateBadge();
    };

    const mergeNotifications = (incoming) => {
      const seen = new Set();
      const merged = [];
      [...incoming, ...notifications].forEach((item) => {
        const key = item.id ? String(item.id) : `${item.title}:${item.message}:${item.createdAt}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(item);
      });

      notifications = merged
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 20);
    };

    const addNotification = (notification) => {
      mergeNotifications([notification]);
      renderNotifications();
    };

    const markAllRead = async () => {
      notifications = notifications.map((item) => ({ ...item, isRead: true }));
      renderNotifications();

      try {
        await fetch('/notifications/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
      } catch (error) {
        console.error('Failed to mark notifications as read:', error);
      }
    };

    const openNotificationUrl = (url) => {
      window.location.href = url || transferUrl;
    };

    const showBrowserNotification = (notification) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
      }

      try {
        const nativeNotification = new Notification(notification.title || 'Notification', {
          body: notification.message,
          tag: notification.transferId ? `transfer-${notification.transferId}` : undefined,
          data: { url: notification.url || transferUrl }
        });

        nativeNotification.onclick = function () {
          window.focus();
          openNotificationUrl(notification.url || transferUrl);
          nativeNotification.close();
        };
      } catch (error) {
        console.error('Failed to show browser notification:', error);
      }
    };

    const base64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const safeBase64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(safeBase64);
      return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    };

    const subscribeForPush = async () => {
      if (!serviceWorkerRegistration || !config.vapidPublicKey || !('PushManager' in window)) {
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      const existingSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
      const subscription = existingSubscription || await serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(config.vapidPublicKey)
      });

      await fetch('/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(subscription)
      });
    };

    const registerServiceWorker = async () => {
      if (!('serviceWorker' in navigator)) {
        return;
      }

      try {
        serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
        if (config.branchId && config.vapidPublicKey && 'Notification' in window && Notification.permission !== 'denied') {
          await subscribeForPush();
        }
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    const loadNotifications = async () => {
      try {
        const response = await fetch('/notifications?limit=10', {
          headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (!data.success) return;

        notifications = data.notifications || [];
        renderNotifications();
      } catch (error) {
        console.error('Failed to load notifications:', error);
      }
    };

    const initSocketNotifications = () => {
      if (typeof io === 'undefined') return;
      const socket = io();

      socket.on('transferNotification', (payload) => {
        addNotification(payload);
        showBrowserNotification(payload);
      });

      socket.on('dashboardUpdate', (payload) => {
        if (!payload || payload.type === 'TRANSFER_CREATE') {
          return;
        }

        addNotification({
          id: `dashboard-${payload.type}-${Date.now()}`,
          title: payload.type === 'TRANSFER_UPDATE' ? 'Transfer Update' : 'ERP Update',
          message: payload.message,
          createdAt: new Date().toISOString(),
          isRead: false,
          url: payload.type === 'TRANSFER_UPDATE' ? transferUrl : window.location.pathname
        });
      });
    };

    if (notifList) {
      notifList.addEventListener('click', (event) => {
        const item = event.target.closest('.notification-item');
        if (!item) return;
        openNotificationUrl(item.dataset.url || transferUrl);
      });
    }

    if (notifDropdownBtn) {
      notifDropdownBtn.addEventListener('click', () => {
        markAllRead();
      });
    }

    renderNotifications();
    loadNotifications();
    registerServiceWorker();
    initSocketNotifications();
  });
})();
