# Manual QA Checklist - Reviews App

## Setup
- [ ] App is running (`npm run dev`)
- [ ] App is installed on dev store
- [ ] Product Reviews block is added to a product page

---

## 1. Review Submission (Storefront)

### 1.1 Basic Submission
- [ ] Logged-out user sees "Log in to write a review" prompt
- [ ] Logged-in user sees the review form
- [ ] Star rating is required - form won't submit without it
- [ ] Title field is required
- [ ] Content field is required
- [ ] Successful submission shows thank you message

### 1.2 Star Rating
- [ ] Clicking stars 1-5 highlights correctly
- [ ] Selected rating is submitted correctly
- [ ] Rating outside 1-5 is rejected (test via dev tools)

### 1.3 Image Upload
- [ ] "Add Photos" button opens file picker
- [ ] Selected images show as previews
- [ ] Can remove images before submitting
- [ ] Maximum 2 images enforced
- [ ] Images over 5MB are rejected
- [ ] Review submits successfully with 0 images
- [ ] Review submits successfully with 1 image
- [ ] Review submits successfully with 2 images

### 1.4 Verified Purchase
- [ ] Customer who bought product gets "Verified Purchase" badge
- [ ] Customer who didn't buy product gets no badge
- [ ] With "Require Verified Purchase" ON: non-buyers are rejected
- [ ] With "Require Verified Purchase" OFF: non-buyers can review

### 1.5 Duplicate Prevention
- [ ] Same customer cannot review same product twice
- [ ] Error message shown for duplicate attempt

### 1.6 Auto-Approve Setting
- [ ] With "Auto-Approve" OFF: new reviews are "pending"
- [ ] With "Auto-Approve" ON: new reviews are "approved" immediately

---

## 2. Admin Review Management

### 2.1 Reviews List
- [ ] All reviews for the shop are displayed
- [ ] Reviews show: title, rating, content, customer name, date, status
- [ ] Verified Purchase badge shows when applicable
- [ ] Product title shown for product reviews

### 2.2 Filtering
- [ ] "All" filter shows all reviews
- [ ] "Pending" filter shows only pending reviews
- [ ] "Approved" filter shows only approved reviews
- [ ] "Rejected" filter shows only rejected reviews
- [ ] Counts in filter buttons are accurate

### 2.3 Review Actions
- [ ] Approve button works (changes status to approved)
- [ ] Reject button works (changes status to rejected)
- [ ] Delete button asks for confirmation
- [ ] Delete button removes review permanently

### 2.4 Replies
- [ ] "Reply" button opens reply form
- [ ] Can write and save a reply
- [ ] Reply appears on the review
- [ ] "Edit Reply" allows changing existing reply
- [ ] "Remove Reply" deletes the reply
- [ ] Reply shows on storefront for approved reviews

### 2.5 Image Moderation
- [ ] Pending images show with yellow border
- [ ] Can approve individual images
- [ ] Can reject individual images
- [ ] Only approved images show on storefront

---

## 3. Settings Page

### 3.1 Settings Display
- [ ] Settings page loads without errors
- [ ] Current settings values are shown correctly

### 3.2 Require Verified Purchase Toggle
- [ ] Can toggle ON
- [ ] Can toggle OFF
- [ ] Setting persists after page refresh
- [ ] Setting affects review submission (test on storefront)

### 3.3 Auto-Approve Reviews Toggle
- [ ] Can toggle ON
- [ ] Can toggle OFF
- [ ] Setting persists after page refresh
- [ ] Setting affects new review status

---

## 4. Storefront Display

### 4.1 Reviews Display
- [ ] Approved reviews are shown
- [ ] Pending reviews are NOT shown
- [ ] Rejected reviews are NOT shown
- [ ] Reviews show: customer name, date, rating, title, content
- [ ] Verified Purchase badge displays correctly
- [ ] Store replies display correctly

### 4.2 Summary Statistics
- [ ] Review count is accurate
- [ ] Average rating calculates correctly
- [ ] Stars display matches average rating

### 4.3 Images in Reviews
- [ ] Approved images display
- [ ] Pending/rejected images do NOT display
- [ ] Clicking image opens lightbox
- [ ] Lightbox shows full-size image
- [ ] Clicking outside lightbox closes it
- [ ] Pressing Escape closes lightbox

### 4.4 Block Settings
- [ ] Section title is customizable
- [ ] Card Size: Small works
- [ ] Card Size: Medium works
- [ ] Card Size: Large works
- [ ] Card Size: Full width works
- [ ] Layout: Equal height grid works
- [ ] Layout: Masonry works
- [ ] Alignment: Left works
- [ ] Alignment: Center works
- [ ] Alignment: Right works
- [ ] Padding: None works
- [ ] Padding: Small works
- [ ] Padding: Medium works
- [ ] Padding: Large works

### 4.5 Multiple Blocks
- [ ] Can add two review blocks to same page
- [ ] Both blocks load and display reviews independently
- [ ] Both blocks can have different settings

---

## 5. Edge Cases & Error Handling

### 5.1 Empty States
- [ ] No reviews: shows "No reviews yet" message
- [ ] No images on review: displays correctly without image section

### 5.2 Long Content
- [ ] Very long review title displays without breaking layout
- [ ] Very long review content displays without breaking layout
- [ ] Very long customer name displays correctly

### 5.3 Special Characters
- [ ] Review with <script> tags doesn't execute (XSS test)
- [ ] Review with HTML tags displays as text
- [ ] Review with emojis displays correctly
- [ ] Review with unicode characters displays correctly

### 5.4 Mobile Responsiveness
- [ ] Reviews display correctly on mobile width
- [ ] Review form is usable on mobile
- [ ] Masonry layout collapses to single column on mobile
- [ ] Images don't overflow on mobile

### 5.5 Network/Error States
- [ ] Slow network: loading state shows
- [ ] API error: error message shown (not blank screen)

---

## 6. Browser Testing

- [ ] Chrome: all features work
- [ ] Firefox: all features work
- [ ] Safari: all features work
- [ ] Edge: all features work
- [ ] Mobile Safari (iOS): all features work
- [ ] Mobile Chrome (Android): all features work

---

## Notes / Issues Found

| Issue | Severity | Steps to Reproduce | Status |
|-------|----------|-------------------|--------|
|       |          |                   |        |
|       |          |                   |        |
|       |          |                   |        |
