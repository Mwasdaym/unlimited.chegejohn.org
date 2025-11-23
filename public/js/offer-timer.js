// Frontend timer management for offers
class OfferTimer {
  constructor() {
    this.timers = new Map();
  }

  initializeTimers() {
    const offerElements = document.querySelectorAll('[data-offer-expires]');
    
    offerElements.forEach(element => {
      const planId = element.getAttribute('data-plan-id');
      const expireDate = element.getAttribute('data-offer-expires');
      
      this.startTimer(planId, expireDate, element);
    });
  }

  startTimer(planId, expireDate, element) {
    const timerElement = element.querySelector('.countdown');
    const purchaseBtn = element.querySelector('.purchase-btn');
    
    if (!timerElement) return;

    const update = () => {
      const now = new Date().getTime();
      const end = new Date(expireDate).getTime();
      const distance = end - now;

      if (distance < 0) {
        timerElement.textContent = 'OFFER EXPIRED';
        timerElement.className = 'countdown expired';
        if (purchaseBtn) {
          purchaseBtn.disabled = true;
          purchaseBtn.textContent = 'Offer Expired';
          purchaseBtn.classList.add('expired');
        }
        clearInterval(this.timers.get(planId));
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      if (days > 0) {
        timerElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      } else {
        timerElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        
        // Flash warning when less than 1 hour
        if (hours < 1) {
          timerElement.classList.add('warning');
        }
      }
    };

    // Update immediately and every second
    update();
    const interval = setInterval(update, 1000);
    this.timers.set(planId, interval);
  }

  destroyTimers() {
    this.timers.forEach(interval => clearInterval(interval));
    this.timers.clear();
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.offerTimer = new OfferTimer();
  window.offerTimer.initializeTimers();
});
