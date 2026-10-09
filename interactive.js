document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const video = document.getElementById('interactive-camera');
    const steamCanvas = document.getElementById('interactive-steam-canvas');
    const neonCanvas = document.getElementById('interactive-neon-canvas');
    const arCanvas = document.getElementById('interactive-ar-canvas');
    const btnSnap = document.getElementById('btn-snap');
    
    const screen1 = document.getElementById('screen-1');
    const screen2 = document.getElementById('screen-2');
    const previewCanvas = document.getElementById('photo-preview-canvas');
    const countdownEl = document.getElementById('interactive-countdown');
    
    // Toggles & Inputs
    const steamToggle = document.getElementById('steam-toggle');
    const swipeFilterToggle = document.getElementById('swipe-filter-toggle');
    const palmCaptureToggle = document.getElementById('palm-capture-toggle');
    const neonTrailToggle = document.getElementById('neon-trail-toggle');
    const neonColorPicker = document.getElementById('neon-color-picker');
    const arEffectsToggle = document.getElementById('ar-effects-toggle');
    const arShapePicker = document.getElementById('ar-shape-picker');
    const selectFilter = document.getElementById('select-filter');
    const btnClearDrawings = document.getElementById('btn-clear-drawings');

    // --- Camera Init ---
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } 
            });
            video.srcObject = stream;
            
            video.onloadedmetadata = () => {
                video.play();
                initCanvases();
            };
        } catch (err) {
            console.error("Camera access denied or error:", err);
            alert("Kamera erişimine izin vermeniz gerekiyor!");
        }
    }
    startCamera();

    // --- State ---
    const steamCanvas = document.getElementById('interactive-steam-canvas');
    const neonCanvas = document.getElementById('interactive-neon-canvas');
    const arCanvas = document.getElementById('interactive-ar-canvas');
    const stickerCanvas = document.getElementById('interactive-sticker-canvas');
    
    let steamCtx = null;
    let neonCtx = null;
    let arCtx = null;
    let stickerCtx = null;

    let steamActive = false;
    let swipeActive = false;
    let palmActive = false;
    let neonActive = false;
    let arActive = false;

    let prevIndexX = -1;
    let prevIndexY = -1;
    let prevWristX = -1;
    let swipeCooldown = 0;
    
    let isCountingDown = false;
    let isTakingPhotos = false;

    // ML Models
    let hands = null;
    let faceMesh = null;

    function initCanvases() {
        [steamCanvas, neonCanvas, arCanvas, stickerCanvas].forEach(canvas => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        });

        steamCtx = steamCanvas.getContext('2d');
        neonCtx = neonCanvas.getContext('2d');
        arCtx = arCanvas.getContext('2d');
        stickerCtx = stickerCanvas.getContext('2d');
    }

    function initSteamCanvas() {
        steamCanvas.style.display = 'block';
        steamCtx.globalCompositeOperation = 'source-over';
        steamCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        steamCtx.fillRect(0, 0, steamCanvas.width, steamCanvas.height);
        
        steamCtx.globalCompositeOperation = 'destination-out';
        steamCtx.lineWidth = 60;
        steamCtx.lineCap = 'round';
        steamCtx.lineJoin = 'round';
        steamCtx.strokeStyle = 'rgba(0,0,0,1)';
        prevIndexX = -1;
        prevIndexY = -1;
    }

    // Toggle Listeners
    steamToggle.addEventListener('change', (e) => {
        steamActive = e.target.checked;
        if (steamActive) {
            initSteamCanvas();
            checkAndInitModels();
        } else {
            steamCanvas.style.display = 'none';
        }
    });

    swipeFilterToggle.addEventListener('change', (e) => { swipeActive = e.target.checked; checkAndInitModels(); });
    palmCaptureToggle.addEventListener('change', (e) => { palmActive = e.target.checked; checkAndInitModels(); });
    
    neonTrailToggle.addEventListener('change', (e) => { 
        neonActive = e.target.checked; 
        checkAndInitModels(); 
    });

    arEffectsToggle.addEventListener('change', (e) => {
        arActive = e.target.checked;
        checkAndInitModels();
    });

    function getCanvasFilter(filterType) {
        switch(filterType) {
            case 'vintage-bw': return 'grayscale(100%) contrast(140%) brightness(90%)';
            case 'sepia-warm': return 'sepia(70%) contrast(110%) brightness(105%) saturate(120%)';
            case 'retro-fade': return 'sepia(40%) contrast(90%) brightness(110%) saturate(80%)';
            case 'cool-film': return 'hue-rotate(180deg) saturate(70%) brightness(105%) contrast(110%)';
            case 'dramatic': return 'contrast(180%) saturate(130%) brightness(95%)';
            case 'soft-glow': return 'sepia(20%) brightness(110%) blur(0.4px)';
            case 'none': 
            default: return 'none';
        }
    }

    if(selectFilter) {
        selectFilter.addEventListener('change', (e) => {
            const filterVal = e.target.value;
            video.style.filter = getCanvasFilter(filterVal);
        });
    }

    btnClearDrawings.addEventListener('click', () => {
        if(neonCtx) neonCtx.clearRect(0,0,neonCanvas.width, neonCanvas.height);
        if(arCtx) arCtx.clearRect(0,0,arCanvas.width, arCanvas.height);
        if(steamActive && steamCtx) initSteamCanvas();
    });

    // --- ML Initialization ---
    let modelsInitializing = false;
    async function checkAndInitModels() {
        const needsHands = steamActive || swipeActive || palmActive || neonActive || arActive;
        const needsFace = arActive;

        if (needsHands && !hands && !modelsInitializing) {
            modelsInitializing = true;
            
            hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
            hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            hands.onResults(onHandResults);

            if (needsFace && !faceMesh) {
                faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
                faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
                faceMesh.onResults(onFaceResults);
            }

            const sendFrames = async () => {
                if (video.videoWidth > 0 && !isTakingPhotos) {
                    if(needsHands) await hands.send({image: video});
                    if(needsFace && faceMesh) await faceMesh.send({image: video});
                }
                requestAnimationFrame(sendFrames);
            };
            sendFrames();
            modelsInitializing = false;
        } else if (needsFace && !faceMesh && !modelsInitializing) {
            modelsInitializing = true;
            faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
            faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            faceMesh.onResults(onFaceResults);
            modelsInitializing = false;
        }
    }

    // --- Drawing Helpers ---
    function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }

    function drawHeart(ctx, fromx, fromy, lw, hlen, color) {
        var x = fromx;
        var y = fromy;
        var width = lw ;
        var height = hlen;

        ctx.save();
        ctx.beginPath();
        var topCurveHeight = height * 0.3;
        ctx.moveTo(x, y + topCurveHeight);
        ctx.bezierCurveTo(
            x, y, 
            x - width / 2, y, 
            x - width / 2, y + topCurveHeight
        );
        ctx.bezierCurveTo(
            x - width / 2, y + (height + topCurveHeight) / 2, 
            x, y + (height + topCurveHeight) / 2, 
            x, y + height
        );
        ctx.bezierCurveTo(
            x, y + (height + topCurveHeight) / 2, 
            x + width / 2, y + (height + topCurveHeight) / 2, 
            x + width / 2, y + topCurveHeight
        );
        ctx.bezierCurveTo(
            x + width / 2, y, 
            x, y, 
            x, y + topCurveHeight
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    // --- Hand Tracking Processing ---
    function onHandResults(results) {
        const now = Date.now();

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const indexFingerTip = landmarks[8];
            const x = (1 - indexFingerTip.x) * video.videoWidth;
            const y = indexFingerTip.y * video.videoHeight;

            // 1. Steam Eraser
            if (steamActive && steamCtx) {
                steamCtx.beginPath();
                if (prevIndexX === -1) steamCtx.moveTo(x, y);
                else steamCtx.moveTo(prevIndexX, prevIndexY);
                steamCtx.lineTo(x, y);
                steamCtx.stroke();
            }

            // 2. Permanent Neon Trail
            if (neonActive && neonCtx) {
                neonCtx.beginPath();
                if (prevIndexX === -1) neonCtx.moveTo(x, y);
                else neonCtx.moveTo(prevIndexX, prevIndexY);
                neonCtx.lineTo(x, y);
                
                neonCtx.strokeStyle = neonColorPicker.value;
                neonCtx.lineWidth = 10;
                neonCtx.lineCap = 'round';
                neonCtx.shadowBlur = 15;
                neonCtx.shadowColor = neonColorPicker.value;
                neonCtx.stroke();
            }

            prevIndexX = x;
            prevIndexY = y;

            // 3. AR Hand Shapes (Permanent drawing)
            if (arActive && arCtx) {
                // Drawing on index finger tip with the selected shape
                const shape = arShapePicker.value;
                // Only draw if finger is moving to avoid blobs
                if(Math.random() > 0.6) { // Draw sparsely so shapes are distinguishable
                    if (shape === 'star') {
                        arCtx.fillStyle = 'yellow';
                        drawStar(arCtx, x, y, 5, 12, 5);
                        arCtx.fill();
                    } else if (shape === 'heart') {
                        drawHeart(arCtx, x, y-10, 20, 20, 'red');
                    } else if (shape === 'circle') {
                        arCtx.beginPath();
                        arCtx.arc(x, y, 10, 0, 2 * Math.PI);
                        arCtx.fillStyle = neonColorPicker.value || 'red';
                        arCtx.fill();
                    }
                }
            }

            // 4. Palm Capture with 3s Countdown
            if (palmActive && !isCountingDown && !isTakingPhotos) {
                const isIndexOpen = landmarks[8].y < landmarks[6].y;
                const isMiddleOpen = landmarks[12].y < landmarks[10].y;
                const isRingOpen = landmarks[16].y < landmarks[14].y;
                const isPinkyOpen = landmarks[20].y < landmarks[18].y;
                
                if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) {
                    startCountdown();
                }
            }

            // 5. Swipe Filter
            if (swipeActive && now >= swipeCooldown) {
                const wristX = landmarks[0].x;
                if (prevWristX !== -1) {
                    const deltaX = wristX - prevWristX;
                    if (Math.abs(deltaX) > 0.08) { 
                        let idx = selectFilter.selectedIndex;
                        if (deltaX > 0) idx = (idx + 1) % selectFilter.options.length; // Right
                        else idx = (idx - 1 + selectFilter.options.length) % selectFilter.options.length; // Left
                        
                        selectFilter.selectedIndex = idx;
                        selectFilter.dispatchEvent(new Event('change'));
                        swipeCooldown = now + 1000; 
                        prevWristX = -1;
                        return;
                    }
                }
                prevWristX = wristX;
            }

        } else {
            prevIndexX = -1;
            prevIndexY = -1;
            prevWristX = -1;
        }
    }

    // --- Face Tracking Processing ---
    function onFaceResults(results) {
        if (!arActive || !arCtx) return;
        
        // Let's clear ONLY the nose so it doesn't leave a trail, but we can't easily clear just the nose without wiping hand drawings.
        // For simplicity as requested, the nose will ALSO leave a permanent trail, or we can just draw it permanently.
        // Wait, "ar kalıcı iz" means we leave a trail. Let's just draw it permanently!
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            const noseTip = landmarks[4];
            const nx = (1 - noseTip.x) * video.videoWidth;
            const ny = noseTip.y * video.videoHeight;
            
            if(Math.random() > 0.8) {
                arCtx.beginPath();
                arCtx.arc(nx, ny, 15, 0, 2 * Math.PI);
                arCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                arCtx.fill();
            }
        }
    }

    // --- Countdown Logic ---
    function startCountdown() {
        if(isCountingDown) return;
        isCountingDown = true;
        countdownEl.style.display = 'block';
        
        let count = 3;
        countdownEl.textContent = count;
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.textContent = count;
            } else if (count === 0) {
                countdownEl.textContent = "GÜLÜMSE!";
            } else {
                clearInterval(interval);
                countdownEl.style.display = 'none';
                isCountingDown = false;
                btnSnap.click();
            }
        }, 1000);
    }

    // --- Templates in Screen 2 ---
    const templateGrid = document.getElementById('template-selection-grid');
    let activeTemplateFile = null;
    let templateConfig = {};
    
    // Load config
    fetch('assets/template_config.json?v=' + Date.now())
        .then(response => response.json())
        .then(data => {
            templateConfig = data;
            
            // Sadece tekli slotu olanları filtrele (örneğin you! (16).png)
            const singleSlotTemplates = Object.keys(data).filter(filename => data[filename].slots.length === 1);
            
            singleSlotTemplates.forEach(filename => {
                const img = document.createElement('img');
                img.src = `assets/${filename}`;
                img.style.width = '100%';
                img.style.cursor = 'pointer';
                img.style.borderRadius = '5px';
                img.style.border = '2px solid transparent';
                img.style.transition = '0.2s';
                
                img.addEventListener('click', () => {
                    // Reset borders
                    Array.from(templateGrid.children).forEach(child => child.style.borderColor = 'transparent');
                    img.style.borderColor = '#8fa071';
                    
                    activeTemplateFile = filename;
                    renderFinalComposition();
                });
                
                templateGrid.appendChild(img);
            });
        }).catch(err => console.error("Template config yüklenemedi:", err));


    // Raw photo capture data
    let capturedPhotoData = null;

    // --- Transition to Screen 2 (Capture Composition) ---
    btnSnap.addEventListener('click', () => {
        if(video.videoWidth === 0) return;
        isTakingPhotos = true;

        // Geçici bir canvas'a ham fotoğrafı + çizimleri çiz
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 1. Draw mirrored video
        tempCtx.save();
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
        
        const filterVal = selectFilter ? selectFilter.value : 'none';
        tempCtx.filter = getCanvasFilter(filterVal);
        
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        
        tempCtx.filter = 'none'; // reset filter
        tempCtx.restore();

        // 2. Composite canvases in order
        if (steamActive) tempCtx.drawImage(steamCanvas, 0, 0);
        if (neonActive) tempCtx.drawImage(neonCanvas, 0, 0);
        if (arActive) tempCtx.drawImage(arCanvas, 0, 0);
        if (stickerCtx) tempCtx.drawImage(stickerCanvas, 0, 0);
        
        // Save the raw flattened photo
        capturedPhotoData = tempCanvas;

        // Draw it to the preview canvas first (without template)
        renderFinalComposition();

        // Apply same CSS filter class to the preview canvas wrapper
        if(selectFilter) {
            previewCanvas.className = '';
            if (selectFilter.value !== 'none') previewCanvas.classList.add(selectFilter.value);
        }

        // Transition Screen
        screen1.classList.remove('active-screen');
        screen2.classList.add('active-screen');
    });

    function renderFinalComposition() {
        if(!capturedPhotoData) return;
        
        // If a template is selected, we must draw the template and place the photo into its slot.
        if (activeTemplateFile && templateConfig[activeTemplateFile]) {
            const slot = templateConfig[activeTemplateFile].slots[0];
            const bgImg = new Image();
            bgImg.src = `assets/${activeTemplateFile}`;
            
            bgImg.onload = () => {
                previewCanvas.width = bgImg.width;
                previewCanvas.height = bgImg.height;
                const pCtx = previewCanvas.getContext('2d');
                
                pCtx.clearRect(0,0, previewCanvas.width, previewCanvas.height);
                
                // We need to scale & crop the photo to fit the slot
                const scale = Math.max(slot.width / capturedPhotoData.width, slot.height / capturedPhotoData.height);
                const scaledWidth = capturedPhotoData.width * scale;
                const scaledHeight = capturedPhotoData.height * scale;
                
                pCtx.save();
                pCtx.translate(slot.cx, slot.cy);
                if (slot.angle) pCtx.rotate(slot.angle * Math.PI / 180);
                
                pCtx.beginPath();
                pCtx.rect(-slot.width/2, -slot.height/2, slot.width, slot.height);
                pCtx.clip();
                
                pCtx.drawImage(capturedPhotoData, -scaledWidth/2, -scaledHeight/2, scaledWidth, scaledHeight);
                pCtx.restore();

                // Draw background template OVER the photo to seal the transparent hole perfectly
                pCtx.drawImage(bgImg, 0, 0);

                // Draw emojis over the composition
                drawScreen2Stickers(pCtx);
            };
        } else {
            // No template, just draw the raw photo
            previewCanvas.width = capturedPhotoData.width;
            previewCanvas.height = capturedPhotoData.height;
            const pCtx = previewCanvas.getContext('2d');
            pCtx.drawImage(capturedPhotoData, 0, 0);

            // Draw emojis over the photo
            drawScreen2Stickers(pCtx);
        }
    }

    function drawScreen2Stickers(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        screen2Stickers.forEach(sticker => {
            ctx.save();
            ctx.translate(sticker.x, sticker.y);
            ctx.rotate(sticker.rot);
            ctx.font = `${sticker.size}px Arial`;
            ctx.fillText(sticker.emoji, 0, 0);
            ctx.restore();
        });
    }

    // --- Retake Action ---
    const btnRetake = document.getElementById('btn-retake');
    btnRetake.addEventListener('click', () => {
        isTakingPhotos = false;
        activeTemplateFile = null;
        capturedPhotoData = null;
        screen2Stickers = []; // Reset stickers
        
        // Reset template selection UI
        Array.from(templateGrid.children).forEach(child => child.style.borderColor = 'transparent');
        
        screen2.classList.remove('active-screen');
        screen1.classList.add('active-screen');
    });

    // --- Sticker / Meme Logic ---
    const memeItems = document.querySelectorAll('.meme-item');
    memeItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (!stickerCtx) return;
            const img = new Image();
            img.src = e.target.src;
            img.onload = () => {
                // Draw sticker at a random position near the center
                const maxW = stickerCanvas.width;
                const maxH = stickerCanvas.height;
                const size = Math.min(maxW, maxH) * 0.3; // 30% of screen size
                
                const offsetX = (maxW / 2) + (Math.random() - 0.5) * (maxW * 0.4) - (size / 2);
                const offsetY = (maxH / 2) + (Math.random() - 0.5) * (maxH * 0.4) - (size / 2);
                
                const rot = (Math.random() - 0.5) * 0.5; // slight random rotation
                
                stickerCtx.save();
                stickerCtx.translate(offsetX + size/2, offsetY + size/2);
                stickerCtx.rotate(rot);
                stickerCtx.drawImage(img, -size/2, -size/2, size, size);
                stickerCtx.restore();
            };
        });
    });

    // --- Screen 2 Emoji Stickers Logic ---
    let screen2Stickers = [];
    const stickerItems = document.querySelectorAll('.sticker-item');
    stickerItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const emoji = e.target.textContent;
            
            const maxW = previewCanvas.width || 1080;
            const maxH = previewCanvas.height || 1080;
            
            screen2Stickers.push({
                emoji: emoji,
                x: (maxW / 2) + (Math.random() - 0.5) * (maxW * 0.6),
                y: (maxH / 2) + (Math.random() - 0.5) * (maxH * 0.6),
                rot: (Math.random() - 0.5) * 1.0,
                size: Math.min(maxW, maxH) * 0.15
            });
            
            renderFinalComposition();
        });
    });

    // --- Clear Screen Button ---
    const btnClearDrawings = document.getElementById('btn-clear-drawings');
    if (btnClearDrawings) {
        btnClearDrawings.addEventListener('click', () => {
            if (neonCtx) neonCtx.clearRect(0, 0, neonCanvas.width, neonCanvas.height);
            if (arCtx) arCtx.clearRect(0, 0, arCanvas.width, arCanvas.height);
            if (stickerCtx) stickerCtx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
        });
    }

});
