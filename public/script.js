// API Configuration
const API_BASE = '/api';

// Global State
let currentPlanId = null;
let currentPlanData = null;
let currentCategory = null;

// DOM Elements
const categoriesContainer = document.getElementById('categoriesContainer');
const paymentModal = document.getElementById('paymentModal');
const donationModal = document.getElementById('donationModal');
const paymentForm = document.getElementById('paymentForm');
const donationForm = document.getElementById('donationForm');
const planSummary = document.getElementById('planSummary');
const paymentResult = document.getElementById('paymentResult');
const donationResult = document.getElementById('donationResult');

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    await loadSubscriptionPlans();
    setupEventListeners();
    setupDonationEvents();
    checkServiceHealth();
}

// Load Subscription Plans from API
async function loadSubscriptionPlans() {
    try {
        showLoadingState();
        
        const response = await fetch(`${API_BASE}/plans`);
        const result = await response.json();
        
        if (result.success) {
            displayCategories(result.categories);
        } else {
            showError('Failed to load subscription plans');
        }
    } catch (error) {
        console.error('Error loading plans:', error);
        showError('Network error loading plans');
    }
}

function displayCategories(categories) {
    categoriesContainer.innerHTML = '';
    
    Object.entries(categories).forEach(([categoryKey, categoryData]) => {
        const categorySection = createCategorySection(categoryKey, categoryData);
        categoriesContainer.appendChild(categorySection);
    });
}

function createCategorySection(categoryKey, categoryData) {
    const section = document.createElement('div');
    section.className = 'category-section';
    
    section.innerHTML = `
        <div class="category-header">
            <div class="category-icon" style="background: ${categoryData.color}">
                <i class="${categoryData.icon}"></i>
            </div>
            <h3 class="category-title">${categoryData.category}</h3>
        </div>
        <div class="plans-grid" id="plans-${categoryKey}">
            ${Object.entries(categoryData.plans).map(([planId, plan]) => createPlanCard(planId, plan, categoryData.color)).join('')}
        </div>
    `;
    
    return section;
}

function createPlanCard(planId, plan, categoryColor) {
    const popularBadge = plan.popular ? 'popular' : '';
    
    // ✅ Added logo section here
    const logoHTML = plan.logo 
        ? `<img src="${plan.logo}" alt="${plan.name} logo" class="plan-logo" style="width:60px;height:60px;object-fit:contain;margin-bottom:8px;">` 
        : '';

    return `
        <div class="plan-card ${popularBadge}" data-plan="${planId}">
            <div class="plan-header" style="text-align:center;">
                ${logoHTML}
                <h4 class="plan-name">${plan.name}</h4>
                <div class="plan-price">KES ${plan.price}</div>
                <div class="plan-duration">${plan.duration}</div>
            </div>
            <ul class="plan-features">
                ${plan.features.map(feature => `
                    <li>
                        <i class="fas fa-check"></i>
                        ${feature}
                    </li>
                `).join('')}
            </ul>
            <button class="subscribe-btn" onclick="openPaymentModal('${planId}')">
                <i class="fas fa-shopping-cart"></i>
                Subscribe Now
            </button>
        </div>
    `;
}
