# Security Audit Plan - Reviews App

## Overview
This audit covers security concerns for a Shopify app handling customer reviews, including customer data (names, emails), images, and shop data.

---

## 1. Authentication & Authorization

### 1.1 App Proxy Authentication
**Risk:** Unauthenticated users could submit fake reviews or access data

**Check:**
- [ ] `authenticate.public.appProxy(request)` is called on all app proxy routes
- [ ] Requests without valid Shopify signature are rejected
- [ ] Shop is extracted from authenticated session, not from user input

**Test:**
- [ ] Try calling `/apps/reviews` directly without going through Shopify (should fail)
- [ ] Try submitting a review with a different shop value in the request

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Lines 68, 161: Authentication is performed

### 1.2 Admin Authentication
**Risk:** Unauthorized access to review management

**Check:**
- [ ] `authenticate.admin(request)` is called on all admin routes
- [ ] Shop is extracted from session, not user input

**Test:**
- [ ] Try accessing `/app/reviews` without being logged into Shopify admin

**Current Status:**
- File: `app/routes/app.reviews.jsx` - Line 7
- File: `app/routes/app.settings.jsx` - Check if authenticated

### 1.3 Shop Isolation
**Risk:** One shop could access another shop's reviews

**Check:**
- [ ] All database queries filter by `shop` from authenticated session
- [ ] Shop value never comes from user-controllable input

**Test:**
- [ ] Review the code for any queries without shop filter
- [ ] Try to approve/delete a review from a different shop

---

## 2. Input Validation & Sanitization

### 2.1 Rating Validation
**Risk:** Invalid ratings could corrupt data or cause errors

**Check:**
- [ ] Rating is validated as integer between 1-5
- [ ] Non-numeric ratings are rejected

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Lines 192-194: Rating bounds checked

**Test:**
- [ ] Submit rating = 0 (should fail)
- [ ] Submit rating = 6 (should fail)
- [ ] Submit rating = "abc" (should fail)
- [ ] Submit rating = -1 (should fail)

### 2.2 XSS Prevention (Cross-Site Scripting)
**Risk:** Malicious scripts in reviews could attack other users

**Check:**
- [ ] Review content is escaped when displayed
- [ ] Customer name is escaped when displayed
- [ ] Review title is escaped when displayed
- [ ] Reply content is escaped when displayed

**Current Status:**
- File: `product-reviews.liquid`
- `escapeHtml()` function is used in JavaScript rendering

**Test:**
- [ ] Submit review with title: `<script>alert('XSS')</script>`
- [ ] Submit review with content: `<img src=x onerror=alert('XSS')>`
- [ ] Submit review with name containing HTML
- [ ] Verify none of these execute - they should display as text

### 2.3 Required Fields
**Risk:** Missing data could cause errors or incomplete records

**Check:**
- [ ] customerEmail is required
- [ ] customerName is required
- [ ] rating is required
- [ ] title is required
- [ ] content is required
- [ ] productId is required for product reviews

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Lines 188-199: Validation present

### 2.4 Image Validation
**Risk:** Malicious files uploaded as images

**Check:**
- [ ] Only image file types accepted
- [ ] File size is limited
- [ ] Images are validated server-side, not just client-side

