// offers.js - Centralized offer management system
const offers = {
  // Active offers with timers
  activeOffers: {
    'spotify_offer': {
      planId: 'spotify_offer',
      name: 'Spotify Premium Special Offer',
      originalPlan: 'spotify',
      discountPercentage: 33,
      originalPrice: 750,
      offerPrice: 500,
      duration: '3 Months',
      startDate: '2024-01-01T00:00:00',
      endDate: '2024-12-31T23:59:59',
      isActive: true,
      maxPurchases: 1000,
      purchasesCount: 0,
      features: ['Ad-Free Music', 'Offline Mode', 'High-Quality Audio', 'Special Limited Offer']
    },
    'showmax_offer': {
      planId: 'showmax_offer',
      name: 'Showmax Pro New Year Offer',
      originalPlan: 'showmax_1y',
      discountPercentage: 25,
      originalPrice: 1200,
      offerPrice: 900,
      duration: '1 Year',
      startDate: '2024-01-01T00:00:00',
      endDate: '2024-02-28T23:59:59',
      isActive: true,
      maxPurchases: 500,
      purchasesCount: 0,
      features: ['Live Sports', 'Showmax Originals', 'Multiple Devices', 'Limited Time Offer']
    }
  },

  // Get all active offers
  getActiveOffers() {
    const now = new Date();
    return Object.values(this.activeOffers).filter(offer => {
      const endDate = new Date(offer.endDate);
      return offer.isActive && endDate > now && offer.purchasesCount < offer.maxPurchases;
    });
  },

  // Check if an offer is valid
  isValidOffer(planId) {
    const offer = this.activeOffers[planId];
    if (!offer) return false;

    const now = new Date();
    const endDate = new Date(offer.endDate);
    
    return offer.isActive && 
           endDate > now && 
           offer.purchasesCount < offer.maxPurchases;
  },

  // Increment purchase count for an offer
  recordPurchase(planId) {
    if (this.activeOffers[planId]) {
      this.activeOffers[planId].purchasesCount++;
      return true;
    }
    return false;
  },

  // Get time remaining for an offer
  getTimeRemaining(planId) {
    const offer = this.activeOffers[planId];
    if (!offer || !this.isValidOffer(planId)) {
      return { expired: true };
    }

    const now = new Date();
    const endDate = new Date(offer.endDate);
    const timeRemaining = endDate - now;

    return {
      days: Math.floor(timeRemaining / (1000 * 60 * 60 * 24)),
      hours: Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((timeRemaining % (1000 * 60)) / 1000),
      expired: false
    };
  },

  // Add new offer
  addOffer(offerData) {
    this.activeOffers[offerData.planId] = {
      ...offerData,
      purchasesCount: 0,
      isActive: true
    };
  },

  // Update offer
  updateOffer(planId, updates) {
    if (this.activeOffers[planId]) {
      this.activeOffers[planId] = { ...this.activeOffers[planId], ...updates };
      return true;
    }
    return false;
  },

  // Deactivate offer
  deactivateOffer(planId) {
    if (this.activeOffers[planId]) {
      this.activeOffers[planId].isActive = false;
      return true;
    }
    return false;
  },

  // Get offer statistics
  getOfferStats() {
    const activeOffers = this.getActiveOffers();
    return {
      totalActiveOffers: activeOffers.length,
      totalPurchases: activeOffers.reduce((sum, offer) => sum + offer.purchasesCount, 0),
      revenue: activeOffers.reduce((sum, offer) => sum + (offer.purchasesCount * offer.offerPrice), 0),
      offers: activeOffers.map(offer => ({
        name: offer.name,
        purchases: offer.purchasesCount,
        revenue: offer.purchasesCount * offer.offerPrice,
        timeRemaining: this.getTimeRemaining(offer.planId)
      }))
    };
  }
};

module.exports = offers;
