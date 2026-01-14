# Commercial Proposal: EcoStride Platform

**Date:** January 13, 2026
**Prepared For:** EcoStride Community
**Reference:** Market Pricing Guide 2026

---

## 1. Executive Summary

Based on the feature set outlined in `PLATFORM_CAPABILITIES.md` and aligned with the provided "Market Pricing Guide," the EcoStride platform represents a comprehensive **Enterprise-Grade Web Application**. It combines elements of a Content Management System (CMS), flexible Event Management, Custom E-Commerce, and complex Financial Reporting.

**Total Estimated Project Value:** **KES 1,950,000 – KES 3,750,000**

---

## 2. Detailed Cost Breakdown

The following breakdown maps EcoStride's specific capabilities to the standard market rates provided.

### 2.1 Public Portal & CMS Module
*Features: Static pages (About, Contact), Blog/News, Media Gallery, Sponsor Showcase, SEO controls.*

This module functions as the public face of the organization, capable of high-performance content delivery.
*   **Classification:** Static Site with Modern Framework (Complex) / Headless CMS.
*   **Complexity:** Medium-High (Requires dynamic media handling and SEO optimization).
*   **Estimated Cost:** **KES 200,000 – 350,000**

### 2.2 Core Event & Web Application Logic
*Features: Multi-event management, Registration forms, Waiver tracking, Volunteer management, RBAC (8 roles), Audit logs.*

This is the "brain" of the system. It handles complex business logic, user roles, and security. It fits the description of a highly complex internal management system.
*   **Classification:** Medium Complexity Web Application / Multi-vendor Platform features.
*   **Complexity:** High (Due to RBAC and multiple user types).
*   **Estimated Cost:** **KES 800,000 – 1,500,000**

### 2.3 Specialized Race Management Features
*Features: Bib Assignment (Auto/Manual), Check-in operations (QR/Barcode), Results Management (CSV import/Publication).*

These are bespoke features specific to the domain, requiring custom algorithms and high data integrity.
*   **Classification:** Specialized Development / System Integration.
*   **Complexity:** Medium (Critical operational reliability required).
*   **Estimated Cost:** **KES 250,000 – 500,000**

### 2.4 E-Commerce & Fundraising Module
*Features: Merchandise listings, Donation tiers, Cause-based campaigns, Order tracking.*

A custom-built e-commerce functionality integrated directly into the events ecosystem, not just a plugin.
*   **Classification:** Custom E-Commerce Platform (Small Custom Store).
*   **Complexity:** Medium.
*   **Estimated Cost:** **KES 400,000 – 800,000**

### 2.5 Payments & Financial Integration
*Features: M-Pesa STK Push, Stripe, Multi-currency, Electronic Receipts, Finance Dashboard, Reconciliation.*

Requires high-security implementation, idempotency handling, and integration with multiple providers.
*   **Classification:** Specialized Development (Payment Gateway Integration - Multiple).
*   **Complexity:** High (Security critical).
*   **Estimated Cost:** **KES 300,000 – 600,000**

---

## 3. Deployment & Infrastructure
*Recommended Provider: DigitalOcean (per guide recommendations)*

*   **Setup:** VPS/Cloud Setup, CI/CD Pipelines, Domain & SSL.
*   **Classification:** Hosting & Infrastructure Setup.
*   **Estimated Setup Cost:** **KES 50,000 – 100,000** (One-off)
*   **Monthly Running Cost:** **~KES 5,000 – 15,000** (depending on traffic)

---

## 4. Summary Table

| Component | Standard Classification | Low Estimate (KES) | High Estimate (KES) |
| :--- | :--- | :--- | :--- |
| **Public Portal & CMS** | Static/Modern Framework | 200,000 | 350,000 |
| **Core App & Admin** | Medium Web App (Multi-vendor) | 800,000 | 1,500,000 |
| **Race Mgmt Logic** | Specialized Custom Logic | 250,000 | 500,000 |
| **Shop & Donations** | Custom E-Commerce (Small) | 400,000 | 800,000 |
| **Payments/Finance** | Payment Integrations (Multi) | 300,000 | 600,000 |
| **Total Development** | | **1,950,000** | **3,750,000** |

## 5. Recommendation

Given the scope effectively spans a "SaaS Platform" (Section 3.3 in your guide, rated KES 1.5M - 5M+), this quote falls squarely within industry standards for a project of this magnitude.

For a phased approach:
1.  **MVP (Core Events + Payments):** ~KES 1.2M
2.  **Phase 2 (Shop + Advanced Race Mgmt):** ~KES 1.0M
3.  **Phase 3 (cms + Optimizations):** ~KES 500k
