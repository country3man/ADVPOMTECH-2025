// Define a cache name for versioning
const CACHE_NAME = 'pom-tech-cache-v3';

// List of files to cache on service worker installation
const urlsToCache = [
  '/',
  'index.html',
  'logout.html',
  'src/index.css',
  'src/index.tsx',
  'manifest.json',
  'assets/images/avatar.png',
  'assets/images/adv.jpeg',
  'assets/images/PMTC.jpg',
  'assets/images/class%201.jpg',
  'assets/images/2024.jpg',
  'assets/images/class.jpg',
  'assets/images/group%20B.jpg',
  'assets/videos/vid.mp4',
  'assets/images/log.jpeg',
  'assets/images/mat.jpg',
  'assets/images/mark.jpg',
  'assets/images/Ak.jpg',
  'assets/images/livings.jpg',
  'assets/images/vigi.jpg',
  'assets/images/Nats.jpg',
  'assets/images/puke.jpg',
  'assets/images/dan.jpg',
  'assets/images/Garry.jpg',
  'assets/images/bela%20(1).jpg',
  'assets/images/kama.jpg',
  'assets/images/philip.jpg',
  'assets/images/sam.jpg',
  'assets/images/Samson.jpg',
  'assets/images/allan.jpg',
  'assets/images/steven.jpg',
  'assets/documents/solar_hybrid_proposal.pdf',
  'https://i.imgur.com/gYxN36D.png', // App download image
  'https://cdn.freesound.org/previews/219/219244_4032688-lq.mp3' // Notification sound
];

// Install event: triggered when the service worker is first installed.
self.addEventListener('install', event => {
  // waitUntil() ensures that the service worker will not install until the code inside has successfully completed.
  event.waitUntil(
    // Open the cache.
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add all the specified URLs to the cache.
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: triggered for every network request made by the page.
self.addEventListener('fetch', event => {
  // This service worker only caches GET requests.
  // If the request is not a GET request, we will not handle it,
  // and the browser will make the request as if there were no service worker.
  // This is important to avoid interfering with API POST requests (like Gemini).
  if (event.request.method !== 'GET') {
    return;
  }

  // respondWith() hijacks the request and allows us to provide our own response.
  event.respondWith(
    // Check if the request is already in the cache.
    caches.match(event.request)
      .then(response => {
        // If a cached response is found, return it.
        if (response) {
          return response;
        }

        // If the request is not in the cache, fetch it from the network.
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response.
            // We don't cache non-200 responses or third-party resources without CORS.
            if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream and can only be consumed once.
            // We need one copy for the browser to render and another to store in the cache.
            const responseToCache = response.clone();

            // Open the cache and add the new response.
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            // Return the original response to the browser.
            return response;
          }
        );
      })
  );
});

// Activate event: triggered when the service worker is activated.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // The name of the current cache

  event.waitUntil(
    // Get all cache keys (cache names).
    caches.keys().then(cacheNames => {
      return Promise.all(
        // Map over all cache names.
        cacheNames.map(cacheName => {
          // If a cache is not in our whitelist, delete it.
          // This is useful for cleaning up old caches from previous versions.
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});