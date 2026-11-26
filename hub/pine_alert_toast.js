// Vela 0.9.3 displays every Pine alert as a toast, including malformed PineTS
// alertcondition payloads with an object title and no message ("[object Object]").
// Forward the event unchanged, but suppress only that uninformative toast. Vela
// delivers chart alerts synchronously; restore the shared toast host immediately so
// errors, real alerts and other workspace notices continue to work.
window.TradeXForwardPineAlert = (workspace, handlers, alert) => {
  if (!handlers.onAlert) return;
  const title = alert && alert.title;
  const malformed = (title && typeof title === 'object' || title === '[object Object]') &&
    (alert.message == null || alert.message === '');
  const toast = workspace && workspace.toastHost;
  if (!malformed || !toast || typeof toast.show !== 'function') return handlers.onAlert(alert);
  const original = toast.show;
  toast.show = function (message, type, duration) {
    if (type === 'info' && duration === 4000 && String(message).includes('[object Object]')) return;
    return original.apply(this, arguments);
  };
  try { return handlers.onAlert(alert); }
  finally { toast.show = original; }
};