**Current Status:**
- Client-side: 5MB limit, image/* accept attribute
- Server-side: Check for `data:image` prefix (Line 275)

**Recommendations:**
- [ ] Add server-side file size validation
- [ ] Consider virus scanning for production
- [ ] Consider moving to cloud storage (Cloudinary, S3) for production

---

## 3. Data Exposure

### 3.1 Customer Email Protection
**Risk:** Customer emails exposed to public

**Check:**
- [ ] Storefront API does NOT return customerEmail
- [ ] Only customerName is shown publicly

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Lines 138-149: Review mapping - email is NOT included

**Test:**
- [ ] Call `/apps/reviews?productId=...` and verify email is not in response

### 3.2 Pending/Rejected Content Hidden
**Risk:** Unapproved content visible to public

**Check:**
- [ ] Only `status: "approved"` reviews returned to storefront
- [ ] Only `status: "approved"` images returned to storefront

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Lines 85, 100, 110: Filter by `status: "approved"`
- Line 148: Images filtered by `status === "approved"`

**Test:**
- [ ] Create a pending review - verify it doesn't appear on storefront
- [ ] Approve a review with pending images - verify images don't appear until approved

### 3.3 Order ID Protection
**Risk:** Exposing order IDs could be sensitive

**Check:**
- [ ] Full order ID/GID not exposed to public
- [ ] Only boolean `verifiedPurchase` shown

**Current Status:**
- Line 144: `verifiedPurchase: !!r.orderId` - only boolean exposed

---

## 4. Verified Purchase Security

### 4.1 Purchase Verification Integrity
**Risk:** Fake "verified purchase" badges

**Check:**
- [ ] Order lookup uses authenticated admin API
- [ ] Customer email from session, not user input
- [ ] Product ID validated against actual orders

**Current Status:**
- File: `app/routes/app-proxy.$.jsx`
- Function `checkVerifiedPurchase` (Lines 13-64)
- Uses `unauthenticated.admin(shop)` to query orders

**Potential Issues:**
- [ ] customerEmail comes from form data (Line 178) - could be spoofed!

**RECOMMENDATION:**
The customerEmail is taken from form input, which the customer controls. A malicious user could:
1. Find someone else's email who bought the product
2. Submit a review with that email to get "verified" status

**Fix Options:**
1. Use logged-in customer's email from Shopify session instead of form
2. Verify the form email matches the logged-in customer

### 4.2 Require Verified Purchase Bypass
**Risk:** Bypassing the "require verified purchase" setting

**Check:**
- [ ] Setting is read from database, not from request
- [ ] Check cannot be skipped by manipulating request

**Current Status:**
- Lines 216-221, 231-235: Setting read from database

---

## 5. Rate Limiting & Abuse Prevention

### 5.1 Review Submission Rate Limiting
**Risk:** Spam/flooding with review submissions

**Current Status:** No rate limiting implemented

**Recommendations:**
- [ ] Add rate limiting (e.g., max 5 reviews per hour per customer)
- [ ] Add CAPTCHA for suspicious activity
- [ ] Monitor for abuse patterns

### 5.2 Image Upload Limits
**Risk:** Storage exhaustion from large/many uploads

**Current Status:**
- 2 images per review limit (Line 273)
- 5MB client-side limit

**Recommendations:**
- [ ] Add server-side size validation
- [ ] Consider total storage limits per shop
- [ ] Move to cloud storage for production

### 5.3 Duplicate Review Prevention
**Risk:** Same customer reviewing multiple times

**Current Status:**
- Lines 202-213: Duplicate check implemented

**Test:**
- [ ] Verify same customer can't submit twice for same product

---

## 6. Database Security

### 6.1 SQL Injection
**Risk:** Malicious input manipulating database queries

**Current Status:** LOW RISK
- Prisma ORM is used throughout
- Prisma uses parameterized queries automatically
- No raw SQL queries found

**Verify:**
- [ ] Search codebase for `$queryRaw` or `$executeRaw` (should find none)

### 6.2 Data Deletion Cascade
**Risk:** Orphaned data or accidental data loss

**Current Status:**
- File: `prisma/schema.prisma`
- Line 67: `onDelete: Cascade` - images deleted when review deleted

---

## 7. Sensitive Data Handling

### 7.1 Environment Variables
**Check:**
- [ ] API keys not hardcoded
- [ ] `.env` file is in `.gitignore`
- [ ] No secrets in client-side code

### 7.2 Logging
**Risk:** Sensitive data in logs

**Check:**
- [ ] Customer emails not logged excessively
- [ ] No passwords/tokens in logs

**Current Status:**
- Several `console.log` statements with customer data
- Lines 135, 185, 226-228, etc.

**Recommendation:**
- [ ] Remove or reduce logging before production
- [ ] Never log full customer emails in production

---

## 8. Security Issues Summary

### Critical
| Issue | Location | Recommendation | Status |
|-------|----------|----------------|--------|
| Customer email from form input could allow verified purchase spoofing | app-proxy.$.jsx | Use session email or verify against logged-in customer | FIXED - Now uses signed `logged_in_customer_id` from Shopify and fetches trusted email via API |

### High
| Issue | Location | Recommendation |
|-------|----------|----------------|
| No rate limiting on review submission | app-proxy.$.jsx | Add rate limiting |
| No server-side image size validation | app-proxy.$.jsx | Validate before storing |

### Medium
| Issue | Location | Recommendation |
|-------|----------|----------------|
| Debug logging with customer data | Multiple files | Remove before production |
| Images stored as base64 in database | schema.prisma | Move to cloud storage for production |

### Low
| Issue | Location | Recommendation |
|-------|----------|----------------|
| Console.log debug statements | Multiple files | Remove before production |

---

## 9. Remediation Checklist

- [ ] Fix verified purchase email spoofing vulnerability
- [ ] Add rate limiting to review submission
- [ ] Add server-side image size validation
- [ ] Remove debug console.log statements
- [ ] Plan migration to cloud image storage
- [ ] Review and test all XSS escaping
- [ ] Conduct penetration testing before launch

---

## 10. Testing Tools

- **Browser DevTools:** Inspect network requests, modify form data
- **Postman/curl:** Test API endpoints directly
- **OWASP ZAP:** Automated security scanning
- **Burp Suite:** Intercept and modify requests
