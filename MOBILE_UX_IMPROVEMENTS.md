# Proposed Mobile UX & Sidebar Layout Improvements

## Overview
Currently, when the app is viewed on a mobile browser or PWA, collapsing the sidebar hides it completely with no way to reopen it. To solve this, we should implement a standard "slide-over" drawer pattern exclusively for mobile screens.

## Proposed Changes to `App.tsx`

### 1. Intelligent Initial State
Default the sidebar state based on the screen size so it starts collapsed on phones but open on desktops.
```typescript
const [isSidebarOpen, setIsSidebarOpen] = useState(() => 
  typeof window !== 'undefined' ? window.innerWidth >= 768 : true
);
```

### 2. Mobile Top Navigation Bar
Add a permanent top bar (`md:hidden`) that houses a hamburger menu icon to trigger the drawer when it's closed:
```tsx
<div className="md:hidden flex items-center justify-between bg-white dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-800 shrink-0 z-30">
  <span className="text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Budget Book</span>
  <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
    <Menu className="w-6 h-6" />
  </button>
</div>
```

### 3. Slide-Over Backdrop / Overlay
Add a dimmed, clickable background behind the open drawer on mobile to shift focus and allow easy dismissal:
```tsx
{isSidebarOpen && (
  <div 
    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
    onClick={() => setIsSidebarOpen(false)}
  />
)}
```

### 4. Auto-Closing Navigation Links
Update the `NavLink` elements and user menu items to automatically close the sidebar when tapped on mobile screens:
`onClick={() => { if (window.innerWidth < 768) setIsSidebarOpen(false); }}`

## Next Steps
When ready to implement, apply these changes to `App.tsx` and adjust the main `<aside>` CSS classes to use `translate-x` for sliding in and out on mobile (`md:translate-x-0`).