document.addEventListener('DOMContentLoaded', () => {
    const idleScreen = document.getElementById('idle-screen-trigger');
    const interactiveScreen = document.getElementById('interactive-screen');
    const curtainClickZone = document.getElementById('curtain-click-zone');
    
    const video = document.getElementById('video-feed');
    const btnTakePhoto = document.getElementById('btn-take-photo');
    const btnPose = document.getElementById('btn-pose-inspiration');
    const countdownEl = document.getElementById('countdown');
    const flashEl = document.getElementById('flash-overlay');
    const thumbnailsGrid = document.getElementById('template-thumbnails-grid');
    const selectFilter = document.getElementById('select-filter');
    
    const canvas = document.getElementById('photostrip-canvas');
    const ctx = canvas.getContext('2d');
    const printedPhoto = document.getElementById('printed-photo');
    const actionButtons = document.getElementById('post-capture-actions');
    const btnDownload = document.getElementById('btn-download');
    const btnRestart = document.getElementById('btn-restart');

    let stream = null;
    let isTakingPhotos = false;
    let capturedPhotos = [];
    let activeTemplate = "you! (1).png"; 
    // Şablon tiplerine göre pencere sayıları ve canvas koordinat haritası
    // Sadece gerçekten tekli olanlar:
    const singleTemplates = []; 
    // Geri kalan 1'den 14'e kadar (8 hariç) hepsi geleneksel 3'lü şerit (strip)
    const stripTemplates = ["you! (1).png", "you! (2).png", "you! (3).png", "you! (4).png", "you! (5).png", "you! (6).png", "you! (7).png", "you! (9).png", "you! (10).png", "you! (11).png", "you! (12).png", "you! (13).png", "you! (14).png"];

    let templateConfigs = {};
    
    // Load config from JSON file synchronously before usage or dynamically
    fetch('assets/template_config.json')
        .then(response => response.json())
        .then(data => {
            for (let key in data) {
                templateConfigs[key] = {
                    count: data[key].slots.length,
                    slots: data[key].slots
                };
            }
        })
        .catch(err => console.error("Error loading template_config.json:", err));

    // Meme Gösterim Mantığı
    const memes = ["mm.jpeg", "mm1.jpeg", "mm2.jpeg", "mm3.jpeg", "mm4.jpeg", "mm5.jpeg", "mm6.jpeg", "mm7.jpeg", "mm8.jpeg", "mm9.jpeg"];
    const memeContainer = document.getElementById('meme-display-container');
    const memeImg = document.getElementById('meme-display');
    
    btnPose.addEventListener('click', () => {
        const randomMeme = memes[Math.floor(Math.random() * memes.length)];
        memeImg.src = `assets/meme/${randomMeme}`;
        memeContainer.style.display = 'block';
        setTimeout(() => {
            memeContainer.style.display = 'none';
        }, 6000); // 6 saniye ekranda kalsın
    });

    // 21 adet şablon görselini hatasız yükleyen döngü
    const totalTemplates = 21;
    function renderThumbnails() {
        thumbnailsGrid.innerHTML = "";
        for(let i = 1; i <= totalTemplates; i++) {
            const imgName = `you! (${i}).png`;
            const img = document.createElement('img');
            img.src = `assets/${encodeRawPath(imgName)}`;
            img.className = 'template-thumb';
            if(imgName === activeTemplate) img.classList.add('selected');
            
            img.addEventListener('click', () => {
                document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('selected'));
                img.classList.add('selected');
                activeTemplate = imgName;
            });
            thumbnailsGrid.appendChild(img);
        }
    }

    // Dosya adlarındaki özel karakterleri tarayıcı için encode etme fonksiyonu
    function encodeRawPath(path) {
        return path.replace(/ /g, '%20').replace(/!/g, '%21');
    }

    // Birinci Aşama Tıklama Aksiyonu
    const introVideoContainer = document.getElementById('video-intro-container');
    const introVideo = document.getElementById('intro-video');

    curtainClickZone.addEventListener('click', () => {
        // 1. Idle ekranı gizle
        idleScreen.style.display = 'none';
        
        // 2. Video ekranını göster ve başlat
        introVideoContainer.style.display = 'block';
        introVideo.play().catch(e => {
            console.error("Video play failed:", e);
            // Fallback: If video fails, transition immediately
            transitionToMainUI();
        });
    });

    // 3. Video bitince ana UI'a geçiş yap
    introVideo.addEventListener('ended', () => {
        transitionToMainUI();
    });

    function transitionToMainUI() {
        document.body.classList.remove('idle-mode');
        introVideoContainer.style.display = 'none';
        interactiveScreen.style.display = 'flex';
        interactiveScreen.classList.add('fade-in-ui');
        
        // 4. Kamera başlat (video bittiğinde / arayüz açıldığında)
        initCamera();
        renderThumbnails();
    }

    async function initCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 1080, height: 1080, facingMode: "user" } 
            });
            video.srcObject = stream;
        } catch (err) {
            console.error("Webcam akışı başlatılamadı:", err);
        }
    }

    // Çekim Akış Yönetimi
    btnTakePhoto.addEventListener('click', async () => {
        if (isTakingPhotos) return;
        isTakingPhotos = true;
        capturedPhotos = [];
        
        printedPhoto.classList.remove('printing');
        actionButtons.style.display = 'none';
        btnTakePhoto.disabled = true;

        // Config'i dinamik olarak al, bulamazsa varsayılanı kullan
        let config = templateConfigs[activeTemplate];
        if(!config) {
            console.warn("Config bulunamadı:", activeTemplate, "Varsayılan (3'lü) kullanılıyor.");
            config = { count: 3, slots: [
                { x: 90, y: 150, width: 900, height: 350 },
                { x: 90, y: 520, width: 900, height: 350 },
                { x: 90, y: 890, width: 900, height: 350 }
            ]};
        }
        
        for (let i = 0; i < config.count; i++) {
            btnTakePhoto.innerText = `CAPTURING ${i+1}/${config.count}`;
            await doCountdown();
            flashScreen();
            captureFrame();
            await new Promise(r => setTimeout(r, 600));
        }
        
        btnTakePhoto.innerText = "PROCESSING...";
        await mergeAndPrint(config);
        
        btnTakePhoto.disabled = false;
        btnTakePhoto.innerText = "TAKE PHOTO";
        isTakingPhotos = false;
    });

    function doCountdown() {
        return new Promise((resolve) => {
            let count = 3;
            countdownEl.innerText = count;
            countdownEl.classList.add('active');
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownEl.innerText = count;
                } else {
                    clearInterval(timer);
                    countdownEl.classList.remove('active');
                    resolve();
                }
            }, 1000);
        });
    }

    function flashScreen() {
        flashEl.classList.add('active');
        setTimeout(() => flashEl.classList.remove('active'), 150);
    }

    function captureFrame() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth || 640;
        tempCanvas.height = video.videoHeight || 640;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(video, 0, 0);
        
        capturedPhotos.push(tempCanvas);
    }

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

    selectFilter.addEventListener('change', () => {
        video.style.filter = getCanvasFilter(selectFilter.value);
    });

    async function mergeAndPrint(config) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Maksimum resim kalitesi
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Filtre Eşleme Kontrolü
        ctx.filter = getCanvasFilter(selectFilter.value);

        // Görselleri şablon koordinatlarına göre ortalayarak (Center-Crop) kırpıp tuvale çizme
        for (let i = 0; i < config.count; i++) {
            if (capturedPhotos[i]) {
                const slot = config.slots[i];
                const img = capturedPhotos[i];
                
                const slotAspect = slot.width / slot.height;
                const imgAspect = img.width / img.height;
                let sWidth, sHeight, sx, sy;

                if (imgAspect > slotAspect) {
                    sHeight = img.height;
                    sWidth = sHeight * slotAspect;
                    sx = (img.width - sWidth) / 2;
                    sy = 0;
                } else {
                    sWidth = img.width;
                    sHeight = sWidth / slotAspect;
                    sx = 0;
                    sy = (img.height - sHeight) / 2;
                }

                ctx.save();
                ctx.translate(slot.cx, slot.cy);
                if (slot.angle) {
                    ctx.rotate(slot.angle * Math.PI / 180);
                }
                
                ctx.drawImage(
                    img, 
                    Math.round(sx), Math.round(sy), Math.round(sWidth), Math.round(sHeight), 
                    -slot.width / 2, -slot.height / 2, slot.width, slot.height
                );
                ctx.restore();
            }
        }

        ctx.filter = 'none';

        // PNG Şablon Çerçevesini En Üst Katmana Mühürleme
        try {
            const templateImg = await new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = `assets/${encodeRawPath(activeTemplate)}`;
            });
            ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error("Template katmanı çizilemedi:", e);
        }

        // Çıktıyı görsel haline getirme ve animasyonu başlatma
        const finalDataURL = canvas.toDataURL('image/png');
        printedPhoto.src = finalDataURL;
        
        // Önce sınıfı temizle ki animasyon tekrar tetiklenebilsin
        printedPhoto.classList.remove('printing');
        
        // Küçük bir gecikmeyle kaydırma animasyonunu başlat
        setTimeout(() => {
            printedPhoto.classList.add('printing');
            
            // Animasyon bittikten sonra (örn: 3.5 saniye sonra) alt butonları göster
            setTimeout(() => {
                actionButtons.style.display = 'flex';
            }, 3500);
        }, 100);
    }

    // İndirme mekanizması
    btnDownload.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `photostrip-${Date.now()}.png`;
        link.href = printedPhoto.src;
        link.click();
    });

    // Yeniden Çekim Sıfırlaması
    btnRestart.addEventListener('click', () => {
        printedPhoto.classList.remove('printing');
        printedPhoto.src = "";
        actionButtons.style.display = 'none';
    });

    // --- Steam / Fog Window Feature ---
    let steamActive = false;
    let hands = null;
    let steamCtx = null;
    let steamCanvas = document.getElementById('steam-canvas');
    let btnInfo = document.getElementById('btn-info');
    
    let prevIndexX = -1;
    let prevIndexY = -1;
    
    // Setup canvas
    function initSteamCanvas() {
        steamCanvas.width = video.videoWidth || 640;
        steamCanvas.height = video.videoHeight || 640;
        steamCanvas.style.display = 'block';
        steamCtx = steamCanvas.getContext('2d');
        
        // Fill canvas with semi-transparent white fog
        steamCtx.globalCompositeOperation = 'source-over';
        steamCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        steamCtx.fillRect(0, 0, steamCanvas.width, steamCanvas.height);
        
        // Switch to destination-out for true erasing
        steamCtx.globalCompositeOperation = 'destination-out';
        steamCtx.lineWidth = 60;
        steamCtx.lineCap = 'round';
        steamCtx.lineJoin = 'round';
        steamCtx.strokeStyle = 'rgba(0,0,0,1)';
        
        // Reset stroke state
        prevIndexX = -1;
        prevIndexY = -1;
    }

    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            steamActive = !steamActive;
            if (steamActive) {
                btnInfo.classList.add('selected');
                btnInfo.style.backgroundColor = '#7c6853';
                btnInfo.style.color = '#fff';
                
                initSteamCanvas();
                if (!hands && typeof Hands !== 'undefined') {
                    initHandTracking();
                }
            } else {
                btnInfo.classList.remove('selected');
                btnInfo.style.backgroundColor = '';
                btnInfo.style.color = '';
                steamCanvas.style.display = 'none';
            }
        });
    }

    async function initHandTracking() {
        hands = new Hands({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }});
        
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });
        
        hands.onResults(onHandResults);

        // Start processing video frames
        processHandTrackingFrame();
    }

    async function processHandTrackingFrame() {
        if (hands && video.videoWidth > 0 && !isTakingPhotos) {
            // Only send frames if steam mode is active
            if (steamActive) {
                await hands.send({image: video});
            }
        }
        requestAnimationFrame(processHandTrackingFrame);
    }

    function onHandResults(results) {
        if (!steamActive || isTakingPhotos || !steamCtx) return;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Get index fingertip landmark (8)
            const indexFingerTip = landmarks[8];
            
            // Map coordinates and flip X because video is mirrored visually
            const x = (1 - indexFingerTip.x) * steamCanvas.width;
            const y = indexFingerTip.y * steamCanvas.height;
            
            steamCtx.beginPath();
            if (prevIndexX === -1) {
                steamCtx.moveTo(x, y);
            } else {
                steamCtx.moveTo(prevIndexX, prevIndexY);
            }
            steamCtx.lineTo(x, y);
            steamCtx.stroke();
            
            prevIndexX = x;
            prevIndexY = y;
        } else {
            // Finger tracking lost; reset stroke to avoid jumping lines when it reconnects
            prevIndexX = -1;
            prevIndexY = -1;
        }
    }
});
