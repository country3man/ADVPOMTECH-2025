/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Chat, Type } from "@google/genai";

// Fix: Add a global declaration for panelSliderIntervals on the Window object
declare global {
    interface Window {
        panelSliderIntervals: number[];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- GEMINI API SETUP ---
    // IMPORTANT: This key is a placeholder and should be handled securely.
    // In a real application, this would be managed via environment variables and a backend proxy.
    const API_KEY = process.env.API_KEY;
    let ai;
    let chat: Chat | null = null;
    try {
      ai = new GoogleGenAI({ apiKey: API_KEY });
    } catch(e) {
      console.error("Failed to initialize GoogleGenAI", e);
    }

    const welcomeOverlay = document.getElementById('welcome-overlay');
    if (welcomeOverlay) {
        welcomeOverlay.classList.remove('hidden');
        
        welcomeOverlay.addEventListener('transitionend', () => {
            welcomeOverlay.classList.add('hidden');
        }, { once: true });

        setTimeout(() => {
            welcomeOverlay.style.opacity = '0';
        }, 10);
    }

    const body = document.body;
    const brightnessToggle = document.getElementById('brightness-toggle');

    // --- DATA INITIALIZATION FROM HTML ---
    const data = {
        videos: Array.from(document.querySelectorAll('#video-data-source > div')).map(el => ({
            id: (el as HTMLElement).dataset.id,
            title: (el as HTMLElement).dataset.title,
            downloadUrl: (el as HTMLElement).dataset.downloadUrl
        })),
        images: {
            teamA: Array.from(document.querySelectorAll('#image-data-source-a > div')).map(el => ({
                src: (el as HTMLElement).dataset.src,
                title: (el as HTMLElement).dataset.title
            })),
            teamB: Array.from(document.querySelectorAll('#image-data-source-b > div')).map(el => ({
                src: (el as HTMLElement).dataset.src,
                title: (el as HTMLElement).dataset.title
            })),
            templates: Array.from(document.querySelectorAll('#image-data-source-templates > div')).map(el => ({
                src: (el as HTMLElement).dataset.src,
                title: (el as HTMLElement).dataset.title
            }))
        }
    };

    // --- CORE FUNCTIONS ---
    const initializedPages = new Set<string>();

    const setActivePage = id => {
        document.querySelectorAll('.nav-item[data-target]').forEach(n => n.classList.toggle('active', (n as HTMLElement).dataset.target === id));
        document.querySelectorAll('.content-section').forEach(s => s.classList.toggle('hidden', s.id !== id));
        
        window.scrollTo(0, 0);
    };

    // Theme Control
    const applyTheme = (theme) => {
        body.classList.toggle('dark-mode', theme === 'dark-mode');
        (brightnessToggle as HTMLInputElement).checked = (theme === 'dark-mode');
    };
    brightnessToggle.addEventListener('change', () => {
        const isDarkMode = body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark-mode' : 'light');
    });

    // --- LANDING PAGE SLIDER ---
    const landingSlider = document.getElementById('image-slider');
    if (landingSlider) {
        const slides = landingSlider.querySelectorAll('.landing-slide');
        const dotsContainer = document.getElementById('slider-dots');
        let currentSlide = 0, interval;
        const showSlide = i => {
            slides.forEach((slide, index) => slide.classList.toggle('active', index === i));
            if (dotsContainer.children.length > 0) {
                [...dotsContainer.children].forEach((dot, index) => dot.classList.toggle('active', index === i));
            }
            currentSlide = i;
        };
        const nextSlide = () => showSlide((currentSlide + 1) % slides.length);
        const resetInterval = () => { clearInterval(interval); interval = setInterval(nextSlide, 5000); };
        slides.forEach((_, i) => { const dot = document.createElement('span'); dot.className = 'dot'; dot.addEventListener('click', () => { showSlide(i); resetInterval(); }); dotsContainer.appendChild(dot); });
        document.getElementById('prev-slide').addEventListener('click', () => { nextSlide(); resetInterval(); });
        document.getElementById('next-slide').addEventListener('click', () => { nextSlide(); resetInterval(); });
        showSlide(0); resetInterval();
    }

    // --- CALENDAR & EVENT MANAGEMENT ---
    const calendarNav = document.getElementById('calendar-nav');
    const calendarBody = document.getElementById('calendar-body');
    const eventModal = document.getElementById('event-modal');
    const modalTitle = document.getElementById('modal-title');
    const eventInput = document.getElementById('event-input') as HTMLInputElement;
    const eventTimeInput = document.getElementById('event-time-input') as HTMLInputElement;
    const eventReminderInput = document.getElementById('event-reminder-input') as HTMLSelectElement;
    const saveEventBtn = document.getElementById('save-event-btn');
    const cancelEventBtn = document.getElementById('cancel-event-btn');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');
    const logoutConfirmationModal = document.getElementById('logout-confirmation-modal');
    const logoutConfirmYesBtn = document.getElementById('logout-confirm-yes-btn');
    const logoutConfirmNoBtn = document.getElementById('logout-confirm-no-btn');
    const notificationContainer = document.getElementById('notification-container');
    const notificationSound = document.getElementById('notification-sound') as HTMLAudioElement;
    let sessionNotifiedIds = new Set();
    let displayedDate;
    let events = JSON.parse(localStorage.getItem('calendarEvents')) || {};
    let currentEditingEvent = null;

    const getPngDate = () => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (3600000 * 10)); // UTC+10 for PNG
    };
    
    const saveEvents = () => localStorage.setItem('calendarEvents', JSON.stringify(events));
    
    const openEventModal = (date, event = null) => {
        body.classList.add('modal-open');
        eventModal.classList.remove('hidden');
        eventInput.value = event ? event.text : '';
        eventTimeInput.value = event && event.time ? event.time : '';
        eventReminderInput.value = event && event.reminder ? event.reminder : 'none';
        modalTitle.textContent = event ? 'Edit Event' : 'Add Event';
        currentEditingEvent = { date, id: event ? event.id : Date.now() };
        eventInput.focus();
    };

    const closeEventModal = () => {
        body.classList.remove('modal-open');
        eventModal.classList.add('hidden');
        currentEditingEvent = null;
    };
    
    saveEventBtn.addEventListener('click', () => {
        const text = eventInput.value.trim();
        const time = eventTimeInput.value;
        const reminder = eventReminderInput.value;

        if (!text || !currentEditingEvent) return;
        if (reminder !== 'none' && !time) {
            alert('Please set an event time to add a reminder.');
            return;
        }

        const { date, id } = currentEditingEvent;
        if (!events[date]) events[date] = [];
        
        const eventIndex = events[date].findIndex(e => e.id === id);
        if(eventIndex > -1) {
            events[date][eventIndex] = { ...events[date][eventIndex], text, time, reminder };
        } else {
            events[date].push({ id, text, time, reminder });
        }
        saveEvents();
        generateCalendar(displayedDate);
        closeEventModal();
    });

    cancelEventBtn.addEventListener('click', closeEventModal);

    const hideDeleteConfirmation = () => {
        body.classList.remove('modal-open');
        confirmationModal.classList.add('hidden');
    };

    const showDeleteConfirmation = (date, eventId) => {
        body.classList.add('modal-open');
        confirmationModal.classList.remove('hidden');

        confirmYesBtn.addEventListener('click', () => {
            events[date] = events[date].filter(e => e.id !== eventId);
            if (events[date].length === 0) delete events[date];
            sessionNotifiedIds.delete(eventId);
            saveEvents();
            generateCalendar(displayedDate);
            hideDeleteConfirmation();
        }, { once: true });

        confirmNoBtn.addEventListener('click', () => {
            hideDeleteConfirmation();
        }, { once: true });
    };
    
    const generateCalendar = (date) => {
        calendarBody.innerHTML = '';
        const month = date.getMonth();
        const year = date.getFullYear();
        const today = getPngDate();
        const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        calendarNav.innerHTML = `
            <button id="prev-month">&lt;</button>
            <h4 style="margin:0;">${monthNames[month]} ${year}</h4>
            <button id="next-month">&gt;</button>`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let day = 1;
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('tr');
            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('td');
                if (i === 0 && j < firstDay || day > daysInMonth) {
                    // empty cell
                } else {
                    const dateStr = `${year}-${month}-${day}`;
                    const dayWrapper = document.createElement('div');
                    dayWrapper.className = 'day-number-wrapper';

                    const dayNumber = document.createElement('span');
                    dayNumber.className = 'day-number';
                    dayNumber.textContent = String(day);
                    
                    const addBtn = document.createElement('span');
                    addBtn.className = 'add-event-btn';
                    addBtn.textContent = '+';
                    addBtn.onclick = () => openEventModal(dateStr);
                    
                    dayWrapper.appendChild(dayNumber);
                    dayWrapper.appendChild(addBtn);
                    cell.appendChild(dayWrapper);

                    if (dateStr === todayStr) cell.classList.add('current-day');

                    if(events[dateStr]) {
                        events[dateStr].sort((a,b) => (a.time || '').localeCompare(b.time || '')).forEach(event => {
                            const eventEl = document.createElement('div');
                            eventEl.className = 'event';
                            
                            const eventText = document.createElement('span');
                            const eventTime = event.time ? `<strong>${event.time}</strong> - ` : '';
                            eventText.innerHTML = eventTime + event.text;
                            eventEl.appendChild(eventText);

                            const menuBtn = document.createElement('span');
                            menuBtn.className = 'event-menu-btn';
                            menuBtn.textContent = ':';
                            menuBtn.onclick = (e) => {
                                e.stopPropagation();
                                showEventMenu(eventEl, dateStr, event.id);
                            };
                            eventEl.appendChild(menuBtn);
                            cell.appendChild(eventEl);
                        });
                    }
                    day++;
                }
                row.appendChild(cell);
            }
            calendarBody.appendChild(row);
            if (day > daysInMonth) break;
        }

        document.getElementById('prev-month').addEventListener('click', () => {
            displayedDate.setMonth(displayedDate.getMonth() - 1);
            generateCalendar(displayedDate);
        });
        document.getElementById('next-month').addEventListener('click', () => {
            displayedDate.setMonth(displayedDate.getMonth() + 1);
            generateCalendar(displayedDate);
        });
    };
    
    const showEventMenu = (eventElement, date, eventId) => {
        document.querySelectorAll('.event-menu').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'event-menu';
        menu.innerHTML = `<div class="edit-event">✎ Edit</div><div class="delete-event">🗑️ Delete</div>`;
        
        (menu.querySelector('.edit-event') as HTMLElement).onclick = () => {
            const eventToEdit = events[date].find(e => e.id === eventId);
            openEventModal(date, eventToEdit);
            menu.remove();
        };
        (menu.querySelector('.delete-event') as HTMLElement).onclick = () => {
            showDeleteConfirmation(date, eventId);
            menu.remove();
        };
        
        eventElement.appendChild(menu);
        
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target as Node)) {
                   menu.remove();
                }
            }, { once: true });
        }, 0);
    };
    
    const scheduleMidnightUpdate = () => {
        const now = getPngDate();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const msUntilMidnight = tomorrow.getTime() - now.getTime();
        
        setTimeout(() => {
            displayedDate = getPngDate();
            generateCalendar(displayedDate);
            setInterval(() => {
                displayedDate = getPngDate();
                generateCalendar(displayedDate);
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight + 1000);
    };

    const showNotification = (event) => {
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.setAttribute('role', 'alert');
    
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close-btn';
        closeBtn.innerHTML = '&times;'; // This is safe HTML
        closeBtn.setAttribute('aria-label', 'Close notification');
    
        const title = document.createElement('h5');
        title.textContent = '🔔 Event Reminder'; // Using textContent is safe
    
        const message = document.createElement('p');
        const strongEl = document.createElement('strong');
        strongEl.textContent = event.text; // Using textContent is safe to prevent XSS
        message.appendChild(strongEl);
        message.append(` at ${event.time}`); // Appending a string is safe
    
        toast.appendChild(closeBtn);
        toast.appendChild(title);
        toast.appendChild(message);
        
        const closeToast = () => {
            toast.classList.add('closing');
            toast.addEventListener('animationend', () => toast.remove());
        };
        
        closeBtn.addEventListener('click', closeToast);
        
        notificationContainer.appendChild(toast);
        
        notificationSound.play().catch(e => console.warn("Audio playback failed. User interaction might be required.", e));
        
        setTimeout(closeToast, 10000); // Auto-dismiss after 10 seconds
    };

    const checkReminders = () => {
        const now = getPngDate();
        const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const todaysEvents = events[todayStr] || [];

        todaysEvents.forEach(event => {
            if (!event.reminder || event.reminder === 'none' || !event.time || sessionNotifiedIds.has(event.id)) {
                return;
            }

            const [hours, minutes] = event.time.split(':').map(Number);
            const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
            
            if (now.getTime() > eventDate.getTime()) {
                return;
            }

            const reminderMinutes = parseInt(event.reminder, 10);
            const notificationTime = new Date(eventDate.getTime() - reminderMinutes * 60 * 1000);
            
            if (now.getTime() >= notificationTime.getTime()) {
                showNotification(event);
                sessionNotifiedIds.add(event.id);
            }
        });
    };
    
    // --- ABOUT US DROPDOWN ---
    const locationToggle = document.getElementById('location-toggle');
    if(locationToggle) {
        locationToggle.addEventListener('click', () => {
            const content = document.getElementById('location-content');
            const icon = locationToggle.querySelector('.icon-arrow');
            content.classList.toggle('open');
            icon.classList.toggle('down');
            icon.classList.toggle('up');
        });
    }
    
    // --- SLIDING PANEL & RESOURCE VIEWER ---
    const menuPanelContainer = document.getElementById('menu-panel-container');
    const resourceViewer = document.getElementById('resource-viewer');
    const resourceViewerContent = document.getElementById('resource-viewer-content');
    
    const openPanelSystem = () => menuPanelContainer.classList.add('open');
    const closePanelSystem = () => menuPanelContainer.classList.remove('open');
    const openResourceViewer = (templateId) => {
        const template = document.getElementById(templateId) as HTMLTemplateElement;
        if (!template) return;
        
        resourceViewerContent.innerHTML = '';
        const content = template.content.cloneNode(true);
        resourceViewerContent.appendChild(content);
        resourceViewer.classList.add('visible');
        body.classList.add('viewer-open');

        // Clear gallery slider intervals if opening a different resource
        if (templateId !== 'gallery-template' && window.panelSliderIntervals?.length > 0) {
            window.panelSliderIntervals.forEach(clearInterval);
            window.panelSliderIntervals = [];
        }
        
        // Call specific initializers for the loaded content
        switch (templateId) {
            case 'image-to-video-template':
                initImageToVideoLogic();
                break;
            case 'video-library-template':
                initVideoPageLogic();
                break;
            case 'gallery-template':
                initImageGalleryPageLogic();
                break;
            case 'templates-template':
                initTemplatesPageLogic();
                break;
            case 'pdf-template':
                initPdfViewerLogic();
                break;
        }
    };

    const closeResourceViewer = () => {
        resourceViewer.classList.remove('visible');
        body.classList.remove('viewer-open');
        // Clear gallery slider intervals when closing the viewer
        if (window.panelSliderIntervals?.length > 0) {
            window.panelSliderIntervals.forEach(clearInterval);
            window.panelSliderIntervals = [];
        }
    };

    document.getElementById('menu-icon').addEventListener('click', openPanelSystem);
    menuPanelContainer.querySelector('.sliding-panel-overlay').addEventListener('click', closePanelSystem);
    menuPanelContainer.querySelector('.close-panel-btn').addEventListener('click', closePanelSystem);
    document.getElementById('close-resource-viewer-btn').addEventListener('click', closeResourceViewer);

    document.querySelectorAll('.resource-item').forEach(item => {
        item.addEventListener('click', () => {
            const templateId = (item as HTMLElement).dataset.templateId;
            const pageTarget = (item as HTMLElement).dataset.pageTarget;
            
            closePanelSystem();

            if (templateId) {
                setTimeout(() => openResourceViewer(templateId), 400);
            } else if (pageTarget) {
                setActivePage(pageTarget);
            }
        });
    });
    
    // --- FULLSCREEN IMAGE VIEWER ---
    const fullscreenViewer = document.getElementById('fullscreen-viewer');
    const fullscreenContentHost = document.getElementById('fullscreen-content-host');
    const openFullscreenImageViewer = (content) => {
        fullscreenContentHost.innerHTML = content;
        fullscreenViewer.classList.add('visible');
        body.classList.add('viewer-open');
    };
    const closeFullscreenImageViewer = () => {
        fullscreenViewer.classList.remove('visible');
        body.classList.remove('viewer-open');
        setTimeout(() => { fullscreenContentHost.innerHTML = ''; }, 400);
    };
    fullscreenViewer.addEventListener('click', (e) => {
        if (e.target === fullscreenViewer || (e.target as HTMLElement).classList.contains('close-viewer-btn')) {
            closeFullscreenImageViewer();
        }
    });

    // --- DYNAMIC CONTENT INITIALIZERS ---
    const initPdfViewerLogic = () => {
        const pdfContainer = resourceViewerContent.querySelector('#pdf-viewer-container');
        if (!pdfContainer) return;
    
        pdfContainer.addEventListener('click', (e) => {
            const placeholder = (e.target as HTMLElement).closest('.pdf-placeholder') as HTMLElement;
            if (!placeholder) return;
    
            const host = placeholder.parentElement;
            if (!host) return;
    
            const pdfSrc = placeholder.dataset.src;
            const pdfTitle = placeholder.dataset.title;
    
            if (pdfSrc && pdfTitle) {
                const iframe = document.createElement('iframe');
                iframe.src = pdfSrc;
                iframe.title = pdfTitle;
                
                host.innerHTML = '';
                host.appendChild(iframe);
            }
        });
    };

    const renderImageGrid = (gridContainer, images, start, limit) => {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        images.slice(start, start + limit).forEach(imgData => {
            const img = document.createElement('img');
            img.src = imgData.src;
            img.alt = imgData.title;
            img.title = imgData.title;
            img.className = 'gallery-image';
            img.addEventListener('click', () => openFullscreenImageViewer(`<img src="${imgData.src}" alt="${imgData.title}"><p class="viewer-caption">${imgData.title}</p>`));
            gridContainer.appendChild(img);
        });
    };

    const initVideoPageLogic = () => {
        const videoListContainer = resourceViewerContent.querySelector('#video-list-container');
        if (!videoListContainer) return;

        const resetVideoItem = (item) => {
            const playerWrapper = item.querySelector('.video-player-wrapper');
            const videoData = { id: item.dataset.videoId, title: item.dataset.title };
            if (playerWrapper) {
                playerWrapper.innerHTML = `
                    <img class="video-thumbnail" src="https://img.youtube.com/vi/${videoData.id}/0.jpg" alt="Thumbnail for ${videoData.title}">
                    <div class="play-icon"></div>`;
            }
            item.dataset.played = 'false';
        };
        
        data.videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-item';
            item.dataset.videoId = video.id;
            item.dataset.title = video.title;
            item.dataset.downloadUrl = video.downloadUrl;
            item.innerHTML = `
                <div class="video-item-header">${video.title}</div>
                <div class="video-player-wrapper"></div>
                <div style="text-align:center; margin-top:10px;">
                    <button class="action-btn download-video-btn">Download HD</button>
                </div>`;
            resetVideoItem(item);
            videoListContainer.appendChild(item);
        });

        videoListContainer.addEventListener('click', (e) => {
            const videoItem = (e.target as HTMLElement).closest('.video-item') as HTMLElement;
            if (!videoItem) return;

            if ((e.target as HTMLElement).closest('.video-player-wrapper') && videoItem.dataset.played !== 'true') {
                (videoListContainer.querySelectorAll('.video-item[data-played="true"]') as NodeListOf<HTMLElement>).forEach(resetVideoItem);
                const videoId = videoItem.dataset.videoId;
                const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                videoItem.dataset.played = 'true';
                videoItem.querySelector('.video-player-wrapper').innerHTML = `
                    <iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                `;
            }
            
            if ((e.target as HTMLElement).classList.contains('download-video-btn')) {
                const downloadUrl = videoItem.dataset.downloadUrl;
                const title = videoItem.dataset.title;
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${title.replace(/\s/g, '_')}_HD.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        });
    };

    const initImageGalleryPageLogic = () => {
        window.panelSliderIntervals = [];
        const galleryPage = resourceViewerContent.querySelector('#gallery-container-in-viewer');
        if (!galleryPage) return;
        
        const initPanelSlider = (sliderId, dotsId, images) => {
            const sliderContainer = galleryPage.querySelector(`#${sliderId}`);
            const dotsContainer = galleryPage.querySelector(`#${dotsId}`);
            if (!sliderContainer || !dotsContainer) return;
            
            sliderContainer.innerHTML = '';
            dotsContainer.innerHTML = '';

            images.forEach((imgData, index) => {
                const slide = document.createElement('div');
                slide.className = 'panel-slide' + (index === 0 ? ' active' : '');
                slide.innerHTML = `<img src="${imgData.src}" alt="${imgData.title}">`;
                slide.querySelector('img').addEventListener('click', () => openFullscreenImageViewer(`<img src="${imgData.src}" alt="${imgData.title}"><p class="viewer-caption">${imgData.title}</p>`));
                sliderContainer.appendChild(slide);

                const dot = document.createElement('span');
                dot.className = 'panel-dot' + (index === 0 ? ' active' : '');
                dotsContainer.appendChild(dot);
            });
            
            const prevBtn = document.createElement('button'); prevBtn.className = 'panel-slider-control prev'; prevBtn.innerHTML = '&lt;'; sliderContainer.appendChild(prevBtn);
            const nextBtn = document.createElement('button'); nextBtn.className = 'panel-slider-control next'; nextBtn.innerHTML = '&gt;'; sliderContainer.appendChild(prevBtn);

            const slides = sliderContainer.querySelectorAll('.panel-slide');
            const dots = dotsContainer.querySelectorAll('.panel-dot');
            let currentSlide = 0;

            const showSlide = (i) => {
                slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
                dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
                currentSlide = i;
            };
            
            const goToNext = () => showSlide((currentSlide + 1) % slides.length);
            const goToPrev = () => showSlide((currentSlide - 1 + slides.length) % slides.length);
            
            dots.forEach((dot, i) => dot.addEventListener('click', () => showSlide(i)));
            prevBtn.addEventListener('click', goToPrev);
            nextBtn.addEventListener('click', goToNext);

            const interval = window.setInterval(goToNext, 3000);
            window.panelSliderIntervals.push(interval);
        };

        galleryPage.querySelectorAll('.group-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                galleryPage.querySelector('.group-btn.active').classList.remove('active');
                btn.classList.add('active');
                galleryPage.querySelectorAll('.gallery-team-container').forEach(c => c.classList.add('hidden'));
                galleryPage.querySelector(`#${(btn as HTMLElement).dataset.target}`).classList.remove('hidden');
            });
        });
        
        const teamAGrid = galleryPage.querySelector('#team-a-grid');
        const teamBGrid = galleryPage.querySelector('#team-b-grid');
        initPanelSlider('team-a-slider', 'team-a-dots', data.images.teamA.slice(0, 3));
        renderImageGrid(teamAGrid, data.images.teamA, 3, 4); 
        initPanelSlider('team-b-slider', 'team-b-dots', data.images.teamB.slice(0, 3));
        renderImageGrid(teamBGrid, data.images.teamB, 3, 4); 
        
        const viewMoreA = galleryPage.querySelector('#view-more-images-a');
        const viewLessA = galleryPage.querySelector('#view-less-images-a');
        viewMoreA.addEventListener('click', () => { renderImageGrid(teamAGrid, data.images.teamA, 3, 20); viewMoreA.classList.add('hidden'); viewLessA.classList.remove('hidden'); });
        viewLessA.addEventListener('click', () => { renderImageGrid(teamAGrid, data.images.teamA, 3, 4); viewMoreA.classList.remove('hidden'); viewLessA.classList.add('hidden'); });
        
        const viewMoreB = galleryPage.querySelector('#view-more-images-b');
        const viewLessB = galleryPage.querySelector('#view-less-images-b');
        viewMoreB.addEventListener('click', () => { renderImageGrid(teamBGrid, data.images.teamB, 3, 20); viewMoreB.classList.add('hidden'); viewLessB.classList.remove('hidden'); });
        viewLessB.addEventListener('click', () => { renderImageGrid(teamBGrid, data.images.teamB, 3, 4); viewMoreB.classList.remove('hidden'); viewLessB.classList.add('hidden'); });
    };
    
    /**************************************************/
    /* --- OUR TEMPLATES PAGE LOGIC --- */
    /**************************************************/
    const initTemplatesPageLogic = () => {
        const templatesContainer = resourceViewerContent.querySelector('#templates-container-in-viewer');
        if (!templatesContainer) return;
        const templatesGrid = templatesContainer.querySelector('#templates-grid');
        
        const renderTemplatesGrid = (limit) => renderImageGrid(templatesGrid, data.images.templates, 0, limit);
        
        const viewMoreBtn = templatesContainer.querySelector('#view-more-templates');
        const viewLessBtn = templatesContainer.querySelector('#view-less-templates');
        
        viewMoreBtn.addEventListener('click', () => {
            renderTemplatesGrid(20);
            viewMoreBtn.classList.add('hidden');
            viewLessBtn.classList.remove('hidden');
        });
        viewLessBtn.addEventListener('click', () => {
            renderTemplatesGrid(3);
            viewMoreBtn.classList.remove('hidden');
            viewLessBtn.classList.add('hidden');
        });
        
        (templatesContainer.querySelector('#link-copy-box') as HTMLElement).addEventListener('click', (e) => {
            const box = e.currentTarget as HTMLElement;
            navigator.clipboard.writeText(window.location.href).then(() => {
                const originalText = "Click to copy the website link";
                box.textContent = 'Copied!';
                setTimeout(() => { box.textContent = originalText; }, 2000);
            });
        });

        // Initial render
        renderTemplatesGrid(3); 
    };

    /**************************************************/
    /* --- IMAGE TO VIDEO LOGIC --- */
    /**************************************************/
    const initImageToVideoLogic = () => {
        const fileInputEl = resourceViewerContent.querySelector('#image-to-video-input-file') as HTMLInputElement;
        const promptInputEl = resourceViewerContent.querySelector('#image-to-video-prompt') as HTMLTextAreaElement;
        const generateBtn = resourceViewerContent.querySelector('#image-to-video-generate-btn') as HTMLButtonElement;
        const statusContainer = resourceViewerContent.querySelector('#image-to-video-status');
        const resultContainer = resourceViewerContent.querySelector('#image-to-video-result');
        const imagePreviewEl = resourceViewerContent.querySelector('#image-to-video-preview') as HTMLImageElement;
        const imagePlaceholderEl = resourceViewerContent.querySelector('#image-upload-placeholder');
    
        if (!fileInputEl || !promptInputEl || !generateBtn || !statusContainer || !resultContainer || !imagePreviewEl || !imagePlaceholderEl) {
            console.error("Image to Video UI elements not found!");
            return;
        }

        let selectedFile: { data: string; mimeType: string } | null = null;
    
        const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]); // remove data:mime/type;base64, part
            reader.onerror = error => reject(error);
        });

        fileInputEl.addEventListener('change', async () => {
            const file = fileInputEl.files?.[0];
            if (file) {
                if (file.size > 4 * 1024 * 1024) { // 4MB limit for inline data
                    alert('Please select an image smaller than 4MB.');
                    fileInputEl.value = '';
                    return;
                }
                const base64Data = await toBase64(file);
                selectedFile = { data: base64Data, mimeType: file.type };
                imagePreviewEl.src = URL.createObjectURL(file);
                imagePreviewEl.classList.remove('hidden');
                imagePlaceholderEl.classList.add('hidden');
            } else {
                selectedFile = null;
                imagePreviewEl.src = '#';
                imagePreviewEl.classList.add('hidden');
                imagePlaceholderEl.classList.remove('hidden');
            }
        });
    
        generateBtn.addEventListener('click', async () => {
            if (!navigator.onLine) {
                alert("This feature requires an internet connection. Please connect to the internet and try again.");
                return;
            }

            const prompt = promptInputEl.value.trim();
            if (!selectedFile) {
                alert('Please upload an image.');
                return;
            }
            if (!prompt) {
                alert('Please enter a prompt to generate a video.');
                return;
            }
    
            generateBtn.disabled = true;
            resultContainer.innerHTML = '';
            statusContainer.innerHTML = `
                <div class="loader"></div>
                <p id="status-message">Initializing...</p>
            `;
            const statusMessageEl = resourceViewerContent.querySelector('#status-message');
            
            const reassuringMessages = [
                "AI is analyzing the image...",
                "Warming up the video generators...",
                "Composing video scenes from your image...",
                "Rendering high-quality footage...",
                "This can take a few minutes, please wait...",
                "Adding digital stardust...",
                "Almost there..."
            ];
            let messageIndex = 0;
            const statusInterval = setInterval(() => {
                if(statusMessageEl) {
                    statusMessageEl.textContent = reassuringMessages[messageIndex % reassuringMessages.length];
                    messageIndex++;
                }
            }, 4000);
    
            const setStatus = (msg) => {
                if(statusMessageEl) statusMessageEl.textContent = msg;
            };
    
            try {
                if (!ai) throw new Error("AI Client not initialized.");
                
                setStatus('Generating video from image...');
    
                let operation = await ai.models.generateVideos({
                    model: 'veo-2.0-generate-001',
                    prompt: prompt,
                    image: {
                        imageBytes: selectedFile.data,
                        mimeType: selectedFile.mimeType,
                    },
                    config: { numberOfVideos: 1 }
                });
    
                while (!operation.done) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                    operation = await ai.operations.getVideosOperation({ operation: operation });
                }
    
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (!downloadLink) {
                    throw new Error('Video generation did not return a valid download link.');
                }
    
                setStatus('Downloading generated video...');
                const videoResponse = await fetch(`${downloadLink}&key=${API_KEY}`);
                if (!videoResponse.ok) {
                    throw new Error(`Failed to download video. Status: ${videoResponse.statusText}`);
                }
                const videoBlob = await videoResponse.blob();
                const videoUrl = URL.createObjectURL(videoBlob);
    
                statusContainer.innerHTML = ''; // Clear status
                resultContainer.innerHTML = `<video src="${videoUrl}" controls autoplay loop muted playsinline></video>`;
    
            } catch (error) {
                console.error('Image to Video Error:', error);
                let userFriendlyMessage: string;
                const errorMessage = String(error).toLowerCase();
                
                if (errorMessage.includes('video generation did not return a valid download link')) {
                    userFriendlyMessage = `
                        <p><strong>Video Generation Unsuccessful</strong></p>
                        <p>The AI couldn't create a video for this request. This can happen due to the specific nature of the prompt or content safety guidelines.</p>
                        <p>Please try rephrasing your idea or entering a different one.</p>
                    `;
                } else if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
                    userFriendlyMessage = `
                        <p><strong>Usage Limit Reached</strong></p>
                        <p>The video generation feature has reached its usage limit for the current period, which can happen due to high demand.</p>
                        <p>Please try again later. If the issue persists, the application owner may need to check the API plan and billing details.</p>
                        <p style="font-size: 0.8em; margin-top: 15px;">For more information, see the <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer">official documentation on rate limits</a>.</p>
                    `;
                } else {
                     userFriendlyMessage = `<p><strong>An unexpected error occurred:</strong> ${error.message}</p><p>Please try again later.</p>`;
                }
            
                statusContainer.innerHTML = `<div class="error-message">${userFriendlyMessage}</div>`;

            } finally {
                clearInterval(statusInterval);
                generateBtn.disabled = false;
            }
        });
    };

    // --- SEARCH & SEARCH HISTORY ---
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
    const searchHistoryContainer = document.getElementById('search-history-container');
    let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];

    const checkAndClearHistory = () => {
        const lastSearchTime = localStorage.getItem('searchHistoryTimestamp');
        if (!lastSearchTime) return;
        const fiveMinutes = 5 * 60 * 1000;
        if (Date.now() - Number(lastSearchTime) > fiveMinutes) {
            searchHistory = [];
            localStorage.removeItem('searchHistory');
            localStorage.removeItem('searchHistoryTimestamp');
            renderSearchHistory();
        }
    };

    const updateSearchHistory = (query) => {
        if (!query) return;
        const lowerCaseQuery = query.toLowerCase();
        searchHistory = searchHistory.filter(item => item.toLowerCase() !== lowerCaseQuery);
        searchHistory.unshift(query);
        searchHistory = searchHistory.slice(0, 5);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        localStorage.setItem('searchHistoryTimestamp', String(Date.now()));
        renderSearchHistory();
    };

    const renderSearchHistory = () => {
        searchHistoryContainer.innerHTML = '';
        if (searchHistory.length > 0) {
            const title = document.createElement('span');
            title.textContent = 'Recent Searches: ';
            searchHistoryContainer.appendChild(title);
            searchHistory.forEach(term => {
                const item = document.createElement('span');
                item.className = 'search-history-item';
                item.textContent = term;
                item.onclick = () => {
                    searchInput.value = term;
                    performSearch();
                };
                searchHistoryContainer.appendChild(item);
            });
        }
    };

    const performSearch = async () => {
        if (!navigator.onLine) {
            alert("Search requires an internet connection. Please connect to the internet and try again.");
            return;
        }

        const query = searchInput.value.trim();
        if (!query) return;

        if (!ai) {
            alert("AI client is not initialized. Cannot perform search.");
            return;
        }

        searchBtn.disabled = true;
        searchBtn.innerHTML = '<span class="btn-spinner"></span>';
        
        updateSearchHistory(query);
        const allProfiles = document.querySelectorAll('#contact .profile-card');
        const resultsGrid = document.getElementById('search-results-grid');
        resultsGrid.innerHTML = ''; // Clear previous results

        try {
            const allMembersData = Array.from(allProfiles).map(card => {
                const groupContainer = card.closest('.profile-container');
                const groupName = groupContainer?.querySelector('.group-info-card h4')?.textContent?.trim() || 'N/A';
                return {
                    name: (card as HTMLElement).dataset.name || '',
                    position: card.querySelector<HTMLElement>('.profile-position')?.textContent || '',
                    group: groupName
                };
            });

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `You are a smart search assistant for a company's team directory. Based on the user's query, find the matching people from the provided JSON list of members.
                
User Query: "${query}"
                
Members List (JSON): ${JSON.stringify(allMembersData)}
                
Return a JSON object with a single key "matchingNames", which is an array of strings. Each string in the array must be the full name of a person who matches the query, exactly as it appears in the 'name' field of the Members List. If no one matches, return an empty array for "matchingNames".`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            matchingNames: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.STRING
                                }
                            }
                        },
                        required: ['matchingNames']
                    }
                }
            });

            const resultJson = JSON.parse(response.text);
            const matchingNames: string[] = resultJson.matchingNames || [];

            let found = false;
            if (matchingNames.length > 0) {
                matchingNames.forEach(name => {
                    const card = Array.from(allProfiles).find(p => (p as HTMLElement).dataset.name === name);
                    if (card) {
                        const newCard = card.cloneNode(true);
                        resultsGrid.appendChild(newCard);
                        found = true;
                    }
                });
            }
            
            document.getElementById('no-results-message').classList.toggle('hidden', found);

        } catch (error) {
            console.error('AI Search Error:', error);
            resultsGrid.innerHTML = `<div class="error-message"><strong>Search failed.</strong><p>${error.message}</p><p>Please try a different query or check the connection.</p></div>`;
            document.getElementById('no-results-message').classList.add('hidden');
        } finally {
            setActivePage('search-results');
            searchBtn.disabled = false;
            searchBtn.innerHTML = 'Search';
        }
    };
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', e => e.key === 'Enter' && performSearch());

    // --- PROFILE CARD TOGGLE ---
    const initProfileToggle = () => {
        document.querySelectorAll('.profile-container').forEach(container => {
            const cards = container.querySelectorAll('.profile-card');
            if (cards.length > 4) {
                cards.forEach((card, index) => {
                    if (index >= 4) card.classList.add('hidden-card');
                });
            } else {
                const toggleButton = container.querySelector('.toggle-view-btn');
                if(toggleButton) toggleButton.classList.add('hidden');
            }
        });

        document.querySelectorAll('.toggle-view-btn').forEach(button => {
            button.addEventListener('click', () => {
                const targetGridId = (button as HTMLElement).dataset.targetGrid;
                const container = document.getElementById(targetGridId);
                const cards = container.querySelectorAll('.profile-card');
                cards.forEach((card, index) => { if (index >= 4) card.classList.toggle('hidden-card'); });
                const textSpan = button.querySelector('span:first-child');
                const iconSpan = button.querySelector('.icon-arrow');
                if (iconSpan.classList.contains('down')) {
                    textSpan.textContent = 'View Less';
                    iconSpan.classList.remove('down');
                    iconSpan.classList.add('up');
                } else {
                    textSpan.textContent = 'View More';
                    iconSpan.classList.remove('up');
                    iconSpan.classList.add('down');
                }
            });
        });
    };

    // --- AI CHATBOT LOGIC ---
    const chatbotFab = document.getElementById('chatbot-fab');
    const chatbotWindow = document.getElementById('chatbot-window');
    const closeChatbotBtn = document.getElementById('close-chatbot-btn');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const chatbotInputForm = document.getElementById('chatbot-input-form');
    const chatbotInput = document.getElementById('chatbot-input') as HTMLInputElement;

    const toggleChatbot = (forceOpen?: boolean) => {
        const isOpen = chatbotWindow.classList.contains('open');
        if (typeof forceOpen === 'boolean' ? forceOpen : !isOpen) {
            chatbotWindow.classList.add('open');
            chatbotInput.focus();
            if (!chat && ai) {
                try {
                    chat = ai.chats.create({
                        model: 'gemini-2.5-flash',
                        config: {
                            systemInstruction: 'You are a friendly and helpful assistant for POM TECH, a company specializing in advanced solar hybrid systems. Your goal is to answer user questions about the company, its team members, solar technology, and provide general assistance related to the website\'s content. Be concise and professional.',
                        },
                    });
                } catch(e) {
                    appendMessage('Error: Could not initialize AI chat.', 'ai');
                    console.error("Failed to create chat", e);
                }
            }
        } else {
            chatbotWindow.classList.remove('open');
        }
    };

    const appendMessage = (text: string, sender: 'user' | 'ai', options: { isStreaming?: boolean; isHTML?: boolean } = {}) => {
        const { isStreaming = false, isHTML = false } = options;
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', sender);
        if (text === 'thinking') {
            messageElement.innerHTML = `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;
            messageElement.id = 'thinking-bubble';
        } else {
            if (isHTML) {
                messageElement.innerHTML = text;
            } else {
                messageElement.textContent = text;
            }
        }
        if (isStreaming) {
            messageElement.id = 'streaming-bubble';
        }
        chatbotMessages.appendChild(messageElement);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        return messageElement;
    };

    chatbotFab.addEventListener('click', () => toggleChatbot(true));
    closeChatbotBtn.addEventListener('click', () => toggleChatbot(false));

    chatbotInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = chatbotInput.value.trim();
        if (!userInput || !chat) return;

        appendMessage(userInput, 'user');
        chatbotInput.value = '';
        const thinkingBubble = appendMessage('thinking', 'ai');
        
        try {
            const result = await chat.sendMessageStream({ message: userInput });
            let firstChunk = true;
            let aiBubble: HTMLElement | null = null;
    
            for await (const chunk of result) {
                const chunkText = chunk.text;
                if (firstChunk) {
                    thinkingBubble.remove();
                    aiBubble = appendMessage(chunkText, 'ai', { isStreaming: true });
                    firstChunk = false;
                } else {
                    aiBubble.textContent += chunkText;
                }
                chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
            }
            if (aiBubble) aiBubble.id = ''; // Unset ID after streaming is complete

        } catch (error) {
            thinkingBubble.remove();
            let errorMessage = 'Sorry, I encountered an error. Please try again.';
            let isHTMLError = false;
            const errorString = String(error).toLowerCase();
            
            if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('resource_exhausted')) {
                errorMessage = `<p style="margin:0; font-weight: bold;">Usage Limit Reached</p><p style="margin:5px 0 0 0;">The AI assistant has reached its usage limit due to high demand. Please try again later.</p>`;
                isHTMLError = true;
            } else if (!navigator.onLine) {
                errorMessage = 'You appear to be offline. Please check your internet connection.';
            } else if (errorString.includes('http status code: 0')) {
                errorMessage = 'Could not connect to the AI service. This may be due to a network issue or a browser extension blocking the request. Please check your connection and try again.';
            }
            appendMessage(errorMessage, 'ai', { isHTML: isHTMLError });
            console.error('Gemini API Error:', error);
        }
    });

    // --- NEWS & UPDATES ---
    const fetchNewsBtn = document.getElementById('fetch-news-btn') as HTMLButtonElement;
    const newsContainer = document.getElementById('news-container');

    const fetchNews = async () => {
        if (!navigator.onLine) {
            newsContainer.innerHTML = '<p class="error-message">This feature requires an internet connection. Please connect to the internet to fetch the latest news.</p>';
            return;
        }

        if (!ai) {
            newsContainer.innerHTML = '<p class="error-message">AI Client not initialized. Cannot fetch news.</p>';
            return;
        }

        fetchNewsBtn.disabled = true;
        newsContainer.innerHTML = '<div class="loader"></div><p>Fetching latest news...</p>';

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: "Summarize the top 3 latest news articles about solar energy and renewable technology. For each article, provide a clear title and a concise summary.",
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });

            newsContainer.innerHTML = '';
            const newsCard = document.createElement('div');
            newsCard.className = 'news-card';

            const summary = document.createElement('p');
            summary.textContent = response.text;
            newsCard.appendChild(summary);
            
            const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if(sources && sources.length > 0) {
                const sourcesContainer = document.createElement('div');
                sourcesContainer.className = 'news-sources';
                sourcesContainer.innerHTML = '<h5>Sources:</h5>';
                const sourceList = document.createElement('ul');
                
                sources.forEach(source => {
                    if (source.web) {
                        const listItem = document.createElement('li');
                        listItem.innerHTML = `<a href="${source.web.uri}" target="_blank" rel="noopener noreferrer">${source.web.title || source.web.uri}</a>`;
                        sourceList.appendChild(listItem);
                    }
                });
                sourcesContainer.appendChild(sourceList);
                newsCard.appendChild(sourcesContainer);
            }
            
            newsContainer.appendChild(newsCard);

        } catch (error) {
            console.error('Error fetching news:', error);
            newsContainer.innerHTML = `<div class="error-message"><strong>Failed to fetch news.</strong><p>${error.message}</p></div>`;
        } finally {
            fetchNewsBtn.disabled = false;
        }
    };

    if (fetchNewsBtn) {
        fetchNewsBtn.addEventListener('click', fetchNews);
    }
    
    // --- LOGOUT ---
    const showLogoutConfirmation = () => {
        body.classList.add('modal-open');
        logoutConfirmationModal.classList.remove('hidden');
    };

    const hideLogoutConfirmation = () => {
        body.classList.remove('modal-open');
        logoutConfirmationModal.classList.add('hidden');
    };

    document.getElementById('logout-btn').addEventListener('click', e => {
        e.preventDefault();
        showLogoutConfirmation();
    });

    logoutConfirmNoBtn.addEventListener('click', hideLogoutConfirmation);

    logoutConfirmYesBtn.addEventListener('click', () => {
        hideLogoutConfirmation();
        body.classList.add('logging-out');
        const logoutOverlay = document.createElement('div');
        logoutOverlay.className = 'logout-overlay';
        logoutOverlay.innerHTML = `<p>Logging out...</p><div class="loader"></div>`;
        body.appendChild(logoutOverlay);
        setTimeout(() => { window.location.href = 'logout.html'; }, 3000);
    });

    // --- GENERIC EVENT LISTENERS ---
    document.querySelectorAll('.nav-item[data-target]').forEach(item => item.addEventListener('click', e => { e.preventDefault(); setActivePage((item as HTMLElement).dataset.target); }));
    document.querySelectorAll('#contact .group-btn').forEach(b => {
         b.addEventListener('click', () => { 
            document.querySelector('#contact .group-btn.active').classList.remove('active'); 
            b.classList.add('active'); 
            document.querySelectorAll('.profile-container').forEach(c=>c.classList.toggle('hidden', c.id !== (b as HTMLElement).dataset.target)); 
        });
    });

    // Handle zooming for profile and logo images
    document.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' && target.closest('.profile-card')) {
            const profileImg = target as HTMLImageElement;
            e.preventDefault();
            const src = profileImg.src;
            const alt = profileImg.alt;
            const content = `<img src="${src}" alt="${alt}"><p class="viewer-caption">${alt}</p>`;
            openFullscreenImageViewer(content);
        } else if (target.id === 'avatar-logo') {
             const logoImg = target as HTMLImageElement;
             const src = logoImg.src;
             const alt = logoImg.alt;
             const content = `<img src="${src}" alt="${alt}"><p class="viewer-caption">${alt}</p>`;
             openFullscreenImageViewer(content);
        }
    });
    
    // --- SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }


    // --- INITIALIZATION ---
    applyTheme(localStorage.getItem('theme') || 'light');
    setActivePage('landing-page');
    initProfileToggle();
    displayedDate = getPngDate();
    generateCalendar(displayedDate);
    scheduleMidnightUpdate();
    checkAndClearHistory();
    renderSearchHistory();
    setInterval(checkAndClearHistory, 60000);
    checkReminders();
    setInterval(checkReminders, 60000);
});